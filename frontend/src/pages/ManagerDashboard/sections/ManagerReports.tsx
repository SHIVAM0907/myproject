import React from "react";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Loader2,
  Percent,
  Target,
  Timer,
  TrendingUp,
  UsersRound,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import employeeApi from "../../../lib/employeeApi";
import type { EmployeeMonthlyReport } from "../../../types/Employee";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEK_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";

const pad = (n: number) => String(n).padStart(2, "0");

function keyFor(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatDuration(minutes?: number) {
  const total = Math.max(0, minutes ?? 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return `${h}h ${m}m`;
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const STATUS_STYLES: Record<string, string> = {
  present: "bg-[#E6F5F2] text-[#0E9F8B] ring-[#0E9F8B]/20",
  late: "bg-[#FDF3DC] text-[#9C6F00] ring-[#E2A100]/30",
  absent: "bg-[#FCE8E8] text-[#E4484D] ring-[#E4484D]/20",
  leave: "bg-[#EEEBFA] text-[#6A55D6] ring-[#6A55D6]/20",
};

// Cells laid out Sunday-first; weekdays get a status chip from the report,
// weekends stay blank.
function weekdayCells(month: Date, byDay: Map<string, EmployeeMonthlyReport["days"][number]>) {
  const year = month.getFullYear();
  const first = new Date(year, month.getMonth(), 1);
  const last = new Date(year, month.getMonth() + 1, 0);

  const cells: (number | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return cells.map((day) => {
    if (day === null) return null;
    const dateKey = keyFor(year, month.getMonth(), day);
    const info = byDay.get(dateKey);
    return {
      day,
      status: info?.status ?? "absent",
      info,
    };
  });
}

const ReportModal: React.FC<{
  report: EmployeeMonthlyReport;
  month: Date;
  onClose: () => void;
}> = ({ report, month, onClose }) => {
  const { member, summary, days } = report;
  const weeks = React.useMemo(() => {
    const byDay = new Map(days.map((day) => [day.date, day]));
    return weekdayCells(month, byDay);
  }, [month, days]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = [
    { label: "Present", value: summary.present, icon: CheckCircle2, tile: "bg-[#E6F5F2]", color: "text-[#0E9F8B]" },
    { label: "Late", value: summary.late, icon: Clock, tile: "bg-[#FDF3DC]", color: "text-[#9C6F00]" },
    { label: "Absent", value: summary.absent, icon: XCircle, tile: "bg-[#FCE8E8]", color: "text-[#E4484D]" },
    { label: "On Leave", value: summary.onLeave, icon: CalendarOff, tile: "bg-[#EEEBFA]", color: "text-[#6A55D6]" },
  ];

  const hours = [
    { label: "Working", value: formatDuration(summary.workingMinutes), icon: Timer, color: "text-[#6A55D6]" },
    { label: "Break", value: formatDuration(summary.breakMinutes), icon: Coffee, color: "text-[#9C6F00]" },
    { label: "Overtime", value: formatDuration(summary.overtimeMinutes), icon: Zap, color: "text-[#E4484D]" },
    { label: "Attendance", value: `${summary.attendanceRate}%`, icon: Target, color: "text-[#0E9F8B]" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2B]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${member.name} monthly report`}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] border border-[#DCE2E8] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#DCE2E8] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#EEEBFA] text-sm font-bold text-[#6A55D6]">
              {initialsFor(member.name)}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#667385]">
                Monthly report · {MONTHS[month.getMonth()]} {month.getFullYear()}
              </p>
              <h4 className={`${DISPLAY} truncate text-lg font-bold`}>{member.name}</h4>
              <p className="truncate text-xs text-[#667385]">
                {member.employeeCode ?? "-"}
                {member.department ? ` · ${member.department}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="rounded-full border border-[#DCE2E8] p-2 text-[#667385] transition hover:bg-[#F4F6F8] hover:text-[#121C2B]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-[#F4F6F8] py-4 text-center">
                <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full ${stat.tile}`}>
                  <stat.icon size={17} className={stat.color} />
                </div>
                <p className={`mt-2 text-2xl font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
                <p className="mt-0.5 text-xs font-medium text-[#667385]">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {hours.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-[#DCE2E8] bg-white p-4">
                <stat.icon size={16} className={stat.color} />
                <p className={`mt-2.5 text-sm font-bold tabular-nums`}>{stat.value}</p>
                <p className="mt-0.5 text-xs text-[#667385]">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-[#DCE2E8] bg-[#F8FAFC] p-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#667385]">
              <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#667385]">
                <CalendarDays size={13} />
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-md bg-[#E6F5F2] ring-1 ring-[#0E9F8B]/20" />Present · {summary.present}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-md bg-[#FDF3DC] ring-1 ring-[#E2A100]/30" />Late · {summary.late}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-md bg-[#FCE8E8] ring-1 ring-[#E4484D]/20" />Absent · {summary.absent}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-md bg-[#EEEBFA] ring-1 ring-[#6A55D6]/20" />Leave · {summary.onLeave}</span>
            </div>

            <div className="mt-3 grid grid-cols-7 gap-1.5">
              {WEEK_HEADERS.map((label, i) => (
                <div
                  key={i}
                  className={`text-center text-[10px] font-semibold uppercase tracking-wider ${
                    i === 0 || i === 6 ? "text-gray-300" : "text-gray-400"
                  }`}
                >
                  {label}
                </div>
              ))}
              {weeks.map((cell, i) =>
                cell === null ? (
                  <div key={i} />
                ) : (
                  <div
                    key={i}
                    title={
                      cell.info?.status === "leave"
                        ? `Leave (${cell.info.leaveType ?? "full day"})`
                        : cell.info?.status === "late" || cell.info?.status === "present"
                          ? `${cell.info.status[0].toUpperCase()}${cell.info.status.slice(1)}${cell.info.workingMinutes ? ` · ${formatDuration(cell.info.workingMinutes)}` : ""}`
                          : "Absent"
                    }
                    className={`flex aspect-square items-center justify-center rounded-xl text-xs font-semibold tabular-nums ring-1 transition-transform duration-150 hover:scale-110 ${STATUS_STYLES[cell.status] ?? "bg-[#F4F6F8] text-[#667385] ring-[#DCE2E8]"}`}
                  >
                    {cell.day}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ManagerReports: React.FC = () => {
  const [month, setMonth] = React.useState(() => new Date());
  const [reports, setReports] = React.useState<EmployeeMonthlyReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [openReport, setOpenReport] = React.useState<EmployeeMonthlyReport | null>(null);

  // Identifies the newest in-flight request. Switching months starts a new
  // fetch, and any response from an earlier one is discarded so a slow reply
  // cannot overwrite the month currently on screen.
  const requestIdRef = React.useRef(0);

  const fetchReports = React.useCallback(async (target: Date) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const res = await employeeApi.get<{ reports: EmployeeMonthlyReport[] }>("/team/reports", {
        params: { date: target.toISOString() },
      });
      if (requestId !== requestIdRef.current) return;
      setReports(res.data.reports ?? []);
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      setReports([]);
      setError(err.response?.data?.message || "Could not load team reports.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Drop the previous month's figures immediately so nothing stale is shown
    // under the new month's heading while the request is in flight.
    setReports([]);
    setOpenReport(null);
    fetchReports(month);
  }, [month, fetchReports]);

  const shiftMonth = (delta: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth();

  const avgAttendance =
    reports.length > 0
      ? Math.round(reports.reduce((sum, report) => sum + (report.summary.attendanceRate ?? 0), 0) / reports.length)
      : 0;

  const lateDays = reports.reduce((sum, report) => sum + (report.summary.late ?? 0), 0);
  const overtimeMinutes = reports.reduce((sum, report) => sum + (report.summary.overtimeMinutes ?? 0), 0);

  const totals = reports.reduce(
    (acc, report) => ({
      present: acc.present + report.summary.present,
      late: acc.late + report.summary.late,
      absent: acc.absent + report.summary.absent,
      onLeave: acc.onLeave + report.summary.onLeave,
      workingMinutes: acc.workingMinutes + report.summary.workingMinutes,
    }),
    { present: 0, late: 0, absent: 0, onLeave: 0, workingMinutes: 0 },
  );

  const summaryCards = [
    { label: "Employees", value: reports.length, icon: UsersRound, bg: "bg-[#EEEBFA]", iconColor: "text-[#6A55D6]" },
    { label: "Avg Attendance", value: `${avgAttendance}%`, icon: Percent, bg: "bg-[#E6F5F2]", iconColor: "text-[#0E9F8B]" },
    { label: "Late Arrivals", value: lateDays, icon: Clock, bg: "bg-[#FDF3DC]", iconColor: "text-[#9C6F00]" },
    { label: "Overtime", value: formatDuration(overtimeMinutes), icon: TrendingUp, bg: "bg-[#FCE8E8]", iconColor: "text-[#E4484D]" },
  ];

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="reports" />
        <Header />

        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#6A55D6] text-white">
              <BarChart3 size={21} />
            </div>
            <div>
              <h2 className={`${DISPLAY} text-xl font-bold`}>Employee Reports</h2>
              <p className="text-xs text-[#667385]">Attendance &amp; leave summary for your team</p>
            </div>
          </div>

          <div className="flex items-center rounded-full border border-[#DCE2E8] bg-white p-1">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-full p-2 text-[#667385] transition hover:bg-[#F4F6F8] hover:text-[#6A55D6]"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-44 border-x border-[#E9EEF3] px-4 text-center">
              <p className="text-sm font-semibold tabular-nums">
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#667385]">
                {isCurrentMonth ? "This month" : "Selected month"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-full p-2 text-[#667385] transition hover:bg-[#F4F6F8] hover:text-[#6A55D6]"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className={`${CARD} flex items-center gap-4`}>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${card.bg}`}>
                <card.icon size={20} className={card.iconColor} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#667385]">{card.label}</p>
                <p className={`${DISPLAY} truncate text-2xl font-bold tabular-nums`}>
                  {loading ? "--" : card.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        <section className="mt-4 overflow-hidden rounded-[18px] border border-[#DCE2E8] bg-white">
          <div className="flex items-center justify-between border-b border-[#E9EEF3] px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEEBFA]">
                <CalendarDays size={18} className="text-[#6A55D6]" />
              </div>
              <div>
                <h3 className={`${DISPLAY} text-[17px] font-bold`}>Monthly Attendance Report</h3>
                <p className="text-xs text-[#667385]">
                  {loading
                    ? "Loading…"
                    : `${reports.length} employee${reports.length === 1 ? "" : "s"}`}{" "}
                  · {MONTHS[month.getMonth()]} {month.getFullYear()}
                </p>
              </div>
            </div>
            {!loading && reports.length > 0 && (
              <span className="hidden items-center gap-1.5 rounded-full bg-[#E6F5F2] px-3 py-1.5 text-xs font-semibold text-[#0E9F8B] sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0E9F8B]" />
                {avgAttendance}% team attendance
              </span>
            )}
          </div>

          {error && <p className="px-5 pt-4 text-sm text-[#E4484D]">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wider text-[#667385]">
                  <th className="py-3 pl-5 pr-4 font-semibold">Employee</th>
                  <th className="py-3 pr-4 font-semibold">Department</th>
                  <th className="py-3 pr-4 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#0E9F8B]" />Present
                    </span>
                  </th>
                  <th className="py-3 pr-4 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#E2A100]" />Late
                    </span>
                  </th>
                  <th className="py-3 pr-4 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#E4484D]" />Absent
                    </span>
                  </th>
                  <th className="py-3 pr-4 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#6A55D6]" />On Leave
                    </span>
                  </th>
                  <th className="py-3 pr-4 font-semibold">Working</th>
                  <th className="py-3 pr-4 font-semibold">Attendance</th>
                  <th className="py-3 pr-5 font-semibold">Report</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E9EEF3]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-sm text-[#667385]">
                      <Loader2 size={18} className="mx-auto animate-spin" />
                      <span className="mt-2 block text-xs text-[#667385]">Loading reports…</span>
                    </td>
                  </tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F4F6F8]">
                        <UsersRound size={24} className="text-[#667385]/40" />
                      </div>
                      <p className="mt-3 text-sm font-semibold">No reports yet</p>
                      <p className="mt-1 text-xs text-[#667385]">
                        Add employees to your team to see their attendance reports.
                      </p>
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => {
                    const { member, summary } = report;
                    const initials = initialsFor(member.name);
                    const rate = summary.attendanceRate ?? 0;
                    const rateColor =
                      rate >= 80 ? "bg-[#E6F5F2] text-[#0E9F8B]" : rate >= 60 ? "bg-[#FDF3DC] text-[#9C6F00]" : "bg-[#FCE8E8] text-[#E4484D]";
                    const barColor =
                      rate >= 80 ? "bg-[#0E9F8B]" : rate >= 60 ? "bg-[#E2A100]" : "bg-[#E4484D]";

                    return (
                      <tr key={member._id} className="text-sm transition-colors hover:bg-[#F8FAFC]">
                        <td className="py-3.5 pl-5 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEEBFA] text-xs font-bold text-[#6A55D6]">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{member.name}</p>
                              <p className="truncate text-xs text-[#667385]">{member.employeeCode ?? "-"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4 text-[#667385]">
                          <span className="inline-flex rounded-full bg-[#F4F6F8] px-2.5 py-1 text-xs font-medium text-[#667385]">
                            {member.department ?? "–"}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 font-semibold tabular-nums text-[#0E9F8B]">{summary.present}</td>
                        <td className="py-3.5 pr-4 font-semibold tabular-nums text-[#9C6F00]">{summary.late}</td>
                        <td className="py-3.5 pr-4 font-semibold tabular-nums text-[#E4484D]">{summary.absent}</td>
                        <td className="py-3.5 pr-4 font-semibold tabular-nums text-[#6A55D6]">{summary.onLeave}</td>
                        <td className="py-3.5 pr-4 font-medium tabular-nums text-[#667385]">{formatDuration(summary.workingMinutes)}</td>
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-2.5">
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[#E9EEF3]">
                              <div
                                className={`h-full ${barColor} transition-all`}
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${rateColor}`}>
                              {rate}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 pr-5">
                          <button
                            type="button"
                            onClick={() => setOpenReport(report)}
                            className="group inline-flex items-center gap-1.5 rounded-full border border-[#6A55D6]/20 bg-[#EEEBFA] px-3.5 py-1.5 text-xs font-semibold text-[#6A55D6] transition hover:bg-[#6A55D6] hover:text-white"
                          >
                            View
                            <ArrowUpRight
                              size={14}
                              className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {!loading && reports.length > 0 && (
                <tfoot>
                  <tr className="border-t border-[#E9EEF3] bg-[#F8FAFC] text-sm font-semibold">
                    <td className="py-3.5 pl-5 pr-4">Team total</td>
                    <td className="py-3.5 pr-4 text-[#667385]">{reports.length} employees</td>
                    <td className="py-3.5 pr-4 tabular-nums text-[#0E9F8B]">{totals.present}</td>
                    <td className="py-3.5 pr-4 tabular-nums text-[#9C6F00]">{totals.late}</td>
                    <td className="py-3.5 pr-4 tabular-nums text-[#E4484D]">{totals.absent}</td>
                    <td className="py-3.5 pr-4 tabular-nums text-[#6A55D6]">{totals.onLeave}</td>
                    <td className="py-3.5 pr-4 tabular-nums">{formatDuration(totals.workingMinutes)}</td>
                    <td className="py-3.5 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                        avgAttendance >= 80 ? "bg-[#E6F5F2] text-[#0E9F8B]" : avgAttendance >= 60 ? "bg-[#FDF3DC] text-[#9C6F00]" : "bg-[#FCE8E8] text-[#E4484D]"
                      }`}>
                        {avgAttendance}%
                      </span>
                    </td>
                    <td className="py-3.5 pr-5 text-[#667385]">
                      <Timer size={16} />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </div>

      {openReport && (
        <ReportModal report={openReport} month={month} onClose={() => setOpenReport(null)} />
      )}
    </div>
  );
};

export default ManagerReports;