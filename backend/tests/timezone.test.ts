/**
 * P6 tests — timezone and attendance correctness.
 *
 * Covers: midnight boundaries, month/year boundaries, overnight shifts,
 * company timezone vs UTC server, duplicate check-in prevention, late-grace
 * policy, and consistent dayKeys across the company timezone.
 */
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.SEED_ON_START = "false";
process.env.COMPANY_TIMEZONE = "Asia/Kolkata"; // UTC+5:30, no DST
process.env.SHIFT_START = "09:00";
process.env.SHIFT_END = "18:00";
process.env.LATE_GRACE_MINUTES = "15";

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
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

async function main(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri("tz_test");

  const { createApp } = await import("../src/app.js");
  const { connectDatabase } = await import("../src/config/db.js");
  const { seedIfEmpty } = await import("../src/seed/seed.js");
  const dateMod = await import("../src/utils/date.js");

  await connectDatabase();
  await seedIfEmpty();

  const app = createApp();
  httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer!.once("listening", resolve));
  base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;

  const { dayKey, startOfLocalDay, parseDayKey, resolveMonthRange, isLateCheckIn, shiftEndOn } =
    dateMod;
  const { env: envMod } = await import("../src/config/env.js");

  await check("dayKey uses the company timezone, not the server's local zone", async () => {
    // 2024-06-15T19:00:00Z is 2024-06-16 00:30 IST — the NEXT day in Kolkata.
    const instant = new Date("2024-06-15T19:00:00Z");
    console.error("[tz-debug] companyTz =", envMod.timezone.companyTz, "dayKey =", dayKey(instant));
    assert.equal(dayKey(instant), "2024-06-16", `19:00 UTC must be the 16th in IST, got ${dayKey(instant)}`);
    // 13:30 UTC is exactly IST midnight — boundary case.
    assert.equal(dayKey(new Date("2024-06-15T13:30:00Z")), "2024-06-16");
    assert.equal(dayKey(new Date("2024-06-15T13:29:59Z")), "2024-06-15");
  });

  await check("midnight boundary: startOfLocalDay lands on company-zone midnight", async () => {
    const start = startOfLocalDay(new Date("2024-06-15T19:00:00Z"));
    // Should be 2024-06-15T18:30:00Z (= IST midnight of the 16th? No: the day
    // CONTAINING 19:00Z is the 16th IST, so midnight = 2024-06-15T18:30Z).
    assert.equal(start.toISOString(), "2024-06-15T18:30:00.000Z");
  });

  await check("parseDayKey round-trips and rejects impossible dates", async () => {
    assert.equal(dayKey(parseDayKey("2024-02-29")!), "2024-02-29"); // leap year OK
    assert.equal(parseDayKey("2023-02-29"), null, "non-leap Feb 29 must be rejected");
    assert.equal(parseDayKey("2024-13-01"), null);
    assert.equal(parseDayKey("not-a-date"), null);
  });

  await check("month boundaries: December rolls into the next year", async () => {
    const dec = resolveMonthRange("2024-12");
    assert.equal(dec.monthKey, "2024-12");
    assert.equal(dec.start.toISOString(), "2024-11-30T18:30:00.000Z"); // IST midnight Dec 1
    // January 1st IST midnight = Dec 31 18:30Z; end is 1ms before.
    assert.equal(dec.end.toISOString(), "2024-12-31T18:29:59.999Z");
  });

  await check("month range includes the whole month in IST terms", async () => {
    const jun = resolveMonthRange("2024-06");
    assert.equal(dayKey(jun.start), "2024-06-01");
    // End boundary is still June when viewed in IST.
    assert.equal(dayKey(jun.end), "2024-06-30");
  });

  await check("server in UTC vs company timezone: keys agree regardless of host zone", async () => {
    // This test's process may run in any host zone; the dayKey must depend
    // only on COMPANY_TIMEZONE. A UTC-morning instant is "previous evening"
    // in IST but must map to the IST calendar day.
    const utcMorning = new Date("2024-06-15T02:00:00Z"); // 07:30 IST on the 15th
    assert.equal(dayKey(utcMorning), "2024-06-15");
    // One second before IST midnight belongs to the 14th.
    assert.equal(dayKey(new Date("2024-06-14T18:29:59Z")), "2024-06-14");
    assert.equal(dayKey(new Date("2024-06-14T18:30:00Z")), "2024-06-15");
  });

  await check("late-arrival policy: grace period is honoured", async () => {
    // Shift 09:00 IST + 15m grace = 09:15 IST = 03:45 UTC.
    assert.equal(isLateCheckIn(new Date("2024-06-15T03:44:00Z"), new Date("2024-06-15T03:44:00Z")), false, "08:59+grace edge... 09:14 IST is on time");
    assert.equal(isLateCheckIn(new Date("2024-06-15T03:46:00Z"), new Date("2024-06-15T03:46:00Z")), true, "09:16 IST is late");
  });

  await check("overnight shift: end rolls to the next day when end <= start", async () => {
    process.env.SHIFT_START = "22:00";
    process.env.SHIFT_END = "06:00";
    // Re-import to pick up the new shift (module caches env read at call time,
    // so mutation works directly).
    const end = shiftEndOn(new Date("2024-06-15T16:00:00Z")); // 21:30 IST on the 15th
    // 06:00 IST on the 16th = 2024-06-16T00:30Z.
    assert.equal(end.toISOString(), "2024-06-16T00:30:00.000Z");
    process.env.SHIFT_START = "09:00";
    process.env.SHIFT_END = "18:00";
  });

  await check("DST-affected zone: America/New_York boundaries stay correct", async () => {
    const mod = await import("../src/config/env.js");
    // Temporarily point the company zone at New York (has DST).
    const original = mod.env.timezone.companyTz;
    (mod.env.timezone as { companyTz: string }).companyTz = "America/New_York";
    try {
      // 2024-03-10 is the US spring-forward day (2:00 -> 3:00 local).
      const start = startOfLocalDay(new Date("2024-03-10T12:00:00Z"));
      assert.equal(start.toISOString(), "2024-03-10T05:00:00.000Z", "midnight EST/EDT boundary");
      assert.equal(dayKey(new Date("2024-11-03T05:30:00Z")), "2024-11-03", "fall-back day");
    } finally {
      (mod.env.timezone as { companyTz: string }).companyTz = original;
    }
  });

  await check("duplicate check-in is prevented", async () => {
    const token = (
      await req("POST", "/api/employee/login", "", {
        email: "employee@learnilm.test",
        password: "Employee@123",
      })
    ).body.token as string;
    const first = await req("POST", "/api/employee/attendance/check-in", token, {});
    assert.ok([200, 201].includes(first.status), `first check-in: ${first.status}`);
    const second = await req("POST", "/api/employee/attendance/check-in", token, {});
    assert.ok(
      [400, 409].includes(second.status),
      `duplicate check-in must be refused, got ${second.status}: ${JSON.stringify(second.body)}`,
    );
  });

  console.log(`\n[timezone] ${passed.length} passed, ${failed.length} failed`);
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
