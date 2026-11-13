import React from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import SimpleCalendar from "../components/Simplecalendar";
import AvailableEmployees from "../components/Availableemployees";
import TaskSummary from "../components/Tasksummary";
import AssignTaskForm from "../components/Assigntaskform";
import AllTasksTable from "../components/Alltaskstable";
import employeeApi from "../../../lib/employeeApi";
import type { Task, TaskStatus, TaskSummary as TaskSummaryType } from "../../../types/Employee";

type TeamMember = {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
};

type CalendarEvent = {
  id: string;
  title: string;
  type: "task" | "meeting" | "query";
  date: string;
  status?: string;
};

/** `stats` keys mirror the backend's `teamStats`, which counts today's roster. */
type TeamAttendanceStats = Record<string, number> | undefined;

/**
 * Manager → Assigned tasks.
 *
 * Everything on this screen comes from the API:
 *   GET  /team                   the roster, for the picker and the "+ Assign" list
 *   GET  /team/tasks             tasks across the whole team
 *   GET  /team/tasks/summary     the counts for the summary strip
 *   GET  /calendar/events        due dates and meetings for the month grid
 *   GET  /team/attendance/stats  today's roster for the status strip
 *
 * The team task list is a separate endpoint from `/tasks` on purpose: `/tasks`
 * is scoped to `assignedTo: me`, so a manager asking it would only ever see
 * their own tasks, never their reports'.
 *
 * Assigning and changing status are handled by the child components
 * (AssignTaskForm posts to /tasks, AllTasksTable patches the status); both call
 * `load` afterwards so the summary, the table and the calendar cannot drift
 * apart.
 */
const AssignedTasks: React.FC = () => {
  const [members, setMembers] = React.useState<TeamMember[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [summary, setSummary] = React.useState<TaskSummaryType | null>(null);
  const [stats, setStats] = React.useState<TeamAttendanceStats>(undefined);
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyTaskId, setBusyTaskId] = React.useState<string | null>(null);

  // The calendar grid owns its own month, and only refetches when it changes —
  // so this is a separate call from the main load rather than part of it.
  const fetchCalendar = React.useCallback(async (month?: string) => {
    try {
      const res = await employeeApi.get<{ events: CalendarEvent[] }>("/calendar/events", {
        params: month ? { month } : {},
      });
      setEvents(res.data.events ?? []);
    } catch {
      // The month grid is supporting detail: a failure here should not blank
      // the page, so it is swallowed and the grid just shows no dots.
      setEvents([]);
    }
  }, []);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [teamRes, tasksRes, summaryRes, statsRes] = await Promise.all([
        employeeApi.get<{ members: TeamMember[] }>("/team"),
        employeeApi.get<{ tasks: Task[] }>("/team/tasks"),
        employeeApi.get<TaskSummaryType>("/team/tasks/summary"),
        employeeApi.get<{ stats: TeamAttendanceStats }>("/team/attendance/stats"),
      ]);

      setMembers(teamRes.data.members ?? []);
      setTasks(tasksRes.data.tasks ?? []);
      setSummary(summaryRes.data ?? null);
      setStats(statsRes.data.stats);
      await fetchCalendar();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load assigned tasks.");
    } finally {
      setLoading(false);
    }
  }, [fetchCalendar]);

  React.useEffect(() => {
    load();
  }, [load]);

  /**
   * Status changes apply optimistically, because the select would otherwise
   * snap back to its old value for the length of the request and read as though
   * the change was rejected. On failure the previous task list is restored and
   * the server's message shown, so the table can never claim a status the
   * backend did not accept.
   */
  const changeStatus = async (taskId: string, status: TaskStatus) => {
    const previous = tasks;
    setBusyTaskId(taskId);
    setError(null);
    setTasks((prev) => prev.map((t) => (t._id === taskId ? { ...t, status } : t)));
    try {
      await employeeApi.patch(`/tasks/${taskId}/status`, { status });
      // Reload rather than patching locally: the summary counts and the
      // calendar dots both derive from status, so they need the server's view.
      await load();
    } catch (err: any) {
      setTasks(previous);
      setError(err.response?.data?.message || "Could not update that task.");
    } finally {
      setBusyTaskId(null);
    }
  };

  // The status strip used to show invented numbers. These are the real keys
  // from `teamStats`; anything it does not report is treated as zero.
  const attendance = [
    { label: "Present", value: stats?.present ?? 0, color: "#0E9F8B" },
    { label: "On leave", value: stats?.onLeave ?? 0, color: "#667385" },
    { label: "Late", value: stats?.late ?? 0, color: "#E2A100" },
    { label: "Absent", value: stats?.absent ?? 0, color: "#E4484D" },
  ];

  const open = (summary?.total ?? 0) - (summary?.completed ?? 0);

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="assigned-tasks" />
        <Header />

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
          >
            {error}
          </div>
        )}

        <div className="mt-4">
          <TaskSummary summary={summary} loading={loading} />
        </div>

        {summary && (
          <p className="mt-2 px-1 text-sm text-[#667385]">
            {open} open task{open === 1 ? "" : "s"} across your team.
            {summary.overdue ? ` ${summary.overdue} overdue and needs attention.` : " Nothing is overdue."}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
          <SimpleCalendar events={events} onMonthChange={fetchCalendar} />
          <AvailableEmployees members={members} loading={loading} />
        </div>

        <div className="mt-4">
          <AssignTaskForm members={members} onCreated={load} />
        </div>

        <div className="mt-4">
          <AllTasksTable
            tasks={tasks}
            loading={loading}
            onStatusChange={changeStatus}
            busyTaskId={busyTaskId}
          />
        </div>

        <section aria-label="Employee status" className="mt-4 flex flex-wrap gap-2">
          {attendance.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-xl border border-[#DCE2E8] bg-white px-4 py-2.5"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              <b className="font-['Bricolage_Grotesque',sans-serif] text-xl">{s.value}</b>
              <span className="text-[13px] text-[#667385]">{s.label.toLowerCase()}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default AssignedTasks;
