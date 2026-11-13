import type { Request, Response } from "express";
import rateLimit, { MemoryStore, type Options, type RateLimitRequestHandler } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import type { SendCommandFn } from "rate-limit-redis";

/**
 * P2 — authentication rate limiting.
 *
 * Two layers:
 *
 *  1. IP-based fixed-window limits on every authentication endpoint
 *     (`ipLimiter`), so a single client cannot brute-force at scale.
 *  2. Per-email account throttling (`accountLimiter`): progressive lockout
 *     after repeated FAILED attempts for the same account, regardless of which
 *     IP the attempt came from. Counters are reset on successful login.
 *
 * When REDIS_URL is configured the counters are shared through Redis so the
 * limits hold across horizontally-scaled API instances; otherwise the
 * in-process MemoryStore is used (single-instance deployments / tests).
 *
 * Generic failure messages are preserved — a 429 reads the same as any other
 * auth refusal from the attacker's point of view.
 */

let redisClient: import("ioredis").Redis | null | undefined;

async function getRedis(): Promise<import("ioredis").Redis | null> {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return redisClient;
  }
  // ioredis ships CJS; under NodeNext the module object itself is callable via
  // its `default` export. Cast narrowly and keep the client out of logs.
  const mod = (await import("ioredis")) as unknown as {
    default: new (url: string, opts: Record<string, unknown>) => import("ioredis").Redis;
  };
  redisClient = new mod.default(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
  redisClient.on("error", (err: Error) => {
    // Never print connection details that might include the URL.
    console.error("[rate-limit] redis store error:", err.message);
  });
  return redisClient;
}

/** Store factory: Redis when configured, in-memory otherwise. */
async function store(): Promise<RedisStore | undefined> {
  const client = await getRedis();
  if (!client) return undefined;
  const c = client;
  return new RedisStore({
    sendCommand: ((args: string[]) =>
      (c.sendCommand as unknown as (cmd: unknown) => Promise<unknown>)(args)) as unknown as SendCommandFn,
  });
}

/** 429 with a generic body, so rate-limited auth looks like other refusals. */
function handler(_req: Request, res: Response): void {
  res.status(429).json({ message: "Too many attempts. Please try again later." });
}

const windowMs = int_env("AUTH_RATE_WINDOW_MS", 15 * 60 * 1000);
const ipMax = int_env("AUTH_RATE_IP_MAX", 20);
const registerMax = int_env("AUTH_REGISTER_MAX", 10);

function int_env(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** IP-based limiter, shared by every auth endpoint. */
export async function ipLimiter(): Promise<RateLimitRequestHandler> {
  const opts: Partial<Options> = {
    windowMs,
    limit: ipMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler,
    skipSuccessfulRequests: true,
  };
  const s = await store();
  if (s) opts.store = s;
  return rateLimit(opts);
}

/**
 * Account (email) throttle with progressive lockout.
 *
 * Not a plain rate-limit bucket: failures increment a counter keyed by the
 * NORMALIZED email, and the caller decides what to do with the verdict.
 * `check(email)` returns `{ blocked, retryAfterSeconds, failures }`.
 * `fail(email)` records a failure; `success(email)` clears them.
 *
 * Progressive delay: after MAX_FAILURES the account is locked for a window
 * that grows with each additional failure (cap LOCK_WINDOW_CAP_MS) — repeated
 * abuse slows an attacker down without ever permanently locking a user.
 */
const MAX_FAILURES = 5;
const BASE_LOCK_MS = 60_000; // 1 minute after the 5th failure
const LOCK_WINDOW_CAP_MS = 15 * 60_000; // at most 15 minutes

interface AccountEntry {
  failures: number;
  lastFailureAt: number;
  lockedUntil: number;
}
const accounts = new Map<string, AccountEntry>();

export function normalizeEmail(email: unknown): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function accountThrottle() {
  return {
    /** Verdict for a login attempt on this account. */
    check(email: string): { blocked: boolean; retryAfterSeconds: number } {
      const entry = accounts.get(normalizeEmail(email));
      if (!entry) return { blocked: false, retryAfterSeconds: 0 };
      if (entry.lockedUntil > Date.now()) {
        return {
          blocked: true,
          retryAfterSeconds: Math.ceil((entry.lockedUntil - Date.now()) / 1000),
        };
      }
      return { blocked: false, retryAfterSeconds: 0 };
    },
    /** Records a failed attempt; arms the progressive lockout. */
    fail(email: string): void {
      const key = normalizeEmail(email);
      const entry = accounts.get(key) ?? { failures: 0, lastFailureAt: 0, lockedUntil: 0 };
      entry.failures += 1;
      entry.lastFailureAt = Date.now();
      if (entry.failures >= MAX_FAILURES) {
        const over = entry.failures - MAX_FAILURES;
        const lock = Math.min(BASE_LOCK_MS * Math.pow(2, over), LOCK_WINDOW_CAP_MS);
        entry.lockedUntil = Date.now() + lock;
      }
      accounts.set(key, entry);
    },
    /** Successful authentication clears the counters (never punishes success). */
    success(email: string): void {
      accounts.delete(normalizeEmail(email));
    },
    /** Test/ops hook. */
    reset(): void {
      accounts.clear();
    },
  };
}

export const accountThrottling = accountThrottle();

/**
 * Registers a failed-auth response on the account throttle.
 * Call from every authentication controller after a bad credential.
 */
export function recordAuthFailure(email: string): void {
  accountThrottling.fail(email);
}

/** Records a successful authentication, resetting the account counters. */
export function recordAuthSuccess(email: string): void {
  accountThrottling.success(email);
}

/**
 * Registration throttle — stricter IP cap, since signup is unauthenticated.
 * Uses the same store so a clustered deployment shares the counter.
 */
export async function registerLimiter(): Promise<RateLimitRequestHandler> {
  const opts: Partial<Options> = {
    windowMs: 60 * 60 * 1000,
    limit: registerMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler,
  };
  const s = await store();
  if (s) opts.store = s;
  return rateLimit(opts);
}

export const rateLimitConfig = { windowMs, ipMax, registerMax, MAX_FAILURES };

// Lazily-created singletons so routers can attach the limiters synchronously.
let ipLimiterSingleton: RateLimitRequestHandler | null = null;
let registerLimiterSingleton: RateLimitRequestHandler | null = null;
// True once the async Redis store (if any) has been wired into the singletons.
let storesAttached = false;

/**
 * Attaches the shared Redis store (when REDIS_URL is set) to the singletons.
 * Called by createApp() BEFORE the first request so the limiters never run
 * with an implicitly-swapped store, and safe to call again (idempotent).
 */
export async function initRateLimitStores(): Promise<void> {
  if (storesAttached) return;
  storesAttached = true;
  const s = await store();
  if (!s) return;
  if (ipLimiterSingleton) ipLimiterSingleton = buildIpLimiter(s);
  if (registerLimiterSingleton) registerLimiterSingleton = buildRegisterLimiter(s);
}

// Distinct MemoryStore instances (express-rate-limit forbids sharing a store
// between limiters); exported handles so tests/ops can reset all buckets.
const ipMemoryStore = new MemoryStore();
const registerMemoryStore = new MemoryStore();

function buildIpLimiter(s?: RedisStore): RateLimitRequestHandler {
  const opts: Partial<Options> = {
    store: s ?? ipMemoryStore,
    windowMs,
    limit: ipMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler,
    // Built lazily on first request by design (synchronous mount); the advice
    // behind this validation does not apply here. trustProxy handling lives in
    // env.ts / app.ts, so it is not re-checked per limiter.
    validate: { trustProxy: false, creationStack: false },
  };
  if (s) opts.store = s;
  return rateLimit(opts);
}

function buildRegisterLimiter(s?: RedisStore): RateLimitRequestHandler {
  const opts: Partial<Options> = {
    store: s ?? registerMemoryStore,
    windowMs: 60 * 60 * 1000,
    limit: registerMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler,
    validate: { trustProxy: false, creationStack: false },
  };
  if (s) opts.store = s;
  return rateLimit(opts);
}

/** Test/ops hook: clears the in-memory IP limiter buckets. */
export async function resetIpLimits(): Promise<void> {
  await ipMemoryStore.resetAll();
  await registerMemoryStore.resetAll();
}

/** Mount-ready IP limiter; built once on first use. */
export function ensureIpLimiter(
  req: Parameters<RateLimitRequestHandler>[0],
  res: Parameters<RateLimitRequestHandler>[1],
  next: Parameters<RateLimitRequestHandler>[2],
): void {
  if (!ipLimiterSingleton) ipLimiterSingleton = buildIpLimiter(undefined);
  ipLimiterSingleton(req, res, next);
}

/** Mount-ready registration limiter (stricter hourly IP cap). */
export function ensureRegisterLimiter(
  req: Parameters<RateLimitRequestHandler>[0],
  res: Parameters<RateLimitRequestHandler>[1],
  next: Parameters<RateLimitRequestHandler>[2],
): void {
  if (!registerLimiterSingleton) registerLimiterSingleton = buildRegisterLimiter(undefined);
  registerLimiterSingleton(req, res, next);
}
