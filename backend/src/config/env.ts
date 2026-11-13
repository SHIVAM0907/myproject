import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));

// src/config -> src -> backend/
export const backendRoot = path.resolve(here, "..", "..");

dotenv.config({ path: path.join(backendRoot, ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, received "${raw}".`);
  }
  return parsed;
}

const nodeEnv = optional("NODE_ENV", "development");

// Read once, separately from the parsed allowlist, so `cors` can tell an
// explicitly configured CORS_ORIGINS apart from the built-in default.
const rawCorsOrigins = optional("CORS_ORIGINS", "");

const corsOrigins = (rawCorsOrigins || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const mongoUri = required("MONGODB_URI");

// ---------------------------------------------------------------- production
// Every rule below throws at startup — never logging the offending value — so
// a misconfigured deploy fails fast instead of running with weak secrets.
const isProd = nodeEnv === "production";

function hasR2CredentialsRaw(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET,
  );
}

const PLACEHOLDER_SECRETS = [
  "change-me",
  "changeme",
  "dev-employee-secret",
  "dev-platform-secret",
  "secret",
  "password",
  "placeholder",
];
const MIN_SECRET_LENGTH = 32;
function assertProductionSecret(name: string, value: string): void {
  if (!isProd) return;
  const lowered = value.toLowerCase();
  if (PLACEHOLDER_SECRETS.some((p) => lowered.includes(p))) {
    throw new Error(
      `${name} is still set to a placeholder value. Generate a strong random secret before deploying.`,
    );
  }
  if (value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters long in production.`,
    );
  }
}

// Production requires explicit CORS_ORIGINS: the dev loopback fallback must
// never silently widen the allowlist of a deployed API.
if (isProd && !rawCorsOrigins) {
  throw new Error(
    "CORS_ORIGINS is required in production (comma-separated allowed origins).",
  );
}
// Production uploads must land in R2; the backend/uploads fallback is a dev
// convenience and would lose files across restarts and replicas.
if (isProd && !hasR2CredentialsRaw()) {
  throw new Error(
    "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are all required in production.",
  );
}
if (isProd) {
  // Require a real database host: a localhost URI in a deployed container
  // would point the whole platform at the wrong (or a nonexistent) database.
  if (!/^mongodb(\+srv)?:\/\//i.test(mongoUri)) {
    throw new Error("MONGODB_URI must be a valid mongodb or mongodb+srv URI.");
  }
  if (/localhost|127\.0\.0\.1/i.test(mongoUri)) {
    throw new Error("MONGODB_URI must not point at localhost in production.");
  }
}

// TRUST_PROXY: the number of trusted proxy hops. In production it must be set
// explicitly — Express's default trusts nothing, but `true` would let any
// client forge its IP via X-Forwarded-For and defeat IP-based rate limits.
// Accepts a hop count or "loopback"; anything else is rejected.
const rawTrustProxy = process.env.TRUST_PROXY;
let trustProxy: number | "loopback" = 0; // dev default: direct connections, nothing trusted
if (rawTrustProxy !== undefined && rawTrustProxy !== "") {
  if (rawTrustProxy.trim().toLowerCase() === "loopback") {
    trustProxy = "loopback";
  } else {
    const hops = Number.parseInt(rawTrustProxy.trim(), 10);
    if (Number.isNaN(hops) || hops < 0 || String(hops) !== rawTrustProxy.trim()) {
      throw new Error('TRUST_PROXY must be a non-negative integer or "loopback".');
    }
    trustProxy = hops;
  }
} else if (isProd) {
  throw new Error(
    "TRUST_PROXY is required in production (number of trusted proxy hops, e.g. 1).",
  );
}

assertProductionSecret(
  "JWT_EMPLOYEE_SECRET",
  optional("JWT_EMPLOYEE_SECRET", "dev-employee-secret-change-me"),
);
assertProductionSecret(
  "JWT_PLATFORM_SECRET",
  optional("JWT_PLATFORM_SECRET", "dev-platform-secret-change-me"),
);

// The template ships a literal <db_password> marker. Connecting with it fails
// deep inside the driver with an unhelpful auth error, so catch it up front.
// A password that has merely been wrapped in angle brackets — <realpassword> —
// is the same failure dressed up as a real credential, so reject that too.
// (A URI with no credentials at all is legitimate — that's what a local
// mongod or the in-memory test server hands out.)
if (mongoUri.includes("<db_password>")) {
  throw new Error(
    "MONGODB_URI still contains the literal <db_password> placeholder. " +
      "Replace it with the real Atlas password (URL-encode any @ : / # characters) in backend/.env.",
  );
}

if (/<[^>]*>/.test(mongoUri)) {
  const marker = mongoUri.match(/<[^>]*>/)?.[0] ?? "";
  throw new Error(
    `MONGODB_URI contains an unresolved placeholder ${marker}. ` +
      "A real password must not be wrapped in angle brackets — Atlas rejects it " +
      "with 'bad auth : authentication failed'. Replace it with the real Atlas " +
      "password (URL-encode any @ : / # characters) in backend/.env.",
  );
}

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: int("PORT", 5001),

  mongoUri,

  jwt: {
    // Separate secrets so a platform token can never be replayed against the
    // employee subsystem and vice versa. The frontend keeps the two realms in
    // separate localStorage keys for exactly this reason.
    employeeSecret: optional("JWT_EMPLOYEE_SECRET", "dev-employee-secret-change-me"),
    platformSecret: optional("JWT_PLATFORM_SECRET", "dev-platform-secret-change-me"),
    // Short-lived access tokens (P5). The old default of 7d is kept only for
    // dev convenience; production validation refuses long-lived access tokens.
    expiresIn: optional("JWT_EXPIRES_IN", "15m"),
    platformExpiresIn: optional("JWT_PLATFORM_EXPIRES_IN", "15m"),
  },

  // Server-side token-version invalidation (P5): bumping tokenVersion on the
  // Employee record invalidates every token minted before it — logout,
  // logout-all, password change and suspension all go through this.
  trustProxy,

  cors: {
    // In dev the Vite proxy forwards /api, so the browser never needs CORS.
    // These origins keep direct calls (curl, a separately hosted frontend) working.
    //
    // The dev server does not always get 5173: if that port is taken Vite takes
    // the next free one, and the browser then sends a different Origin. Rather
    // than chase that with a wider hardcoded list, `devAllowLoopback` lets any
    // loopback port through when CORS_ORIGINS is unset *and* NODE_ENV is not
    // production. Loopback-only, so this cannot widen the allowlist for a real
    // deployment; setting CORS_ORIGINS explicitly keeps the strict behaviour
    // either way.
    origins: corsOrigins,
    devAllowLoopback: !rawCorsOrigins && nodeEnv !== "production",
  },

  upload: {
    // R2 is the intended store. When credentials are absent the upload routes
    // fall back to serving files from backend/uploads so the app works in dev.
    r2: {
      accountId: optional("R2_ACCOUNT_ID"),
      accessKeyId: optional("R2_ACCESS_KEY_ID"),
      secretAccessKey: optional("R2_SECRET_ACCESS_KEY"),
      bucket: optional("R2_BUCKET"),
      endpoint: optional("R2_ENDPOINT"),
    },
    maxFileBytes: int("UPLOAD_MAX_BYTES", 2 * 1024 * 1024),
    signedUrlTtlSeconds: int("UPLOAD_SIGNED_URL_TTL", 300),
    localDir: optional("UPLOAD_LOCAL_DIR", path.join(backendRoot, "uploads")),
    // Base URL the browser uses for the local fallback store.
    localBaseUrl: optional("UPLOAD_LOCAL_BASE_URL", ""),
  },

  seed: {
    managerPassword: optional("SEED_MANAGER_PASSWORD", "Manager@123"),
    employeePassword: optional("SEED_EMPLOYEE_PASSWORD", "Employee@123"),
    // The platform/admin account is a separate user from the team manager, so
    // signing in to /admin and signing in to /manager are different credentials.
    adminEmail: optional("SEED_ADMIN_EMAIL", "admin@learnilm.test").toLowerCase(),
    adminPassword: optional("SEED_ADMIN_PASSWORD", "Admin@123"),
    adminName: optional("SEED_ADMIN_NAME", "Platform Administrator"),
  },

  timezone: {
    // P6: the company's IANA timezone. All dayKeys, month windows and shift
    // boundaries are computed in this zone rather than the server's local zone,
    // so a UTC container and a Kolkata office agree on what "today" is.
    companyTz: optional("COMPANY_TIMEZONE", "Asia/Kolkata"),
    // Shift configuration (24h clock in the company timezone).
    shiftStart: optional("SHIFT_START", "09:00"),
    shiftEnd: optional("SHIFT_END", "18:00"),
    lateGraceMinutes: int("LATE_GRACE_MINUTES", 15),
  },

  features: {
// Auto-seeds a demo manager + employees on boot when the DB is empty.
    // Default flips to false in production: automatic dev seeding must never
    // create Manager@123 / Admin@123 accounts on a deployed database.
    seedOnStart: bool("SEED_ON_START", !isProd),
  },
};

// Company timezone must be a valid IANA identifier.
if (!isValidIANATimezone(env.timezone.companyTz)) {
  throw new Error(
    `COMPANY_TIMEZONE must be a valid IANA timezone identifier, received a value that is not.`,
  );
}

// Production must refuse automatic development seeding outright.
if (isProd && env.features.seedOnStart) {
  throw new Error(
    "SEED_ON_START must be false in production. Automatic development seeding " +
      "would create default Manager@123 / Admin@123 accounts on a deployed database.",
  );
}
// Production must not ship long-lived access tokens.
if (isProd && (env.jwt.expiresIn === "7d" || env.jwt.platformExpiresIn === "7d")) {
  throw new Error("JWT_EXPIRES_IN must be a short value (15m-30m) in production, not 7d.");
}

function isValidIANATimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Parsed TRUST_PROXY setting, applied in app.ts via app.set("trust proxy", ...). */
export const trustProxySetting: number | "loopback" = trustProxy;

if (!env.jwt.employeeSecret && !env.jwt.platformSecret) {
  throw new Error("JWT secrets must not be empty.");
}

export function hasR2Credentials(): boolean {
  const { accessKeyId, secretAccessKey, bucket } = env.upload.r2;
  return Boolean(accessKeyId && secretAccessKey && bucket);
}

export function isPlaceholderSecret(value: string): boolean {
  return value.includes("change-me");
}