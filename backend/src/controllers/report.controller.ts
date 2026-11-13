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
  eachDayKey,
  parseDayKey,
  percent,
  resolveMonthRange,
  round2,
  startOfLocalDay,
} from "../utils/date.js";

const router = Router();

/**
 * Maps an internal attendance status onto the 4-value union the monthly report
 * declares (`"present" | "late" | "absent" | "leave"`). `half_day`, `on_break`
 * and `on_call` have no report representation, so they fold into `present` —
 * the person was at work.
 */
function reportStatus(status: string | undefined): "present" | "late" | "absent" | "leave" {
  switch (status) {
    case "leave":
      return "leave";
    case "absent":
      return "absent";
    case "late":
      return "late";
    case "present":
    case "half_day":
    case "on_break":
    case "on_call":
    default:
      return "present";
  }
}

interface ReportDay {
  date: string;
  status: "present" | "late" | "absent" | "leave";
  leaveType?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingMinutes?: number;
  breakMinutes?: number;
  overtimeMinutes?: number;
}

/**
 * Builds one employee's month: a day row for every calendar day, with approved
 * leave projected onto days that have no attendance record.
 */
async function buildMonthFor(employeeId: string, start: Date, end: Date): Promise<ReportDay[]> {
  const fromKey = dayKey(start);
  const toKey = dayKey(end);

  const [records, approvedLeave] = await Promise.all([
    Attendance.find({ employee: employeeId, dayKey: { $gte: fromKey, $lte: toKey } }).lean<
      Array<Record<string, unknown>>
    >(),
    LeaveRequest.find({
      employee: employeeId,
      status: "approved",
      fromDate: { $lte: end },
      toDate: { $gte: start },
    }).lean<Array<{ fromDate: Date; toDate: Date; leaveType: string }>>(),
  ]);

  const byDay = new Map<string, Record<string, unknown>>();
  for (const rec of records) byDay.set(String(rec.dayKey), rec);

  const leaveByDay = new Map<string, string>();
  for (const leave of approvedLeave) {
    for (const key of eachDayKey(startOfLocalDay(leave.fromDate), startOfLocalDay(leave.toDate))) {
      if (key < fromKey || key > toKey) continue;
      leaveByDay.set(key, leave.leaveType);
    }
  }

  const days: ReportDay[] = [];
  for (const key of eachDayKey(start, end)) {
    const rec = byDay.get(key);

    if (rec) {
      days.push({
        date: key,
        status: reportStatus(String(rec.status ?? "absent")),
        leaveType: rec.leaveType ? String(rec.leaveType) : undefined,
        checkIn: rec.checkIn ? new Date(rec.checkIn as string).toISOString() : null,
        checkOut: rec.checkOut ? new Date(rec.checkOut as string).toISOString() : null,
        workingMinutes: Number(rec.workingMinutes ?? 0),
        breakMinutes: Number(rec.breakMinutes ?? 0),
        overtimeMinutes: Number(rec.overtimeMinutes ?? 0),
      });
      continue;
    }

    const leaveType = leaveByDay.get(key);
    if (leaveType) {
      days.push({ date: key, status: "leave", leaveType });
      continue;
    }

    // Future days and weekends shouldn't be reported as absences, so they are
    // omitted entirely rather than counted against the employee.
    const isFuture = startOfLocalDay(parseDayKey(key) ?? new Date()).getTime() > Date.now();
    if (isFuture) continue;

    const parsed = parseDayKey(key);
    const isWeekend = parsed ? parsed.getDay() === 0 || parsed.getDay() === 6 : false;
    if (isWeekend) continue;

    days.push({ date: key, status: "absent" });
  }

  return days;
}

/**
 * GET /team/reports?date=<ISO datetime>
 *
 * ManagerReports sends `date.toISOString()` — a full datetime, not "YYYY-MM" —
 * so `resolveMonthRange` handles the parsing. Returns `{ reports }` where each
 * report nests a pre-joined `member.name` rather than split first/last.
 */
router.get(
  "/team/reports",
  requireRole("manager"),
  validate([query("date").optional().isString().withMessage("date must be a date string.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = String(currentUserId(req));
    const { start, end, monthKey } = resolveMonthRange(req.query.date);

    const members = await Employee.find({ manager: managerId })
      .select("firstName lastName employeeCode department")
      .lean<Array<Record<string, unknown>>>();

    const businessDays = countBusinessDaysInclusive(start, end);

    const reports = await Promise.all(
      members.map(async (member) => {
        const days = await buildMonthFor(String(member._id), start, end);

        const present = days.filter((d) => d.status === "present").length;
        const late = days.filter((d) => d.status === "late").length;
        const absent = days.filter((d) => d.status === "absent").length;
        const onLeave = days.filter((d) => d.status === "leave").length;

        const sum = (key: "workingMinutes" | "breakMinutes" | "overtimeMinutes") =>
          days.reduce((acc, d) => acc + (d[key] ?? 0), 0);

        const accounted = present + late + absent + onLeave;

        return {
          member: {
            _id: String(member._id),
            name: `${member.firstName} ${member.lastName}`.trim(),
            employeeCode: member.employeeCode,
            department: member.department ?? "",
          },
          summary: {
            present,
            late,
            absent,
            onLeave,
            workingMinutes: sum("workingMinutes"),
            breakMinutes: sum("breakMinutes"),
            overtimeMinutes: sum("overtimeMinutes"),
            attendanceRate: percent(accounted - absent, accounted || businessDays),
          },
          days,
        };
      }),
    );

    res.json({ month: monthKey, reports });
  }),
);

/** GET /team/attendance/stats -> `{ date, stats }` (envelope, not bare). */
router.get(
  "/team/attendance/stats",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { date, stats } = await teamStats(String(currentUserId(req)));
    res.json({ date, stats });
  }),
);

/** GET /team/attendance/rows -> `{ date, rows }` (same envelope shape). */
router.get(
  "/team/attendance/rows",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { date, rows } = await teamRows(String(currentUserId(req)));
    res.json({ date, rows });
  }),
);

/**
 * Shared team-attendance aggregation for today's roster.
 *
 * Note `ManagerDashboard.tsx` casts this to
 * `Record<string, number> | undefined` when passing it to TodayAttendance,
 * which conflicts with the declared `TeamAttendanceStats` (it has string arrays
 * and an object array). The declared shape is authoritative here.
 */
async function teamStats(managerId: string) {
  const key = dayKey();
  const members = await Employee.find({ manager: managerId })
    .select("firstName lastName")
    .lean<Array<{ _id: unknown; firstName: string; lastName: string }>>();
  const memberIds = members.map((m) => String(m._id));
  const nameOf = (id: string) => {
    const m = members.find((x) => String(x._id) === id);
    return m ? `${m.firstName} ${m.lastName}`.trim() : "Unknown";
  };

  const rows = memberIds.length
    ? await Attendance.find({ employee: { $in: memberIds }, dayKey: key }).lean<
        Array<Record<string, unknown>>
      >()
    : [];

  const byEmployee = new Map(rows.map((r) => [String(r.employee), r]));

  let present = 0;
  let late = 0;
  let absent = 0;
  let onLeave = 0;
  let onBreak = 0;
  let onCall = 0;
  let abnormal = 0;

  const onBreakNames: string[] = [];
  const onCallNames: string[] = [];
  const abnormalNames: string[] = [];
  const onCallMeetings: Array<{ name: string; title: string | null; with: string }> = [];

  const now = new Date();
  const activeMeetings = memberIds.length
    ? await Meeting.find({
        status: "active",
        $or: [{ createdBy: { $in: memberIds } }, { participants: { $in: memberIds } }],
      })
        .populate("participants", "firstName lastName")
        .lean<Array<Record<string, unknown>>>()
    : [];

  for (const member of members) {
    const id = String(member._id);
    const record = byEmployee.get(id);
    const name = `${member.firstName} ${member.lastName}`.trim();
    const status = String(record?.status ?? "absent");

    switch (status) {
      case "present":
        present += 1;
        break;
      case "late":
        late += 1;
        break;
      case "leave":
        onLeave += 1;
        break;
      case "on_break":
        onBreak += 1;
        onBreakNames.push(name);
        break;
      case "on_call":
        onCall += 1;
        onCallNames.push(name);
        break;
      case "half_day":
        present += 1;
        abnormal += 1;
        abnormalNames.push(name);
        break;
      default:
        absent += 1;
    }

    // An open shift with no check-out several hours in is worth flagging.
    if (status === "present" && record?.checkIn && !record?.checkOut) {
      const hours = (now.getTime() - new Date(record.checkIn as string).getTime()) / 3_600_000;
      if (hours >= 10) {
        abnormal += 1;
        abnormalNames.push(name);
      }
    }

    const meeting = activeMeetings.find(
      (m) => String(m.createdBy) === id || (m.participants as unknown[])?.some((p) => String((p as { _id?: unknown })?._id) === id),
    );
    if (meeting) {
      onCallMeetings.push({
        name,
        title: (meeting.title as string) ?? null,
        with:
          ((meeting.participants as unknown[]) ?? [])
            .map((p) => `${(p as { firstName?: string })?.firstName ?? ""} ${(p as { lastName?: string })?.lastName ?? ""}`.trim())
            .filter(Boolean)
            .join(", ") || "Solo",
      });
    }
  }

  const total = members.length;
  return {
    date: key,
    stats: {
      date: key,
      total,
      present,
      late,
      absent,
      presentPct: percent(present, total),
      latePct: percent(late, total),
      absentPct: percent(absent, total),
      onLeave,
      onLeavePct: percent(onLeave, total),
      onBreak,
      onBreakPct: percent(onBreak, total),
      onCall,
      onCallPct: percent(onCall, total),
      abnormal,
      abnormalPct: percent(abnormal, total),
      onBreakNames,
      onCallNames,
      abnormalNames,
      onCallMeetings,
    },
  };
}

/** Per-employee rows for the team attendance table. */
async function teamRows(managerId: string) {
  const key = dayKey();
  const members = await Employee.find({ manager: managerId })
    .select("firstName lastName employeeCode department role")
    .lean<Array<Record<string, unknown>>>();
  const memberIds = members.map((m) => String(m._id));

  const records = memberIds.length
    ? await Attendance.find({ employee: { $in: memberIds }, dayKey: key }).lean<
        Array<Record<string, unknown>>
      >()
    : [];
  const byEmployee = new Map(records.map((r) => [String(r.employee), r]));

  const activityLabel: Record<string, string> = {
    present: "Working",
    late: "Working",
    on_break: "On break",
    on_call: "On call",
    leave: "On leave",
    half_day: "Half day",
    absent: "Not checked in",
  };

  const rows = members.map((member) => {
    const record = byEmployee.get(String(member._id));
    const status = String(record?.status ?? "absent");
    return {
      _id: String(member._id),
      name: `${member.firstName} ${member.lastName}`.trim(),
      firstName: member.firstName,
      lastName: member.lastName,
      employeeCode: member.employeeCode,
      department: member.department ?? "",
      role: member.role,
      attendance: status,
      activity: activityLabel[status] ?? status,
      checkIn: record?.checkIn ? new Date(record.checkIn as string).toISOString() : null,
      checkOut: record?.checkOut ? new Date(record.checkOut as string).toISOString() : null,
      workingMinutes: Number(record?.workingMinutes ?? 0),
      lateMinutes: Number(record?.lateMinutes ?? 0),
    };
  });

  return { date: key, rows };
}

export { teamStats, teamRows, buildMonthFor, reportStatus };
export default router;