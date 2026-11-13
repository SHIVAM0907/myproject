import { Router, type Response } from "express";
import { body } from "express-validator";
import { Types } from "mongoose";
import { Attendance } from "../models/Attendance.js";
import { LeaveRequest, type LeaveStatus } from "../models/LeaveRequest.js";
import { Employee } from "../models/Employee.js";
import { requireEmployee, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  addDays,
  countBusinessDaysInclusive,
  countDaysInclusive,
  dayKey,
  parseDayKey,
  round2,
  startOfLocalDay,
} from "../utils/date.js";

const router = Router();

/** `Record<LeaveType, {total,used,remaining}>` as read by ApplyForLeave. */
function emptyBalance() {
  return {
    casual: { total: 0, used: 0, remaining: 0 },
    sick: { total: 0, used: 0, remaining: 0 },
    earned: { total: 0, used: 0, remaining: 0 },
    unpaid: { total: 0, used: 0, remaining: 0 },
  };
}

/**
 * GET /leave/balance
 *
 * Unlike `/me`'s `leaveBalances` (which exposes only `{total, used}`), this
 * route adds `remaining` because ApplyForLeave reads all three fields.
 * `used` is derived from approved leave rather than trusted from the stored
 * counter, so it cannot drift out of sync with the request history.
 */
router.get(
  "/leave/balance",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employee = await Employee.findById(currentUserId(req));
    if (!employee) throw ApiError.notFound("Your account could not be found.");

    const balance = emptyBalance();
    const balances = employee.leaveBalances as unknown as Map<
      string,
      { total: number; used: number }
    >;

    for (const [key, bucket] of balances ?? []) {
      balance[key as keyof typeof balance] = {
        total: bucket?.total ?? 0,
        used: 0,
        remaining: bucket?.total ?? 0,
      };
    }

    const approved = await LeaveRequest.find({
      employee: employee._id,
      status: "approved",
    }).lean<Array<{ leaveType: string; days: number; dayType?: string }>>();

    for (const request of approved) {
      const bucket = balance[request.leaveType as keyof typeof balance];
      if (!bucket) continue;
      // A half day consumes half a day from the bucket.
      const consumed = request.dayType === "first_half" || request.dayType === "second_half"
        ? round2((request.days ?? 1) / 2)
        : (request.days ?? 1);
      bucket.used = round2(bucket.used + consumed);
      bucket.remaining = round2(bucket.total - bucket.used);
    }

    res.json({ balance });
  }),
);

/** GET /leave/history -> `{ leaveRequests }` (key differs from /leave/balance). */
router.get(
  "/leave/history",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const requests = await LeaveRequest.find({ employee: currentUserId(req) })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean<Array<Record<string, unknown>>>();

    res.json({ leaveRequests: requests.map(serializeLeaveRequest) });
  }),
);

function serializeLeaveRequest(record: Record<string, unknown>) {
  return {
    ...record,
    _id: record._id ? String(record._id) : undefined,
    employee: record.employee ? String(record.employee) : undefined,
    fromDate: record.fromDate ? new Date(record.fromDate as string).toISOString() : undefined,
    toDate: record.toDate ? new Date(record.toDate as string).toISOString() : undefined,
    days: Number(record.days ?? 0),
  };
}

/** Shared payload validation for POST /leave and POST /leave/draft. */
const leaveValidators = [
  body("leaveType")
    .isIn(["casual", "sick", "earned", "unpaid"])
    .withMessage("Choose a valid leave type."),
  body("dayType")
    .optional({ values: "falsy" })
    .isIn(["full_day", "first_half", "second_half"])
    .withMessage("Choose a valid day type."),
  body("fromDate").isString().trim().notEmpty().withMessage("Start date is required."),
  body("toDate").isString().trim().notEmpty().withMessage("End date is required."),
  body("reason").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }),
  body("contactWhileOnLeave").optional({ values: "falsy" }).isString().trim().isLength({ max: 128 }),
  body("attachments").optional().isArray().withMessage("attachments must be an array."),
];

interface LeavePayload {
  leaveType: string;
  dayType?: string;
  fromDate: string;
  toDate: string;
  reason?: string;
  contactWhileOnLeave?: string;
  attachments?: string[];
}

function buildLeave(payload: LeavePayload, status: LeaveStatus) {
  const from = parseDayKey(payload.fromDate);
  const to = parseDayKey(payload.toDate);

  if (!from) throw ApiError.badRequest("Start date must be a valid YYYY-MM-DD date.");
  if (!to) throw ApiError.badRequest("End date must be a valid YYYY-MM-DD date.");
  if (to.getTime() < from.getTime()) {
    throw ApiError.badRequest("End date cannot be before the start date.");
  }

  const calendarDays = countDaysInclusive(from, to);
  const businessDays = countBusinessDaysInclusive(from, to);

  // The form sends no `durationDays`, so the server derives it. Business days
  // are the billed figure; calendar days is kept as a floor so a single
  // weekend-only request still records at least half a day.
  const days = Math.max(0.5, round2(businessDays || calendarDays / 2));

  return { from, to, days, calendarDays, businessDays };
}

/** POST /leave — submits for approval. */
router.post(
  "/leave",
  validate(leaveValidators),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = currentUserId(req);
    const payload = req.body as LeavePayload;
    const { from, to, days } = buildLeave(payload, "pending");

    const clash = await LeaveRequest.findOne({
      employee: employeeId,
      status: { $in: ["pending", "approved"] },
      fromDate: { $lte: to },
      toDate: { $gte: from },
    });
    if (clash) {
      throw ApiError.conflict("You already have a leave request covering those dates.");
    }

    const created = await LeaveRequest.create({
      employee: employeeId,
      leaveType: payload.leaveType,
      dayType: payload.dayType ?? "full_day",
      fromDate: from,
      toDate: to,
      days,
      reason: payload.reason ?? "",
      contactWhileOnLeave: payload.contactWhileOnLeave ?? "",
      attachments: payload.attachments ?? [],
      status: "pending",
    });

    res.status(201).json({ message: "Leave request submitted.", leaveRequest: created });
  }),
);

/** POST /leave/draft — same body, but stored as a draft. */
router.post(
  "/leave/draft",
  validate(leaveValidators),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const payload = req.body as LeavePayload;
    const { from, to, days } = buildLeave(payload, "draft");

    const created = await LeaveRequest.create({
      employee: currentUserId(req),
      leaveType: payload.leaveType,
      dayType: payload.dayType ?? "full_day",
      fromDate: from,
      toDate: to,
      days,
      reason: payload.reason ?? "",
      contactWhileOnLeave: payload.contactWhileOnLeave ?? "",
      attachments: payload.attachments ?? [],
      status: "draft",
    });

    res.status(201).json({ message: "Draft saved.", leaveRequest: created });
  }),
);

/**
 * PATCH /team/leave/:id/status — the manager review action.
 *
 * Mounted here (rather than in the team router) because approving leave has to
 * project the approval onto attendance records, and that logic is shared with
 * check-in. `PendingLeaveRequests` narrows status to approved|rejected, so any
 * other value is rejected.
 *
 * A draft is promoted to `pending` when submitted, so only pending/approved
 * requests are reviewable.
 */
export async function applyLeaveDecision(
  requestId: string,
  status: "approved" | "rejected",
  reviewerId: string,
  note = "",
) {
  const leave = await LeaveRequest.findById(requestId);
  if (!leave) throw ApiError.notFound("That leave request no longer exists.");

  if (leave.status === "draft") {
    throw ApiError.conflict("That request is still a draft and has not been submitted.");
  }
  if (leave.status !== "pending") {
    throw ApiError.conflict(`That request was already ${leave.status}.`);
  }

  leave.status = status;
  leave.reviewedBy = new Types.ObjectId(reviewerId);
  leave.reviewNote = note;
  leave.reviewedAt = new Date();
  await leave.save();

  if (status === "approved") {
    await markLeaveAttendance(leave);
  } else {
    await clearLeaveAttendance(leave);
  }

  return leave;
}

/** Writes `leave` status onto every attendance record inside the range. */
async function markLeaveAttendance(leave: InstanceType<typeof LeaveRequest>): Promise<void> {
  const start = startOfLocalDay(leave.fromDate);
  const end = startOfLocalDay(leave.toDate);

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const key = dayKey(cursor);

    await Attendance.updateOne(
      { employee: leave.employee, dayKey: key },
      {
        $set: {
          status: "leave",
          leaveType: leave.leaveType,
          leaveRequest: leave._id,
        },
      },
      { upsert: true },
    );
  }
}

/** Reverts previously-marked leave days that have no attendance punches. */
async function clearLeaveAttendance(leave: InstanceType<typeof LeaveRequest>): Promise<void> {
  await Attendance.updateMany(
    { employee: leave.employee, leaveRequest: leave._id, checkIn: null },
    { $set: { status: "absent", leaveType: null, leaveRequest: null } },
  );
}

export { markLeaveAttendance, clearLeaveAttendance, emptyBalance };
export default router;