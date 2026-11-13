import React, { useEffect, useState } from "react";
import { ClipboardList, CalendarDays, Paperclip } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";
import { getSignedFileUrl } from "../../../utils/getImageUrl";

type Priority = "High" | "Medium" | "Low";
type Status = "Not Started" | "In Progress" | "On Hold" | "Pending" | "Completed";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

// The API may send plain strings or objects. `url` should be a ready-to-open
// (signed) link; without it the file is shown as a disabled "View" label.
type Attachment =
  | string
  | {
      name?: string;
      fileName?: string;
      originalName?: string;
      url?: string;
      key?: string;
    };

type Task = {
  _id: string;
  taskId?: string;
  title: string;
  // Free-text details of the task. Change this key if your API names it differently.
  description?: string | null;
  dueDate?: string | null;
  attachments?: Attachment[] | null;
  priority: Priority;
  status: Status;
};

const statusOptions: Status[] = ["Not Started", "In Progress", "On Hold", "Pending", "Completed"];

const dateLabel = (value?: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const priorityStyles: Record<Priority, string> = {
  High: "bg-[#FCE8E8] text-[#E4484D]",
  Medium: "bg-[#FDF3DC] text-[#9C6F00]",
  Low: "bg-[#E6F5F2] text-[#0E9F8B]",
};

const statusStyles: Record<Status, string> = {
  "Not Started": "bg-[#F4F6F8] text-[#667385]",
  "In Progress": "bg-[#EEEBFA] text-[#6A55D6]",
  "On Hold": "bg-[#FDF3DC] text-[#9C6F00]",
  Pending: "bg-[#FDF3DC] text-[#9C6F00]",
  Completed: "bg-[#E6F5F2] text-[#0E9F8B]",
};

/** Stable per-cell id so the signed URL survives re-renders and filtering. */
const attachmentKey = (task: Task, index: number) => `${task._id}::${index}`;

/** The storage key, whichever shape the backend sent it in. */
const rawKey = (a: Attachment): string => {
  if (typeof a === "string") return a;
  return a.key ?? a.url ?? "";
};

const normalizeAttachment = (a: Attachment) => {
  if (typeof a === "string") {
    const isLink = /^https?:\/\//i.test(a);
    const last = a.split("?")[0].split("/").pop() || a;
    let name = last;
    try {
      name = decodeURIComponent(last);
    } catch (e) {
      /* keep raw name if it is not valid URI encoding */
    }
    return { name, url: isLink ? a : undefined };
  }
  const raw = a.name ?? a.fileName ?? a.originalName ?? a.key?.split("/").pop() ?? "Attachment";
  return { name: raw, url: a.url };
};

// Shared cell classes give every field its own bordered box.
const TH =
  "border-b border-r border-[#DCE2E8] bg-[#F8FAFC] px-2 py-3 text-center text-[13px] font-semibold text-[#667385] last:border-r-0";
const TD = "border-b border-r border-[#DCE2E8] px-2 py-4 text-center align-middle break-words last:border-r-0";

type TaskDetailsProps = {
  // Called after a task status is updated successfully (e.g. to refresh the summary).
  onStatusChanged?: () => void;
};

const TaskDetails: React.FC<TaskDetailsProps> = ({ onStatusChanged }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // Attachment values are storage keys, not URLs, so every key is signed before
  // it is rendered. Keyed by `${taskId}::${index}`.
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;

    const loadTasks = async () => {
      try {
        const res = await employeeApi.get("/tasks");
        if (mounted) setTasks((res?.data?.tasks ?? []) as Task[]);
        if (mounted) {
          // Sign in the background so a slow/expired link cannot hold up the table.
          const rows = (res?.data?.tasks ?? []) as Task[];
          const pairs = rows.flatMap((task) =>
            (task.attachments ?? []).map((file, i) => [attachmentKey(task, i), file] as const),
          );
          const signed = await Promise.all(pairs.map(([, file]) => getSignedFileUrl(rawKey(file))));
          if (mounted) {
            setFileUrls(Object.fromEntries(pairs.map(([id], i) => [id, signed[i] ?? ""])));
          }
        }
      } catch (e) {
        if (mounted) setTasks([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadTasks();

    return () => {
      mounted = false;
    };
  }, []);

  const handleStatusChange = async (taskId: string, nextStatus: Status) => {
    setUpdatingId(taskId);
    setError(null);

    try {
      await employeeApi.patch(`/tasks/${taskId}/status`, { status: nextStatus });
      setTasks((current) => current.map((task) => (task._id === taskId ? { ...task, status: nextStatus } : task)));
      onStatusChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not update task status.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <section aria-label="Task details" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-[#6A55D6]" />
        <h3 className={`${DISPLAY} text-[17px] font-bold`}>Task details</h3>
      </div>

      {error && <p className="mt-3 text-sm text-[#E4484D]">{error}</p>}

      <div className="mt-4 overflow-hidden rounded-xl border border-[#DCE2E8]">
        <table className="w-full table-fixed border-collapse text-left [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <th className={`${TH} w-[8%]`}>Task Id</th>
              <th className={`${TH} w-[17%]`}>Task title</th>
              <th className={`${TH} w-[23%]`}>Task details</th>
              <th className={`${TH} w-[14%]`}>Due date</th>
              <th className={`${TH} w-[11%]`}>Priority</th>
              <th className={`${TH} w-[15%]`}>Employee Status</th>
              <th className={`${TH} w-[12%] whitespace-nowrap`}>Attachments</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-[#667385]">
                  Loading tasks…
                </td>
              </tr>
            ) : tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-[#667385]">
                  No tasks assigned.
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task._id} className="text-sm">
                  <td className={TD}>
                    <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-[#EEEBFA] text-xs font-semibold text-[#6A55D6]">
                      {task.taskId ? task.taskId.split("-").pop() : "#"}
                    </span>
                  </td>

                  <td className={`${TD} font-medium`}>{task.title}</td>

                  <td className={`${TD} text-[#667385]`}>
                    <p className="line-clamp-3 whitespace-pre-wrap text-center leading-snug">
                      {task.description?.trim() ? task.description : "—"}
                    </p>
                  </td>

                  <td className={`${TD} text-[#667385]`}>
                    <span className="flex flex-wrap items-center justify-center gap-x-1.5">
                      <CalendarDays size={14} className="shrink-0 text-[#B6C0CC]" />
                      {dateLabel(task.dueDate)}
                    </span>
                  </td>

                  <td className={TD}>
                    <span
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                        priorityStyles[task.priority] ?? priorityStyles.Medium
                      }`}
                    >
                      {task.priority}
                    </span>
                  </td>

                  <td className={TD}>
                    <select
                      value={task.status}
                      disabled={updatingId === task._id}
                      onChange={(event) => handleStatusChange(task._id, event.target.value as Status)}
                      className={`max-w-full rounded-full px-2.5 py-1.5 text-xs font-semibold outline-none ${statusStyles[task.status]}`}
                    >
{statusOptions.map((option) => (
                          <option key={option} value={option} className="bg-white text-[#121C2B]">
                            {option}
                          </option>
                        ))}
                    </select>
                  </td>

                  <td className={TD}>
                    {task.attachments && task.attachments.length > 0 ? (
                      <div className="flex flex-col items-center gap-1">
                        {task.attachments.map(normalizeAttachment).map((file, i, arr) => {
                          const label = arr.length > 1 ? `View ${i + 1}` : "View";
                          const cls = "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap";
                          // Prefer the signed link; fall back to a key that was
                          // already stored as an absolute URL.
                          const href = fileUrls[attachmentKey(task, i)] || file.url || "";
                          return href ? (
                            <a
                              key={`${file.name}-${i}`}
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={file.name}
                              className={`${cls} text-[#6A55D6] hover:underline`}
                            >
                              <Paperclip size={12} className="shrink-0" />
                              {label}
                            </a>
                          ) : (
                            <span
                              key={`${file.name}-${i}`}
                              title={`${file.name} (no link available)`}
                              className={`${cls} text-[#B6C0CC]`}
                            >
                              <Paperclip size={12} className="shrink-0" />
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-[#B6C0CC]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TaskDetails;