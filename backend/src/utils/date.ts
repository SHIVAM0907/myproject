/**
 * The frontend encodes dates three different ways, so each is normalised here
 * rather than at the call sites:
 *
 *   /attendance/month  -> `date`  = full ISO datetime  (`toISOString()`)
 *   /team/reports      -> `date`  = full ISO datetime  (`toISOString()`)
 *   /calendar/events   -> `month` = "YYYY-MM"
 *   leave fromDate     -> `YYYY-MM-DD` from <input type="date">
 *
 * P6 — timezone policy:
 *   - Database timestamps stay UTC (Mongoose stores Date as UTC ms — unchanged).
 *   - Calendar concepts (dayKey, month windows, shift boundaries) are computed
 *     in the COMPANY timezone (COMPANY_TIMEZONE, an IANA identifier validated
 *     at startup), NOT the server's local zone. A container running UTC and an
 *     office in Kolkata therefore agree on what "today" is.
 *   - The exported function names keep the `Local` suffix (startOfLocalDay etc.)
 *     so every call site compiles unchanged; they now mean "company-local".
 *   - Shift start/end and the late-grace period come from SHIFT_START /
 *     SHIFT_END / LATE_GRACE_MINUTES (24h clock in the company timezone).
 *
 * Implementation note: JS has no timezone-aware arithmetic, so day boundaries
 * are derived via Intl parts in the target zone plus the zone's offset at that
 * instant, computed with the standard UTC-offset trick.
 */

import { env } from "../config/env.js";

const TZ = () => env.timezone.companyTz;

/** Offset (ms) of the company timezone at the given instant. */
function zoneOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ(),
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  } as const);
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 23 : get("hour"),
    get("minute"),
    get("second"),
  );
  return asUTC - instant.getTime();
}

/** Calendar "wall clock" parts of an instant, in the company timezone. */
function wallParts(instant: Date): { y: number; m: number; d: number; hh: number; mm: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ(),
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  return { y: get("year"), m: get("month"), d: get("day"), hh: hour, mm: get("minute") };
}

/** UTC instant of a wall-clock time (company zone) on the day of `instant`. */
function instantOf(instant: Date, hh: number, mm: number = 0, ss: number = 0): Date {
  const w = wallParts(instant);
  const guessUtc = Date.UTC(w.y, w.m - 1, w.d, hh, mm, ss);
  // Two-pass: the first guess may land on the wrong side of a DST shift.
  return new Date(guessUtc - zoneOffsetMs(new Date(guessUtc)));
}

/** Midnight (company zone) of the day containing `input`. */
export function startOfLocalDay(input: Date = new Date()): Date {
  return instantOf(input, 0, 0, 0);
}

/** End-of-day boundary (company zone) — inclusive last millisecond. */
export function endOfLocalDay(input: Date = new Date()): Date {
  return instantOf(input, 23, 59, 59.999);
}

/** "YYYY-MM-DD" in the COMPANY timezone (was: server-local). */
export function dayKey(input: Date = new Date()): string {
  const w = wallParts(input);
  return `${w.y}-${String(w.m).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

/** Parses "YYYY-MM-DD" as midnight in the company timezone. */
export function parseDayKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const instant = new Date(guess - zoneOffsetMs(new Date(guess)));
  // Reject keys like 2024-02-31: re-formatting must round-trip.
  if (dayKey(instant) !== `${y}-${m}-${d}`) return null;
  return instant;
}

export function addDays(input: Date, days: number): Date {
  const d = new Date(input);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Resolves a month window from either encoding. An ISO datetime, a "YYYY-MM",
 * or a "YYYY-MM-DD" are all accepted; the month of the given value wins.
 * Omitting the parameter means "the current month". Boundaries are company-zone
 * midnights converted to UTC instants for the DB query.
 */
export function resolveMonthRange(value: unknown): { start: Date; end: Date; monthKey: string } {
  const w = wallParts(parseMonthValue(value));
  const first = instantOf(new Date(Date.UTC(w.y, w.m - 1, w.d)), 0, 0, 0);
  // End boundary: 1st of next month, company-zone midnight, minus 1 ms —
  // which is DST-safe because the boundary is derived in wall-clock terms.
  const nmY = w.m === 12 ? w.y + 1 : w.y;
  const nmM = w.m === 12 ? 1 : w.m + 1;
  const nextFirstUtcGuess = Date.UTC(nmY, nmM - 1, 1);
  const nextFirst = new Date(nextFirstUtcGuess - zoneOffsetMs(new Date(nextFirstUtcGuess)));
  const end = new Date(nextFirst.getTime() - 1);
  return { start: first, end, monthKey: `${w.y}-${String(w.m).padStart(2, "0")}` };
}

function parseMonthValue(value: unknown): Date {
  if (typeof value !== "string" || value.trim() === "") return new Date();
  const raw = value.trim();

  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dayOnly) {
    const parsed = parseDayKey(raw);
    if (parsed) return parsed;
  }

  const yearMonth = /^(\d{4})-(\d{2})$/.exec(raw);
  if (yearMonth) {
    return new Date(Date.UTC(Number(yearMonth[1]), Number(yearMonth[2]) - 1, 1));
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return new Date();
}

/** Whole days between two day keys, inclusive of both endpoints. */
export function countDaysInclusive(from: Date, to: Date): number {
  const a = startOfLocalDay(from).getTime();
  const b = startOfLocalDay(to).getTime();
  if (b < a) return 0;
  // Use wall-clock days, not raw ms — DST shifts make some days 23/25h.
  let count = 0;
  for (let cursor = new Date(a); cursor.getTime() <= b;) {
    count += 1;
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    // Snap to the next company-zone midnight rather than +24h.
    cursor = startOfLocalDay(next);
  }
  return count;
}

/** Business days (Mon–Fri) between two dates, inclusive. */
export function countBusinessDaysInclusive(from: Date, to: Date): number {
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  if (end.getTime() < start.getTime()) return 0;

  let count = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime();) {
    const dow = wallParts(cursor).d; // not used for weekday; see below
    void dow;
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: TZ(), weekday: "short" })
      .formatToParts(cursor)
      .find((p) => p.type === "weekday")?.value;
    if (weekday !== "Sat" && weekday !== "Sun") count += 1;
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = startOfLocalDay(next);
  }
  return count;
}

/** Every "YYYY-MM-DD" key between two dates, inclusive. */
export function eachDayKey(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const end = startOfLocalDay(to).getTime();
  let cursor = startOfLocalDay(from);
  while (cursor.getTime() <= end) {
    keys.push(dayKey(cursor));
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = startOfLocalDay(next);
  }
  return keys;
}

/** Shift start instant (company-zone wall clock) on the day of `input`. */
export function shiftStartOn(input: Date): Date {
  const [hh, mm] = env.timezone.shiftStart.split(":").map(Number);
  return instantOf(input, hh || 0, mm || 0);
}

/** Shift end instant. Supports overnight shifts (end <= start => next day). */
export function shiftEndOn(input: Date): Date {
  const [hh, mm] = env.timezone.shiftEnd.split(":").map(Number);
  const end = instantOf(input, hh || 0, mm || 0);
  const start = shiftStartOn(input);
  if (end.getTime() <= start.getTime()) end.setUTCDate(end.getUTCDate() + 1); // overnight
  return end;
}

/**
 * Late-arrival policy: an employee is LATE when their first check-in happens
 * after shiftStart + graceMinutes (company zone).
 */
export function isLateCheckIn(checkIn: Date, referenceDay: Date = checkIn): boolean {
  const [hh, mm] = env.timezone.shiftStart.split(":").map(Number);
  const deadline = instantOf(referenceDay, hh || 0, mm || 0);
  deadline.setUTCMinutes(deadline.getUTCMinutes() + env.timezone.lateGraceMinutes);
  return checkIn.getTime() > deadline.getTime();
}

export function minutesBetween(from: Date | string | null | undefined, to: Date | string | null | undefined): number {
  if (!from || !to) return 0;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.round((end - start) / 60_000);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return round2((part / total) * 100);
}
