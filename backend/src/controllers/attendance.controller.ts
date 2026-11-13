import { Router, type Response } from "express";
import { Types } from "mongoose";
import { query } from "express-validator";
import { Attendance } from "../models/Attendance.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { requireEmployee, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  dayKey,
  endOfLocalDay,
  minutesBetween,
  resolveMonthRange,
  startOfLocalDay,
} from "../utils/date.js";
import { env } from "../config/env.js";

const router = Router();

/** Shift policy. A check-in later than start + grace is recorded as `late`. */
export const SHIFT = {
  startHour: env.isProduction ? 10 : 9,
  graceMinutes: 15,
  workdayMinutes: 8 * 60,
  overtimeThresholdMinutes: 8 * 60 + 30,
};

type AttendanceDoc = InstanceType<typeof Attendance>;

/** Loads today's record, creating an `absent` stub on first touch. */
export async function findOrCreateToday(
  employeeId: string,
  at: Date = new Date(),
): Promise<AttendanceDoc> {
  const key = dayKey(at);

  // One atomic upsert rather than find-then-create. Both `GET /dashboard` and
  // `GET /managers-dashboard` call this while rendering, and React StrictMode
  // mounts effects twice in development -- so two identical requests routinely
  // arrive together, both saw "not found", both inserted, and the loser of the
  // unique (employee, dayKey) index surfaced as a 409 on a read-only endpoint.
  const filter = { employee: employeeId, dayKey: key };
  const insert = {
    $setOnInsert: { employee: employeeId, dayKey: key, status: "absent", updatedBy: employeeId },
  };

  try {
    return (await Attendance.findOneAndUpdate(filter, insert, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    })) as AttendanceDoc;
  } catch (err) {
    // MongoDB can still raise a duplicate-key error when two upserts for the
    // same key race at the server, so fall back to reading the winner's row.
    if (typeof err === "object" && err !== null && (err as { code?: number }).code === 11000) {
      const existing = await Attendance.findOne(filter);
      if (existing) return existing as AttendanceDoc;
    }
    throw err;
  }
}

/** Projects an attendance record into the `AttendanceToday` shape. */
export function serializeToday(doc: {
  status?: string;
  leaveType?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
  breakStart?: Date | null;
  breakMinutes?: number;
  workingMinutes?: number;
  overtimeMinutes?: number;
}) {
  return {
    status: doc.status ?? "absent",
    leaveType: doc.leaveType ?? null,
    checkIn: doc.checkIn ? new Date(doc.checkIn).toISOString() : null,
    checkOut: doc.checkOut ? new Date(doc.checkOut).toISOString() : null,
    breakStart: doc.breakStart ? new Date(doc.breakStart).toISOString() : null,
    breakMinutes: doc.breakMinutes ?? 0,
    workingMinutes: doc.workingMinutes ?? 0,
    overtimeMinutes: doc.overtimeMinutes ?? 0,
  };
}

/**
 * Recomputes derived minutes from timestamps. Total span minus break time is
 * the working total, which is what dashboards and monthly reports read.
 */
export function recalculateMinutes(doc: AttendanceDoc, now: Date = new Date()): void {
  if (!doc.checkIn) {
    doc.workingMinutes = 0;
    doc.overtimeMinutes = 0;
    return;
  }

  const end = doc.checkOut ?? now;
  const span = minutesBetween(doc.checkIn, end);
  const working = Math.max(0, span - (doc.breakMinutes ?? 0));

  doc.workingMinutes = working;
  doc.overtimeMinutes =
    working > SHIFT.overtimeThresholdMinutes ? working - SHIFT.overtimeThresholdMinutes : 0;
}

/**
 * Approved full-day leave covering `at`, if any. Half-day leave is excluded
 * because it only excuses one half and shouldn't mark the whole day as leave.
 */
export async function findApprovedLeave(employeeId: string, at: Date) {
  return LeaveRequest.findOne({
    employee: employeeId,
    status: "approved",
    dayType: "full_day",
    fromDate: { $lte: endOfLocalDay(at) },
    toDate: { $gte: startOfLocalDay(at) },
  }).lean();
}

/** GET /attendance/today — read by both dashboards' Header components. */
router.get(
  "/attendance/today",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const doc = await findOrCreateToday(String(currentUserId(req)));
    recalculateMinutes(doc);
    res.json({ attendance: serializeToday(doc) });
  }),
);

/**
 * GET /attendance/month?date=<ISO datetime>
 *
 * AttendanceDetails sends `date.toISOString()`, so the parameter is a full
 * datetime rather than a "YYYY-MM" month string; `resolveMonthRange` accepts
 * both. Only `dayMap` is consumed by the client, but `summary` is included
 * because EmployeeDashboardData declares it.
 */
router.get(
  "/attendance/month",
  validate([query("date").optional().isString().withMessage("date must be a date string.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { start, end, monthKey } = resolveMonthRange(req.query.date);
    // dayKey is a "YYYY-MM-DD" string, so lexicographic bounds match the window.
    const fromKey = dayKey(start);
    const toKey = dayKey(end);

    const records = await Attendance.find({
      employee: String(currentUserId(req)),
      dayKey: { $gte: fromKey, $lte: toKey },
    }).lean<Array<Record<string, unknown>>>();

    const dayMap: Record<string, { status: string; date: string }> = {};
    let totalWorkingMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOvertimeMinutes = 0;

    for (const rec of records) {
      const key = String(rec.dayKey);
      dayMap[key] = { status: String(rec.status ?? "absent"), date: key };
      totalWorkingMinutes += Number(rec.workingMinutes ?? 0);
      totalBreakMinutes += Number(rec.breakMinutes ?? 0);
      totalOvertimeMinutes += Number(rec.overtimeMinutes ?? 0);
    }

    res.json({
      attendanceMonth: {
        month: monthKey,
        dayMap,
        summary: { totalWorkingMinutes, totalBreakMinutes, totalOvertimeMinutes },
      },
    });
  }),
);

/** POST /attendance/check-in */
router.post(
  "/attendance/check-in",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = String(currentUserId(req));
    const now = new Date();
    const doc = await findOrCreateToday(employeeId, now);

    if (doc.checkIn) {
      return res.json({ attendance: serializeToday(doc), message: "Already checked in." });
    }

    const approvedLeave = await findApprovedLeave(employeeId, now);
    if (approvedLeave) {
      doc.status = "leave";
      doc.leaveType = approvedLeave.leaveType;
      doc.leaveRequest = approvedLeave._id;
      await doc.save();
      return res.json({ attendance: serializeToday(doc) });
    }

    doc.checkIn = now;

    const shiftStart = new Date(now);
    shiftStart.setHours(SHIFT.startHour, 0, 0, 0);
    const lateBy = minutesBetween(shiftStart, now);
    doc.lateMinutes = lateBy > SHIFT.graceMinutes ? lateBy - SHIFT.graceMinutes : 0;
    doc.status = doc.lateMinutes > 0 ? "late" : "present";
    doc.updatedBy = new Types.ObjectId(employeeId);

    recalculateMinutes(doc, now);
    await doc.save();

    res.json({ attendance: serializeToday(doc) });
  }),
);

/** POST /attendance/check-out */
router.post(
  "/attendance/check-out",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = String(currentUserId(req));
    const now = new Date();
    const doc = await findOrCreateToday(employeeId, now);

    if (!doc.checkIn) {
      return res.status(409).json({ message: "Check in before checking out." });
    }
    if (doc.checkOut) {
      return res.json({ attendance: serializeToday(doc), message: "Already checked out." });
    }

    // An open break must be closed out before check-out or its time is lost.
    if (doc.breakStart) {
      doc.breakMinutes = (doc.breakMinutes ?? 0) + minutesBetween(doc.breakStart, now);
      doc.breakStart = null;
    }

    doc.checkOut = now;
    doc.status = doc.lateMinutes > 0 ? "late" : "present";
    doc.updatedBy = new Types.ObjectId(employeeId);

    recalculateMinutes(doc, now);
    await doc.save();

    res.json({ attendance: serializeToday(doc) });
  }),
);

/** POST /attendance/break/start */
router.post(
  "/attendance/break/start",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = String(currentUserId(req));
    const now = new Date();
    const doc = await findOrCreateToday(employeeId, now);

    if (!doc.checkIn) {
      return res.status(409).json({ message: "Check in before starting a break." });
    }
    if (doc.breakStart) {
      return res.json({ attendance: serializeToday(doc), message: "Break already running." });
    }
    if (doc.checkOut) {
      return res.status(409).json({ message: "You have already checked out today." });
    }

    doc.breakStart = now;
    doc.status = "on_break";
    doc.updatedBy = new Types.ObjectId(employeeId);
    recalculateMinutes(doc, now);
    await doc.save();

    res.json({ attendance: serializeToday(doc) });
  }),
);

/** POST /attendance/break/end */
router.post(
  "/attendance/break/end",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = String(currentUserId(req));
    const now = new Date();
    const doc = await findOrCreateToday(employeeId, now);

    if (!doc.breakStart) {
      return res.json({ attendance: serializeToday(doc), message: "No break was running." });
    }

    doc.breakMinutes = (doc.breakMinutes ?? 0) + minutesBetween(doc.breakStart, now);
    doc.breakStart = null;
    // A break never erases lateness.
    doc.status = doc.lateMinutes > 0 ? "late" : "present";
    doc.updatedBy = new Types.ObjectId(employeeId);
    recalculateMinutes(doc, now);
    await doc.save();

    res.json({ attendance: serializeToday(doc) });
  }),
);

export default router;