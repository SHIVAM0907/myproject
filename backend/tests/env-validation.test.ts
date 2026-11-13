/**
 * Automated tests for every production configuration validation rule (P1).
 *
 * src/config/env.ts validates at module load, so each case runs in a child
 * process (`tsx runner.mjs <json-env>`) with a fresh process.env — module
 * caching would otherwise hide re-evaluations.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.join(here, "helpers", "env-runner.mjs");

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "production",
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/hr",
  JWT_EMPLOYEE_SECRET: "eJ9sK2vQ7wR4zX8bN3mT6yU1pL5hG0aDcF",
  JWT_PLATFORM_SECRET: "pW4rB7nM2xK9qZ5tV8cJ3fH6sD1gL0yEaU",
  CORS_ORIGINS: "https://app.example.com",
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "keyid-example",
  R2_SECRET_ACCESS_KEY: "s3cret-value-that-is-long-enough",
  R2_BUCKET: "bucket",
  TRUST_PROXY: "1",
  SEED_ON_START: "false",
  JWT_EXPIRES_IN: "15m",
  JWT_PLATFORM_EXPIRES_IN: "15m",
};

interface Outcome {
  ok: boolean;
  message: string;
  seedOnStart?: boolean | null;
}

function runCase(env: Record<string, string>): Outcome {
  const stdout = execFileSync(process.execPath, [runner, JSON.stringify(env)], {
    cwd: path.resolve(here, ".."),
    encoding: "utf8",
  });
  return JSON.parse(stdout) as Outcome;
}

function assertNoSecretLeak(outcome: Outcome, env: Record<string, string>): void {
  for (const key of ["JWT_EMPLOYEE_SECRET", "JWT_PLATFORM_SECRET", "R2_SECRET_ACCESS_KEY"]) {
    const v = env[key];
    if (v && v.length > 8) {
      assert.ok(!outcome.message.includes(v), "validation error must not echo secret values");
    }
  }
}

const passed: string[] = [];
const failed: Array<{ name: string; error: string }> = [];

async function rule(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failed.push({ name, error: err instanceof Error ? err.message : String(err) });
  }
}

function expectReject(env: Record<string, string>, fragment: string): void {
  const outcome = runCase(env);
  assert.equal(outcome.ok, false, `expected failure, got success. message: ${outcome.message}`);
  assert.ok(
    outcome.message.includes(fragment),
    `expected rejection mentioning "${fragment}", got: ${outcome.message}`,
  );
  assertNoSecretLeak(outcome, env);
}

function expectOk(env: Record<string, string>, field?: string, expected?: unknown): void {
  const outcome = runCase(env);
  assert.equal(outcome.ok, true, `expected success, got: ${outcome.message}`);
  if (field !== undefined) {
    assert.deepEqual((outcome as unknown as Record<string, unknown>)[field], expected);
  }
}

async function main(): Promise<void> {
  await rule("accepts a fully-valid production configuration", () => {
    expectOk(BASE_ENV, "seedOnStart", false);
  });

  await rule("rejects placeholder JWT employee secret", () => {
    expectReject(
      { ...BASE_ENV, JWT_EMPLOYEE_SECRET: "my-dev-employee-secret-change-me-0123456789" },
      "placeholder",
    );
  });

  await rule("rejects placeholder JWT platform secret", () => {
    expectReject(
      { ...BASE_ENV, JWT_PLATFORM_SECRET: "changeme-not-a-real-secret-0123456789" },
      "placeholder",
    );
  });

  await rule("rejects short JWT secrets (<32 chars)", () => {
    expectReject({ ...BASE_ENV, JWT_EMPLOYEE_SECRET: "a-short-but-real-looking-value!" }, "at least 32");
  });

  await rule("rejects missing JWT_EMPLOYEE_SECRET in production", () => {
    const { JWT_EMPLOYEE_SECRET: _drop, ...rest } = BASE_ENV;
    expectReject(rest, "JWT_EMPLOYEE_SECRET");
  });

  await rule("rejects missing JWT_PLATFORM_SECRET in production", () => {
    const { JWT_PLATFORM_SECRET: _drop, ...rest } = BASE_ENV;
    expectReject(rest, "JWT_PLATFORM_SECRET");
  });

  await rule("requires explicit CORS_ORIGINS in production", () => {
    const { CORS_ORIGINS: _drop, ...rest } = BASE_ENV;
    expectReject(rest, "CORS_ORIGINS");
  });

  await rule("requires production R2 credentials and bucket", () => {
    const { R2_ACCESS_KEY_ID: _drop, ...rest } = BASE_ENV;
    expectReject(rest, "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID");
    const { R2_BUCKET: _dropBucket, ...restBucket } = BASE_ENV;
    expectReject(restBucket, "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID");
  });

  await rule("validates MongoDB production URI (no localhost)", () => {
    expectReject(
      { ...BASE_ENV, MONGODB_URI: "mongodb://localhost:27017/hr" },
      "must not point at localhost",
    );
  });

  await rule("validates MongoDB URI scheme", () => {
    expectReject(
      { ...BASE_ENV, MONGODB_URI: "postgres://user:pass@db.example.com/hr" },
      "valid mongodb",
    );
  });

  await rule("rejects unresolved MongoDB placeholders", () => {
    expectReject(
      { ...BASE_ENV, MONGODB_URI: "mongodb+srv://user:<db_password>@cluster.example.mongodb.net/hr" },
      "placeholder",
    );
  });

  await rule("validates TRUST_PROXY configuration", () => {
    const { TRUST_PROXY: _drop, ...rest } = BASE_ENV;
    expectReject(rest, "TRUST_PROXY is required");
    expectReject({ ...BASE_ENV, TRUST_PROXY: "true" }, "TRUST_PROXY must be");
    expectReject({ ...BASE_ENV, TRUST_PROXY: "-1" }, "TRUST_PROXY must be");
    expectReject({ ...BASE_ENV, TRUST_PROXY: "banana" }, "TRUST_PROXY must be");
    expectOk({ ...BASE_ENV, TRUST_PROXY: "loopback" });
  });

  await rule("defaults SEED_ON_START to false in production", () => {
    const { SEED_ON_START: _drop, ...rest } = BASE_ENV;
    expectOk(rest, "seedOnStart", false);
  });

  await rule("refuses production startup when seeding is enabled", () => {
    expectReject({ ...BASE_ENV, SEED_ON_START: "true" }, "SEED_ON_START");
  });

  await rule("keeps development seeding available via explicit configuration", () => {
    const outcome = runCase({
      NODE_ENV: "development",
      MONGODB_URI: "mongodb://127.0.0.1:27017/dev",
      SEED_ON_START: "true",
    });
    assert.equal(outcome.ok, true, outcome.message);
    assert.equal(outcome.seedOnStart, true);
  });

  await rule("company timezone must be a valid IANA identifier", () => {
    expectReject({ ...BASE_ENV, COMPANY_TIMEZONE: "Not/AZone" }, "IANA");
    expectOk({ ...BASE_ENV, COMPANY_TIMEZONE: "Asia/Kolkata" });
  });

  await rule("production refuses 7d access tokens", () => {
    expectReject({ ...BASE_ENV, JWT_EXPIRES_IN: "7d" }, "short value");
    expectReject({ ...BASE_ENV, JWT_PLATFORM_EXPIRES_IN: "7d" }, "short value");
  });

  console.log(`\n[env-validation] ${passed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(`  FAIL: ${f.name}\n    ${f.error}`);
  if (failed.length > 0) process.exitCode = 1;
}

main();
