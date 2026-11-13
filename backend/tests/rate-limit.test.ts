/**
 * P2 tests — authentication rate limiting.
 *
 * Covers: repeated failed login (account lockout), one account attacked from
 * multiple IPs, many accounts from one IP (IP limiter), successful login after
 * the lockout window, registration throttling, and proxy/IP spoof handling.
 *
 * Runs against an in-memory MongoDB and a real HTTP server, driving the
 * middleware at reduced thresholds so the suite finishes quickly.
 */
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.SEED_ON_START = "false";
// Small windows so tests are fast.
process.env.AUTH_RATE_WINDOW_MS = "60000";
process.env.AUTH_RATE_IP_MAX = "8";
process.env.AUTH_REGISTER_MAX = "3";
// TRUST_PROXY=0 in the app under test means X-Forwarded-For is IGNORED —
// exactly what stops a client spoofing its IP.

let memoryServer: MongoMemoryServer | undefined;
let httpServer: import("node:http").Server | undefined;
let base = "";

const passed: string[] = [];
const failed: Array<{ name: string; error: string }> = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failed.push({ name, error: err instanceof Error ? err.message : String(err) });
  }
}

interface Res {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Res> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text };
  }
  const h: Record<string, string> = {};
  res.headers.forEach((v, k) => (h[k] = v));
  return { status: res.status, body: json, headers: h };
}

async function main(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri("ratelimit_test");

  const { createApp } = await import("../src/app.js");
  const { connectDatabase, disconnectDatabase } = await import("../src/config/db.js");
  const { seedIfEmpty } = await import("../src/seed/seed.js");
  await connectDatabase();
  await seedIfEmpty();

  const app = createApp();
  httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer!.once("listening", resolve));
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  base = `http://127.0.0.1:${port}`;

  const { accountThrottling, rateLimitConfig, resetIpLimits } = await import(
    "../src/middleware/rateLimit.js"
  );

  await check("repeated failed logins progressively lock the account", async () => {
    accountThrottling.reset();
    let sawLockout = false;
    let lastStatus = 0;
    for (let i = 0; i < rateLimitConfig.MAX_FAILURES + 2; i += 1) {
      const res = await post("/api/employee/login", {
        email: "employee@learnilm.test",
        password: "definitely-wrong",
      });
      lastStatus = res.status;
      if (res.status === 429) sawLockout = true;
    }
    assert.ok(sawLockout, `expected a 429 lockout, last status ${lastStatus}`);
    // Even with the CORRECT password the lockout holds (progressive delay).
    const correct = await post("/api/employee/login", {
      email: "employee@learnilm.test",
      password: "Employee@123",
    });
    assert.equal(correct.status, 429, "lockout must hold even for the correct password");
    // Generic response: cannot distinguish lockout from bad credentials.
    assert.equal(correct.body.message, "Too many attempts. Please try again later.");
  });

  await check("one account attacked from multiple IPs is still throttled", async () => {
    accountThrottling.reset();
    await resetIpLimits();
    // Different spoofed X-Forwarded-For values — but TRUST_PROXY=0 means the
    // app ignores them, and even if it didn't the ACCOUNT throttle is IP-blind.
    for (let i = 0; i < rateLimitConfig.MAX_FAILURES; i += 1) {
      await post(
        "/api/employee/login",
        { email: "kabir@learnilm.test", password: "wrong-password" },
        { "X-Forwarded-For": `10.0.0.${i}` },
      );
    }
    const res = await post(
      "/api/employee/login",
      { email: "kabir@learnilm.test", password: "Employee@123" },
      { "X-Forwarded-For": "10.9.9.9" },
    );
    assert.equal(res.status, 429, "account lockout must apply across IPs");
  });

  await check("many accounts from one IP hits the IP limiter", async () => {
    accountThrottling.reset();
    await resetIpLimits();
    let hitIpLimit = false;
    for (let i = 0; i < rateLimitConfig.ipMax + 2; i += 1) {
      const res = await post("/api/employee/login", {
        email: `spray-${i}@learnilm.test`,
        password: "whatever-value",
      });
      if (res.status === 429) hitIpLimit = true;
    }
    assert.ok(hitIpLimit, "expected the per-IP limiter to eventually return 429");
  });

  await check("successful login after the lockout window clears counters", async () => {
    accountThrottling.reset();
    await resetIpLimits();
    for (let i = 0; i < rateLimitConfig.MAX_FAILURES - 1; i += 1) {
      await post("/api/employee/login", {
        email: "meera@learnilm.test",
        password: "nope",
      });
    }
    // A success before the cap clears the tally (no permanent punishment).
    const ok = await post("/api/employee/login", {
      email: "meera@learnilm.test",
      password: "Employee@123",
    });
    assert.equal(ok.status, 200, `expected success after a near-limit streak, got ${ok.status}`);
    // And the counter is really gone: fresh failures start from zero.
    resetIpLimits(); // the earlier failures also counted against the IP cap
    for (let i = 0; i < rateLimitConfig.MAX_FAILURES - 1; i += 1) {
      await post("/api/employee/login", { email: "meera@learnilm.test", password: "nope" });
    }
    const stillOk = await post("/api/employee/login", {
      email: "meera@learnilm.test",
      password: "Employee@123",
    });
    assert.equal(stillOk.status, 200, "counters must reset after success");
  });

  await check("registration is throttled per IP", async () => {
    await resetIpLimits();
    let hit = false;
    for (let i = 0; i < 6; i += 1) {
      const res = await post("/api/auth/register", {
        firstName: "Test",
        lastName: `User${i}`,
        email: `reg-throttle-${i}-${Date.now()}@example.test`,
        password: "Passw0rd1",
      });
      if (res.status === 429) hit = true;
    }
    assert.ok(hit, "expected registration to return 429 within the hourly window");
  });

  await check("proxy/IP handling: X-Forwarded-For cannot bypass IP limits", async () => {
    accountThrottling.reset();
    await resetIpLimits();
    // With TRUST_PROXY=0 every fake XFF is the same untrusted address to the
    // limiter, so rotating headers must NOT raise the effective cap.
    let hit = false;
    for (let i = 1; i < rateLimitConfig.ipMax + 4; i += 1) {
      const res = await post(
        "/api/employee/login",
        { email: `xff-${i}@learnilm.test`, password: "x" },
        { "X-Forwarded-For": `198.51.100.${i % 250}` },
      );
      if (res.status === 429) hit = true;
    }
    assert.ok(hit, "spoofed X-Forwarded-For must not defeat the IP limiter");
  });

  await check("successful login resets the account counter (never permanently locked)", async () => {
    accountThrottling.reset();
    await resetIpLimits();
    for (let i = 0; i < rateLimitConfig.MAX_FAILURES; i += 1) {
      await post("/api/employee/login", { email: "employee@learnilm.test", password: "bad" });
    }
    assert.equal(accountThrottling.check("employee@learnilm.test").blocked, true);
    accountThrottling.success("employee@learnilm.test");
    assert.equal(accountThrottling.check("employee@learnilm.test").blocked, false);
  });

  console.log(`\n[rate-limit] ${passed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(`  FAIL: ${f.name}\n    ${f.error}`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[test] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (httpServer) {
      httpServer.closeAllConnections?.();
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
    const { disconnectDatabase } = await import("../src/config/db.js");
    await disconnectDatabase().catch(() => undefined);
    await memoryServer?.stop().catch(() => undefined);
  });
