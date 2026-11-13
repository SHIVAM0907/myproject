import { Router, type Response } from "express";
import { query } from "express-validator";
import { Employee } from "../models/Employee.js";
import { Attendance } from "../models/Attendance.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { Task } from "../models/Task.js";
import { Query } from "../models/Query.js";
import { Meeting } from "../models/Meeting.js";
import { requireEmployee, requireRole, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  addDays,
  countBusinessDaysInclusive,
  dayKey,
  resolveMonthRange,
  round2,
  startOfLocalDay,
} from "../utils/date.js";
import { serializeToday, recalculateMinutes, findOrCreateToday } from "./attendance.controller.js";
import { teamStats, teamRows } from "./report.controller.js";
import { serializeTask } from "./task.controller.js";

const router = Router();

const PERSON_FIELDS = "firstName lastName employeeCode department role";

/** Counts task statuses into the `TaskSummary` the client renders as tiles. */
function summariseTasks(tasks: Array<{ status: string; dueDate?: Date | string | null }>) {
  const now = new Date();
  const summary = {
    total: tasks.length,
    completed: 0,
    inProgress: 0,
    onHold: 0,
    pending: 0,
    overdue: 0,
  };

  for (const task of tasks) {
    switch (task.status) {
      case "Completed":
        summary.completed += 1;
        break;
      case "In Progress":
        summary.inProgress += 1;
        break;
      case "On Hold":
        summary.onHold += 1;
        break;
      case "Pending":
        summary.pending += 1;
        break;
      default:
        break;
    }
    if (task.status !== "Completed" && task.dueDate && new Date(task.dueDate) < now) {
      summary.overdue += 1;
    }
  }
  return summary;
}

/**
 * GET /dashboard — the employee dashboard payload.
 *
 * Read by EmployeeDashboard (`setDashboard(res.data)`) and, redundantly, by
 * MyTasks which fetches the whole payload just to read `todayWorkSummary`.
 */
router.get(
  "/dashboard",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = String(currentUserId(req));
    const now = new Date();
    const todayKey = dayKey(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dayPrefixes = [`${monthPrefix}-01`, `${monthPrefix}-31`];

    const todayDoc = await findOrCreateToday(employeeId, now);
    recalculateMinutes(todayDoc, now);

    const [monthRecords, allTasks, upcomingMeetings, approvedLeave, pendingLeave] = await Promise.all([
      Attendance.find({
        employee: employeeId,
        dayKey: { $gte: dayPrefixes[0], $lte: dayPrefixes[1] },
      }).lean<Array<Record<string, unknown>>>(),
      Task.find({ assignedTo: employeeId }).lean<Array<Record<string, unknown>>>(),
      Meeting.find({
        $or: [{ createdBy: employeeId }, { participants: employeeId }],
        status: { $in: ["scheduled", "active"] },
        startTime: { $gte: startOfLocalDay(now) },
      })
        .sort({ startTime: 1 })
        .limit(10)
        .lean<Array<Record<string, unknown>>>(),
      LeaveRequest.find({ employee: employeeId, status: "approved" })
        .sort({ toDate: -1 })
        .limit(10)
        .lean<Array<Record<string, unknown>>>(),
      LeaveRequest.find({ employee: employeeId, status: "pending" })
        .sort({ fromDate: -1 })
        .limit(10)
        .lean<Array<Record<string, unknown>>>(),
    ]);

    // --- attendance month map ---
    const dayMap: Record<string, { status: string; date: string }> = {};
    let totalWorkingMinutes = 0;
    let totalBreakMinutes = 0;
    let totalOvertimeMinutes = 0;
    let presentDays = 0;
    let leaveDays = 0;

    for (const rec of monthRecords) {
      const key = String(rec.dayKey);
      const status = String(rec.status ?? "absent");
      dayMap[key] = { status, date: key };
      totalWorkingMinutes += Number(rec.workingMinutes ?? 0);
      totalBreakMinutes += Number(rec.breakMinutes ?? 0);
      totalOvertimeMinutes += Number(rec.overtimeMinutes ?? 0);
      if (status === "present" || status === "late" || status === "half_day") presentDays += 1;
      if (status === "leave") leaveDays += 1;
    }

    // --- period summary: month to date ---
    const monthStartKey = dayKey(monthStart);
    const periodTasks = allTasks.filter((t) => {
      const created = t.createdAt ? new Date(t.createdAt as string) : null;
      return created ? created.getTime() >= monthStart.getTime() : true;
    });

    const summary = {
      startDate: monthStartKey,
      endDate: dayKey(monthEnd),
      totalWorkingMinutes,
      totalOvertimeMinutes,
      presentDays,
      leaveDays,
      tasksCompleted: periodTasks.filter((t) => String(t.status) === "Completed").length,
    };

    // --- recent activity: newest first, across the sources the UI renders ---
    const recentActivity: Array<{ type: string; at: string; meta?: unknown }> = [];
    for (const task of allTasks.slice(0, 5)) {
      recentActivity.push({
        type: "task",
        at: new Date((task.createdAt as string) ?? now).toISOString(),
        meta: { title: task.title, status: task.status },
      });
    }
    for (const leave of [...pendingLeave, ...approvedLeave].slice(0, 5)) {
      recentActivity.push({
        type: "leave",
        at: new Date((leave.createdAt as string) ?? now).toISOString(),
        meta: { status: leave.status, leaveType: leave.leaveType },
      });
    }
    recentActivity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const tasks = allTasks as unknown as Array<{ status: string; dueDate?: Date | string | null }>;
    const taskSummary = summariseTasks(tasks);

    // --- today's work summary, which MyTasks reads in isolation ---
    const todayWorkSummary = {
      totalTasks: tasks.length,
      completed: taskSummary.completed,
      inProgress: taskSummary.inProgress,
      onHold: taskSummary.onHold,
      pending: taskSummary.pending,
      workingMinutes: todayDoc.workingMinutes ?? 0,
      breakMinutes: todayDoc.breakMinutes ?? 0,
      overtimeMinutes: todayDoc.overtimeMinutes ?? 0,
      meetingsCount: upcomingMeetings.length,
    };

    // --- leaveBalance: declared as Record<string, LeaveRequest[]> ---
    const leaveBalance: Record<string, Array<Record<string, unknown>>> = {};
    for (const leave of [...pendingLeave, ...approvedLeave]) {
      const bucket = String(leave.leaveType);
      (leaveBalance[bucket] ??= []).push(leave);
    }

    res.json({
      date: todayKey,
      attendanceToday: serializeToday(todayDoc),
      attendanceMonth: {
        month: monthPrefix,
        dayMap,
        summary: { totalWorkingMinutes, totalBreakMinutes, totalOvertimeMinutes },
      },
      summary,
      recentActivity: recentActivity.slice(0, 12),
      meetings: upcomingMeetings.map((m) => ({
        _id: String(m._id),
        title: m.title,
        startTime: new Date(m.startTime as string).toISOString(),
        status: m.status,
      })),
      taskSummary,
      todayWorkSummary,
      leaveBalance,
    });
  }),
);

/**
 * GET /managers-dashboard — the manager landing payload.
 *
 * `ManagerDashboard` reads `attendance` as a `TeamAttendanceStats` and
 * `attendanceRows` as `TeamAttendanceRow[]`, both of which the report
 * controller already builds for today.
 */
router.get(
  "/managers-dashboard",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const now = new Date();
    const todayKey = dayKey(now);

    const manager = await Employee.findById(managerId).lean<Record<string, unknown>>();
    if (!manager) throw new Error("Manager record vanished mid-request.");

    const todayDoc = await findOrCreateToday(managerId, now);
    recalculateMinutes(todayDoc, now);

    const [{ stats, date }, { rows }, pendingLeaves, teamTasks, teamQueries] = await Promise.all([
      teamStats(String(managerId)),
      teamRows(String(managerId)),
      LeaveRequest.find({ status: "pending" })
        .populate("employee", PERSON_FIELDS)
        .sort({ fromDate: 1 })
        .limit(20)
        .lean<Array<Record<string, unknown>>>(),
      Task.find({ assignedBy: managerId })
        .populate("assignedTo", PERSON_FIELDS)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean<Array<Record<string, unknown>>>(),
      Query.find({ status: { $in: ["open", "in_review"] } })
        .populate("employee", PERSON_FIELDS)
        .populate("task", "taskId title")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean<Array<Record<string, unknown>>>(),
    ]);

    const tasks = teamTasks as unknown as Array<{ status: string; dueDate?: Date | string | null }>;

    const alerts: Array<{ category: string; text: string; time: string }> = [];
    if (stats.absent > 0) {
      alerts.push({
        category: "attendance",
        text: `${stats.absent} team member${stats.absent === 1 ? "" : "s"} not checked in yet.`,
        time: new Date().toISOString(),
      });
    }
    if (teamQueries.length > 0) {
      alerts.push({
        category: "queries",
        text: `${teamQueries.length} open quer${teamQueries.length === 1 ? "y" : "ies"} awaiting review.`,
        time: new Date().toISOString(),
      });
    }
    if (pendingLeaves.length > 0) {
      alerts.push({
        category: "leave",
        text: `${pendingLeaves.length} leave request${pendingLeaves.length === 1 ? "" : "s"} to review.`,
        time: new Date().toISOString(),
      });
    }

    const recentActivity: Array<{ type: string; at: string; meta?: unknown }> = [];
    for (const t of teamTasks.slice(0, 5)) {
      recentActivity.push({
        type: "task",
        at: new Date((t.createdAt as string) ?? now).toISOString(),
        meta: { title: t.title, status: t.status },
      });
    }
    for (const q of teamQueries.slice(0, 5)) {
      recentActivity.push({
        type: "query",
        at: new Date((q.createdAt as string) ?? now).toISOString(),
        meta: { status: q.status },
      });
    }
    recentActivity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    res.json({
      date: todayKey,
      attendanceToday: serializeToday(todayDoc),
      attendance: { ...stats, date },
      attendanceRows: rows,
      pendingLeaves,
      taskSummary: summariseTasks(tasks),
      tasks: teamTasks.map((t) => serializeTask(t)),
      queries: teamQueries,
      alerts,
      recentActivity: recentActivity.slice(0, 12),
    });
  }),
);

/**
 * GET /calendar/events?month=YYYY-MM
 *
 * `Simplecalendar` sends "YYYY-MM" (unlike /attendance/month and /team/reports,
 * which send a full ISO datetime), and omitting it means the current month.
 * The local `CalendarEvent` type uses `id`, not `_id`.
 */
router.get(
  "/calendar/events",
  validate([query("month").optional().isString().withMessage("month must be a YYYY-MM string.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = String(currentUserId(req));
    const { start, end } = resolveMonthRange(req.query.month);
    const fromKey = dayKey(start);
    const toKey = dayKey(end);

    const [tasks, meetings, queries, leaves] = await Promise.all([
      Task.find({
        $or: [{ assignedTo: employeeId }, { assignedBy: employeeId }],
        createdAt: { $gte: start, $lte: end },
      })
        .select("title status dueDate createdAt")
        .lean<Array<Record<string, unknown>>>(),
      Meeting.find({
        $or: [{ createdBy: employeeId }, { participants: employeeId }],
        startTime: { $gte: start, $lte: end },
        status: { $ne: "cancelled" },
      })
        .select("title status startTime")
        .lean<Array<Record<string, unknown>>>(),
      Query.find({ employee: employeeId, createdAt: { $gte: start, $lte: end } })
        .select("status createdAt task")
        .lean<Array<Record<string, unknown>>>(),
      LeaveRequest.find({
        employee: employeeId,
        status: { $in: ["pending", "approved"] },
        fromDate: { $lte: end },
        toDate: { $gte: start },
      })
        .select("leaveType status fromDate")
        .lean<Array<Record<string, unknown>>>(),
    ]);

    const events: Array<{
      id: string;
      title: string;
      type: "task" | "meeting" | "query" | "leave";
      date: string;
      status?: string;
    }> = [];

    for (const t of tasks) {
      events.push({
        id: String(t._id),
        title: String(t.title),
        type: "task",
        date: dayKey(new Date((t.dueDate as string) ?? (t.createdAt as string))),
        status: String(t.status),
      });
    }
    for (const m of meetings) {
      events.push({
        id: String(m._id),
        title: String(m.title),
        type: "meeting",
        date: dayKey(new Date(m.startTime as string)),
        status: String(m.status),
      });
    }
    for (const q of queries) {
      events.push({
        id: String(q._id),
        title: "Query raised",
        type: "query",
        date: dayKey(new Date(q.createdAt as string)),
        status: String(q.status),
      });
    }
    for (const l of leaves) {
      events.push({
        id: String(l._id),
        title: `${l.leaveType} leave`,
        type: "leave",
        date: dayKey(new Date(l.fromDate as string)),
        status: String(l.status),
      });
    }

    events.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ events });
  }),
);

/**
 * GET /queries/team -> `{ queries }` and
 * GET /queries/stats -> a BARE object (no `{ stats }` envelope, unlike
 * /team/attendance/stats). Managerqueries fetches both in a `Promise.all`, so
 * one failure blanks both panels.
 */
router.get(
  "/queries/team",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));

    const teamIds = (
      await Employee.find({ manager: managerId }).select("_id").lean<Array<{ _id: unknown }>>()
    ).map((e) => String(e._id));

    const queries = await Query.find({
      $or: [{ employee: { $in: teamIds } }, { employee: managerId }],
    })
      .populate("employee", PERSON_FIELDS)
      .populate("task", "taskId title")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean<Array<Record<string, unknown>>>();

    res.json({ queries });
  }),
);

router.get(
  "/queries/stats",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const teamIds = (
      await Employee.find({ manager: managerId }).select("_id").lean<Array<{ _id: unknown }>>()
    ).map((e) => String(e._id));

    const filter = { $or: [{ employee: { $in: teamIds } }, { employee: managerId }] };

    const [total, open, inReview, resolved, raisedAgain] = await Promise.all([
      Query.countDocuments(filter),
      Query.countDocuments({ ...filter, status: "open" }),
      Query.countDocuments({ ...filter, status: "in_review" }),
      Query.countDocuments({ ...filter, status: "resolved" }),
      Query.countDocuments({ ...filter, status: "raised_again" }),
    ]);

    // Deliberately bare: Managerqueries destructures these keys off the body.
    res.json({ total, open, inReview, resolved, raisedAgain });
  }),
);

export { summariseTasks };
export default router;