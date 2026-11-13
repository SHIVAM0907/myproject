import React from "react";
import { ClipboardList, Search, ChevronDown, ChevronLeft, ChevronRight, UserRound, Check, Paperclip } from "lucide-react";
import type { Task } from "../../../types/Employee";
import { getSignedFileUrls } from "../../../utils/getImageUrl";

type Priority = "High" | "Medium" | "Low";
type Status = "In Progress" | "On Hold" | "Pending" | "Not Started" | "Completed";
type DueFilter = "all" | "overdue" | "today" | "week" | "none";

const STATUS_OPTIONS: Status[] = ["Not Started", "In Progress", "On Hold", "Pending", "Completed"];
const PRIORITY_OPTIONS: Priority[] = ["High", "Medium", "Low"];
const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "All Due Dates" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due Today" },
  { value: "week", label: "Due This Week" },
  { value: "none", label: "No Due Date" },
];

/** Attachment storage key -> signed URL, for every row in the table. */
const attachmentHref = (key: string, urls: Record<string, string>) =>
  urls[key] || (/^https?:\/\//i.test(key) ? key : "");

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;

const FilterDropdown: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}> = ({ label, options, value, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const active = options.find((option) => option.value === value);
  const isFiltered = !!active && active.label !== label;

  React.useEffect(() => {
    if (!open) return;
    const onClickAway = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${
          isFiltered ? "border-[#2459A6] bg-blue-50/60 text-[#2459A6]" : "border-gray-200 text-gray-600 hover:bg-gray-50"
        }`}
      >
        {active?.label ?? label}
        <ChevronDown size={14} className={`text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 z-30 mt-2 max-h-60 w-52 overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                    selected ? "bg-blue-50 font-semibold text-[#2459A6]" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {option.label}
                  {selected && <Check size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

type AllTasksTableProps = {
  tasks?: Task[];
  loading?: boolean;
  /**
   * Enables the inline status editor. Omitted, the Status column stays a
   * read-only badge — so a screen that only wants to review tasks does not have
   * to handle the mutation or its failure.
   */
  onStatusChange?: (taskId: string, status: Status) => void;
  /** Id of the task whose status request is in flight, to disable its select. */
  busyTaskId?: string | null;
};

/**
 * Attachment links for one row.
 *
 * The stored value is a storage key, so it has to be signed before it will open.
 * When signing fails the control stays visible but inert, with the file name in
 * the tooltip -- a plain dash would read as "no attachments" and hide the fact
 * that something is attached but unreachable.
 */
const FilesCell: React.FC<{ task: Task; fileUrls: Record<string, string> }> = ({ task, fileUrls }) => {
  const files = task.attachments ?? [];
  if (files.length === 0) return <span className="text-gray-300">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {files.map((key, i) => {
        const href = attachmentHref(key, fileUrls);
        const label = key.split("/").pop() || `Attachment ${i + 1}`;
        const short = label.length > 18 ? `${label.slice(0, 16)}…` : label;
        return href ? (
          <a
            key={`${key}-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            className="inline-flex max-w-[9.5rem] items-center gap-1 rounded-md bg-blue-50 px-1.5 py-1 text-xs font-medium text-[#2459A6] hover:bg-blue-100 hover:underline"
          >
            <Paperclip size={11} className="shrink-0" />
            <span className="truncate">{short}</span>
          </a>
        ) : (
          <span
            key={`${key}-${i}`}
            title={`${label} — link unavailable`}
            className="inline-flex max-w-[9.5rem] items-center gap-1 rounded-md bg-gray-50 px-1.5 py-1 text-xs font-medium text-gray-400"
          >
            <Paperclip size={11} className="shrink-0" />
            <span className="truncate">{short}</span>
          </span>
        );
      })}
    </div>
  );
};

const AllTasksTable: React.FC<AllTasksTableProps> = ({
  tasks = [],
  loading = false,
  onStatusChange,
  busyTaskId,
}) => {
  const [page, setPage] = React.useState(1);
  const [query, setQuery] = React.useState("");
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [priorityFilter, setPriorityFilter] = React.useState("all");
  const [employeeFilter, setEmployeeFilter] = React.useState("all");
  const [dueFilter, setDueFilter] = React.useState<DueFilter>("all");
  // Attachment values are storage keys, not URLs. Sign them all whenever the
  // rows change; a key that cannot be signed renders as an inert label rather
  // than a link that opens nothing.
  const [fileUrls, setFileUrls] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    let mounted = true;
    const keys = tasks.flatMap((t) => t.attachments ?? []);
    if (keys.length === 0) {
      setFileUrls({});
      return;
    }
    getSignedFileUrls(keys).then((urls) => {
      if (mounted) setFileUrls(Object.fromEntries(keys.map((k, i) => [k, urls[i] ?? ""])));
    });
    return () => {
      mounted = false;
    };
  }, [tasks]);

  // Employee options come from the loaded rows, so the list always reflects
  // whoever actually has a task rather than the whole roster.
  const employeeOptions = Array.from(
    tasks.reduce((acc, task) => {
      const assignee = typeof task.assignedTo === "object" ? task.assignedTo : null;
      const key = assignee?._id ?? "unassigned";
      if (!acc.has(key)) {
        const name = assignee ? `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim() || "Unassigned" : "Unassigned";
        acc.set(key, { value: key, label: name });
      }
      return acc;
    }, new Map<string, { value: string; label: string }>()).values(),
  ).sort((a, b) => a.label.localeCompare(b.label));

  const filteredTasks = tasks.filter((task) => {
    const assignee = typeof task.assignedTo === "object" ? task.assignedTo : null;
    const assigneeName = assignee ? `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim() : "";
    const text = `${task.title} ${task.taskId ?? ""} ${assigneeName}`.toLowerCase();
    if (!text.includes(query.toLowerCase())) return false;

    if (statusFilter !== "all" && (task.status ?? "Not Started") !== statusFilter) return false;
    if (priorityFilter !== "all" && (task.priority ?? "Medium") !== priorityFilter) return false;

    if (employeeFilter !== "all") {
      const key = assignee?._id ?? "unassigned";
      if (key !== employeeFilter) return false;
    }

    if (dueFilter !== "all") {
      if (!task.dueDate) return dueFilter === "none";
      const due = new Date(task.dueDate).getTime();
      if (Number.isNaN(due)) return false;

      const todayStart = startOfDay(new Date());
      if (dueFilter === "overdue") return due < todayStart;
      if (dueFilter === "today") return due >= todayStart && due <= endOfDay(new Date());
      if (dueFilter === "week") {
        const weekEnd = endOfDay(new Date(Date.now() + 6 * 86400000));
        return due >= todayStart && due <= weekEnd;
      }
    }

    return true;
  });

  const totalTasks = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalTasks / 10));
  const pageItems = filteredTasks.slice((page - 1) * 10, page * 10);

  const priorityStyles: Record<Priority, string> = {
    High: "bg-rose-50 text-rose-600",
    Medium: "bg-amber-50 text-amber-600",
    Low: "bg-green-50 text-green-600",
  };

  const statusStyles: Record<Status, string> = {
    "In Progress": "bg-blue-50 text-blue-600",
    "On Hold": "bg-violet-50 text-violet-600",
    Pending: "bg-amber-50 text-amber-600",
    "Not Started": "bg-gray-100 text-gray-500",
    Completed: "bg-emerald-50 text-emerald-600",
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">All Tasks</h3>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search tasks..."
            className="w-48 bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FilterDropdown
          label="All Status"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All Status" },
            ...STATUS_OPTIONS.map((option) => ({ value: option, label: option })),
          ]}
        />

        <FilterDropdown
          label="All Priority"
          value={priorityFilter}
          onChange={(value) => {
            setPriorityFilter(value);
            setPage(1);
          }}
          options={[
            { value: "all", label: "All Priority" },
            ...PRIORITY_OPTIONS.map((option) => ({ value: option, label: option })),
          ]}
        />

        <FilterDropdown
          label="All Employees"
          value={employeeFilter}
          onChange={(value) => {
            setEmployeeFilter(value);
            setPage(1);
          }}
          options={[{ value: "all", label: "All Employees" }, ...employeeOptions]}
        />

        <FilterDropdown
          label="All Due Dates"
          value={dueFilter}
          onChange={(value) => {
            setDueFilter(value as DueFilter);
            setPage(1);
          }}
          options={DUE_OPTIONS}
        />

        {(statusFilter !== "all" || priorityFilter !== "all" || employeeFilter !== "all" || dueFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setPriorityFilter("all");
              setEmployeeFilter("all");
              setDueFilter("all");
              setPage(1);
            }}
            className="rounded-xl px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs font-medium text-gray-400">
              <th className="w-8 pb-3">
                <input type="checkbox" className="rounded border-gray-300" />
              </th>
              <th className="pb-3 pr-4 font-medium">Task Title</th>
              <th className="pb-3 pr-4 font-medium">Task ID</th>
              <th className="pb-3 pr-4 font-medium">Assigned To</th>
              <th className="pb-3 pr-4 font-medium">Due Date</th>
              <th className="pb-3 pr-4 font-medium">Priority</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 pr-4 font-medium">Files</th>
              <th className="pb-3 font-medium">Action</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={9} className="py-6 text-center text-sm text-gray-400">Loading tasks…</td></tr>
            ) : pageItems.length === 0 ? (
              <tr><td colSpan={9} className="py-6 text-center text-sm text-gray-400">No tasks found.</td></tr>
            ) : (
              pageItems.map((task) => {
                const assignee = typeof task.assignedTo === "object" ? task.assignedTo : null;
                const assigneeName = assignee ? `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim() : "Unassigned";
                const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
                const status = (task.status ?? "Not Started") as Status;
                const priority = (task.priority ?? "Medium") as Priority;
                return (
                  <tr key={task._id ?? task.taskId} className="text-sm">
                    <td className="py-3"><input type="checkbox" className="rounded border-gray-300" /></td>
                    <td className="py-3 pr-4 font-medium text-[#2459A6]">{task.title}</td>
                    <td className="py-3 pr-4 text-gray-500">{task.taskId ?? "-"}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50">
                          <UserRound size={16} className="text-[#2459A6]" />
                        </div>
                        <div>
                          <p className="font-medium text-[#10284A]">{assigneeName}</p>
                          <p className="text-xs text-gray-400">{assignee?.employeeCode ?? "Employee"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-600">{dueDate}</td>
                    <td className="py-3 pr-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityStyles[priority]}`}>{priority}</span></td>
                    <td className="py-3 pr-4">
                      <FilesCell task={task} fileUrls={fileUrls} />
                    </td>
                    <td className="py-3 pr-4">
                      {onStatusChange ? (
                        <select
                          aria-label={`Status for ${task.title}`}
                          value={status}
                          disabled={busyTaskId === (task._id ?? task.taskId)}
                          onChange={(e) => onStatusChange(task._id ?? task.taskId ?? "", e.target.value as Status)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold outline-none disabled:opacity-50 ${statusStyles[status]}`}
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}>● {status}</span>
                      )}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedTask(task)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-[#2459A6] transition hover:bg-gray-50"
                      >
                        View More
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-end">
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50">
            <ChevronLeft size={16} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)} className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition ${page === p ? "bg-[#2459A6] text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {p}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">Task Details</p>
                <h4 className="mt-2 text-xl font-semibold text-[#10284A]">{selectedTask.title}</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="rounded-full border border-gray-200 px-2 py-1 text-sm text-gray-500 transition hover:bg-gray-50"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-gray-500">Task ID</p>
                <p className="mt-1 font-semibold text-[#10284A]">{selectedTask.taskId ?? "-"}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-gray-500">Priority</p>
                <p className="mt-1 font-semibold text-[#10284A]">{selectedTask.priority ?? "Medium"}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-gray-500">Assignee</p>
                <p className="mt-1 font-semibold text-[#10284A]">{typeof selectedTask.assignedTo === "object" ? `${selectedTask.assignedTo.firstName ?? ""} ${selectedTask.assignedTo.lastName ?? ""}`.trim() || "Unassigned" : "Unassigned"}</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-gray-500">Status</p>
                <p className="mt-1 font-semibold text-[#10284A]">{selectedTask.status ?? "Not Started"}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-sm font-medium text-[#10284A]">Description</p>
              <p className="mt-2 text-sm text-gray-600">{selectedTask.description || "No description provided."}</p>
            </div>

            {(selectedTask.attachments ?? []).length > 0 && (
              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <p className="text-sm font-medium text-[#10284A]">
                  Files ({(selectedTask.attachments ?? []).length})
                </p>
                <div className="mt-2">
                  <FilesCell task={selectedTask} fileUrls={fileUrls} />
                </div>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="rounded-xl bg-[#2459A6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1d4d91]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AllTasksTable;
