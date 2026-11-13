/**
 * P5 tests — JWT lifecycle and session security.
 *
 * Covers: expired access tokens (short expiresIn), revoked sessions
 * (logout-all bumps tokenVersion), password change invalidation, logout
 * endpoint, refresh-rotation semantics and suspended users.
 *
 * Refresh tokens: the architecture keeps stateless short-lived access tokens
 * (15m) plus tokenVersion-based server-side revocation — there is no separate
 * refresh-token table. The rotation/reuse tests below therefore assert the
 * documented interim behaviour: a "refresh" = a fresh login; a revoked token
 * (old tokenVersion) is rejected exactly like a stolen refresh token would be.
 */
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.SEED_ON_START = "false";

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

async function req(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  return { status: res.status, body: json };
}

async function main(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri("jwt_test");
  process.env.JWT_EXPIRES_IN = "1s"; // expired-token tests run fast

  const { createApp } = await import("../src/app.js");
  const { connectDatabase } = await import("../src/config/db.js");
  const { seedIfEmpty } = await import("../src/seed/seed.js");
  const { Employee, bumpTokenVersion } = await import("../src/models/Employee.js");

  await connectDatabase();
  await seedIfEmpty();

  const app = createApp();
  httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer!.once("listening", resolve));
  base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;

  async function login(email = "employee@learnilm.test", password = "Employee@123") {
    const r = await req("POST", "/api/employee/login", "", { email, password });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.token as string;
  }

  const token = await login();

  await check("a fresh token grants access", async () => {
    const r = await req("GET", "/api/employee/me", token);
    assert.equal(r.status, 200);
  });

  await check("expired access tokens are rejected", async () => {
    // JWT_EXPIRES_IN=1s — wait it out.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const r = await req("GET", "/api/employee/me", token);
    assert.equal(r.status, 401, `expired token must be 401, got ${r.status}`);
  });

  await check("logout endpoint succeeds and the session is expected to be dropped client-side", async () => {
    const t = await login();
    const r = await req("POST", "/api/employee/logout", t);
    assert.equal(r.status, 200);
  });

  await check("password change invalidates outstanding tokens", async () => {
    const t = await login();
    const r = await req("PUT", "/api/employee/password", t, {
      currentPassword: "Employee@123",
      newPassword: "NewPass@123",
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const after = await req("GET", "/api/employee/me", t);
    assert.equal(after.status, 401, "old token must be invalid after a password change");
    // Restore the password for later tests.
    const fresh = await login("employee@learnilm.test", "NewPass@123");
    await req("PUT", "/api/employee/password", fresh, {
      currentPassword: "NewPass@123",
      newPassword: "Employee@123",
    });
  });

  await check("logout-all revokes every session (refresh-token reuse detection analogue)", async () => {
    const t1 = await login();
    const t2 = await login();
    const r = await req("POST", "/api/employee/logout-all", t1);
    assert.equal(r.status, 200);
    // Both "rotated away" tokens are now unusable — reuse of a revoked
    // credential is denied, which is the guarantee rotation aims for.
    assert.equal((await req("GET", "/api/employee/me", t1)).status, 401);
    assert.equal((await req("GET", "/api/employee/me", t2)).status, 401);
    // A fresh login works (no permanent lockout).
    const t3 = await login();
    assert.equal((await req("GET", "/api/employee/me", t3)).status, 200);
  });

  await check("tokens minted BEFORE a version bump fail, tokens after pass", async () => {
    const employee = await Employee.findOne({ email: "employee@learnilm.test" });
    const old = await login();
    await bumpTokenVersion(String(employee!._id));
    assert.equal((await req("GET", "/api/employee/me", old)).status, 401);
    const fresh = await login();
    assert.equal((await req("GET", "/api/employee/me", fresh)).status, 200);
  });

  await check("suspended users cannot authenticate", async () => {
    const t = await login();
    const employee = await Employee.findOne({ email: "employee@learnilm.test" });
    await Employee.updateOne(
      { _id: employee!._id },
      { $set: { "job.status": "terminated", "job.isActive": false } },
    );
    // Existing token: the middleware re-reads the live record.
    const r = await req("GET", "/api/employee/me", t);
    assert.equal(r.status, 403, `suspended user's token must be 403, got ${r.status}`);
    // Fresh login is refused outright.
    const l = await req("POST", "/api/employee/login", "", {
      email: "employee@learnilm.test",
      password: "Employee@123",
    });
    assert.equal(l.status, 403);
  });

  await check("tokens cannot be replayed across realms (employee token on platform route)", async () => {
    const t = await login("manager@learnilm.test", "Manager@123");
    const r = await req("GET", "/api/admin/stats", t);
    assert.ok([401, 403].includes(r.status), `cross-realm replay must fail, got ${r.status}`);
  });

  console.log(`\n[jwt-lifecycle] ${passed.length} passed, ${failed.length} failed`);
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
