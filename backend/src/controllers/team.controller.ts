import { Router, type Response } from "express";
import { body, param } from "express-validator";
import { Types } from "mongoose";
import { Employee } from "../models/Employee.js";
import { Attendance } from "../models/Attendance.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { requireEmployee, requireRole, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayKey, endOfLocalDay, startOfLocalDay } from "../utils/date.js";
import { applyLeaveDecision } from "./leave.controller.js";
import { isObjectId } from "./task.controller.js";

const router = Router();

const MANAGER_ROW_FIELDS = "firstName lastName employeeCode department designation role job phone profile";

/**
 * Explicit shape for a `.lean()` team row. Typing these as
 * `Record<string, unknown>` makes every nested `job.*` access an error, so the
 * fields the routes actually read are declared.
 */
interface TeamMemberLean {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  department?: string;
  designation?: string;
  role: string;
  phone?: string;
  manager?: Types.ObjectId | null;
  job?: { joinDate?: Date | string | null; status?: string; isActive?: boolean };
  profile?: { bio?: string; imageUrl?: string; skills?: string[] };
  personal?: Record<string, unknown>;
  leaveBalances?: Record<string, { total: number; used: number }>;
  updatedAt?: Date | string;
}

/** Resolves the manager's direct reports. */
async function directReports(managerId: string): Promise<TeamMemberLean[]> {
  return Employee.find({ manager: managerId, "job.status": { $nin: ["terminated", "inactive"] } })
    // `job` is already inside MANAGER_ROW_FIELDS; selecting `job.joinDate` as
    // well makes Mongo raise "path collision at job.joinDate".
    .select(MANAGER_ROW_FIELDS + " email personal leaveBalances")
    .sort({ firstName: 1 })
    .lean<TeamMemberLean[]>();
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function requireManagerId(value: unknown, label: string): string {
  if (!isObjectId(value)) throw ApiError.badRequest(`A valid ${label} is required.`);
  return String(value);
}

/**
 * GET /team -> `{ members }`
 *
 * The key is `members`, unlike `/team/available` which returns `employees`.
 */
router.get(
  "/team",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const members = await directReports(String(currentUserId(req)));

    res.json({
      members: members.map((m) => ({
        _id: String(m._id),
        firstName: m.firstName,
        lastName: m.lastName,
        name: `${m.firstName} ${m.lastName}`.trim(),
        email: m.email,
        employeeCode: m.employeeCode,
        department: m.department ?? "",
        designation: m.designation ?? "",
        role: m.role,
        phone: m.phone ?? "",
        job: {
          joinDate: iso(m.job?.joinDate),
          status: m.job?.status ?? "active",
          isActive: m.job?.isActive ?? true,
        },
      })),
    });
  }),
);

/** POST /team/assign — attach an employee to the caller's team. */
router.post(
  "/team/assign",
  requireRole("manager"),
  validate([body("employeeId").exists().withMessage("An employee is required.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const employeeId = requireManagerId(req.body.employeeId, "employee id");

    if (employeeId === managerId) {
      throw ApiError.badRequest("You cannot add yourself to your own team.");
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) throw ApiError.notFound("That employee could not be found.");
    if (String(employee.manager ?? "") === managerId) {
      throw ApiError.conflict("That person is already on your team.");
    }
    if (employee.manager) {
      throw ApiError.conflict("That person already reports to another manager.");
    }
    if (employee.role === "manager") {
      throw ApiError.badRequest("Managers cannot be added to a team as reports.");
    }

    employee.manager = new Types.ObjectId(employeeId);
    await employee.save();

    res.status(201).json({ message: `${employee.firstName} was added to your team.` });
  }),
);

/** DELETE /team/assign/:employeeId — the only DELETE on the employee API. */
router.delete(
  "/team/assign/:employeeId",
  requireRole("manager"),
  validate([param("employeeId").isMongoId().withMessage("A valid employee id is required.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const employeeId = req.params.employeeId as string;

    const employee = await Employee.findById(employeeId);
    if (!employee) throw ApiError.notFound("That employee could not be found.");
    if (String(employee.manager ?? "") !== managerId) {
      throw ApiError.forbidden("That person is not on your team.");
    }

    employee.manager = null;
    await employee.save();

    res.json({ message: `${employee.firstName} was removed from your team.` });
  }),
);

/**
 * GET /team/member/:employeeId -> `{ member }` (singular key).
 *
 * `My-employee.tsx` declares its own local `EmployeeDetail` type here rather
 * than reusing `AdminEmployeeDetail`, so this returns a superset covering both:
 * the summary fields plus `personal`, `leaveBalances` and recent attendance.
 */
router.get(
  "/team/member/:employeeId",
  requireRole("manager"),
  validate([param("employeeId").isMongoId().withMessage("A valid employee id is required.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const employeeId = req.params.employeeId as string;

    const employee = await Employee.findById(employeeId).lean<TeamMemberLean | null>();
    if (!employee) throw ApiError.notFound("That employee could not be found.");
    if (String(employee.manager ?? "") !== managerId) {
      throw ApiError.forbidden("That person is not on your team.");
    }

    const key = dayKey();
    const [today, balances, leaveCounts] = await Promise.all([
      Attendance.findOne({ employee: employeeId, dayKey: key }).lean(),
      LeaveRequest.find({ employee: employeeId, status: "approved" }).lean(),
      LeaveRequest.find({ employee: employeeId, status: "pending" }).countDocuments(),
    ]);

    const leaveBalances: Record<string, { total: number; used: number }> = {};
    for (const [type, bucket] of Object.entries(employee.leaveBalances ?? {})) {
      leaveBalances[type] = { total: bucket?.total ?? 0, used: bucket?.used ?? 0 };
    }

    res.json({
      member: {
        _id: String(employee._id),
        firstName: employee.firstName,
        lastName: employee.lastName,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        email: employee.email,
        employeeCode: employee.employeeCode,
        department: employee.department ?? "",
        designation: employee.designation ?? "",
        role: employee.role,
        phone: employee.phone ?? "",
        job: {
          joinDate: iso(employee.job?.joinDate),
          status: employee.job?.status ?? "active",
          isActive: employee.job?.isActive ?? true,
        },
        profile: employee.profile ?? { bio: "", imageUrl: "", skills: [] },
        personal: employee.personal ?? {},
        leaveBalances,
        pendingLeaveCount: leaveCounts,
        attendanceToday: today
          ? {
              status: today.status,
              checkIn: iso(today.checkIn as Date | string | null | undefined),
              checkOut: iso(today.checkOut as Date | string | null | undefined),
              workingMinutes: today.workingMinutes ?? 0,
              breakMinutes: today.breakMinutes ?? 0,
              overtimeMinutes: today.overtimeMinutes ?? 0,
            }
          : null,
        updatedAt: iso(employee.updatedAt) ?? undefined,
      },
    });
  }),
);

/**
 * PATCH /team/leave/:id/status — approve or reject.
 *
 * `PendingLeaveRequests` narrows `status` to "approved" | "rejected", so any
 * other value is rejected outright. Drafts are not reviewable.
 */
router.patch(
  "/team/leave/:id/status",
  requireRole("manager"),
  validate([
    param("id").isMongoId().withMessage("A valid leave request id is required."),
    body("status").isIn(["approved", "rejected"]).withMessage("Status must be approved or rejected."),
    body("reviewNote").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const { status, reviewNote } = req.body as { status: "approved" | "rejected"; reviewNote?: string };

    const leave = await LeaveRequest.findById(req.params.id as string).lean();
    if (!leave) throw ApiError.notFound("That leave request no longer exists.");

    // A manager may only review their own team's requests.
    const employee = await Employee.findById(leave.employee).select("manager").lean();
    if (String(employee?.manager ?? "") !== managerId) {
      throw ApiError.forbidden("That request belongs to someone outside your team.");
    }

    const updated = await applyLeaveDecision(
      String(leave._id),
      status,
      managerId,
      reviewNote ?? "",
    );

    res.json({
      message: `Leave request ${status}.`,
      leaveRequest: {
        _id: String(updated._id),
        status: updated.status,
        reviewNote: updated.reviewNote,
        reviewedAt: updated.reviewedAt,
      },
    });
  }),
);

export { directReports };
export default router;