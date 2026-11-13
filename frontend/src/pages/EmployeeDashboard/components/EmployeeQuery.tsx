import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, ListChecks, MessageCircle, ChevronDown } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

const MAX_CHARS = 500;

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const FIELD = "w-full rounded-xl border border-[#DCE2E8] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#6A55D6]";

type Task = {
  _id: string;
  taskId?: string;
  title: string;
  status?: string;
};

const statusStyles: Record<string, string> = {
  "Not Started": "bg-[#F4F6F8] text-[#667385]",
  "In Progress": "bg-[#EEEBFA] text-[#6A55D6]",
  "On Hold": "bg-[#FDF3DC] text-[#9C6F00]",
  Pending: "bg-[#FDF3DC] text-[#9C6F00]",
  Completed: "bg-[#E6F5F2] text-[#0E9F8B]",
};

const EmployeeQuery: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Only the tasks the manager assigned to this employee are queryable.
  const loadTasks = useCallback(async () => {
    try {
      setTasksError(null);
      const res = await employeeApi.get<{ tasks: Task[] }>("/tasks");
      setTasks(res.data?.tasks ?? []);
    } catch (err: any) {
      setTasks([]);
      setTasksError(err.response?.data?.message || "Could not load your tasks.");
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const selected = useMemo(
    () => tasks.find((task) => task._id === selectedTask) ?? null,
    [tasks, selectedTask],
  );

  const handleRaiseQuery = async () => {
    setError(null);
    setSuccess(null);

    if (!selectedTask) {
      setError("Select the task your query is about.");
      return;
    }
    if (!message.trim()) {
      setError("Describe your query, problem or remarks.");
      return;
    }

    setSubmitting(true);

    try {
      await employeeApi.post("/queries", { task: selectedTask, message: message.trim() });
      setMessage("");
      setSelectedTask("");
      setSuccess("Query raised successfully. Your manager has been notified.");
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not raise query.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section aria-label="Raise a query" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
        <div className="flex items-center gap-2">
          <ClipboardList size={20} className="text-[#6A55D6]" />
          <h3 className={`${DISPLAY} text-[17px] font-bold`}>Raise a query</h3>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-[#DCE2E8] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#667385]">
              <ListChecks size={16} />
              Task
            </div>

            <div className="relative mt-3">
              <select
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                disabled={tasksLoading || tasks.length === 0}
                className={`${FIELD} appearance-none disabled:cursor-not-allowed disabled:bg-[#F8FAFC] disabled:text-[#667385]`}
              >
                <option value="" disabled>
                  {tasksLoading ? "Loading tasks…" : "Select Task:"}
                </option>
                {tasks.map((task) => (
                  <option key={task._id} value={task._id}>
                    {task.taskId ? `${task.taskId} - ` : ""}
                    {task.title}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#B6C0CC]"
              />
            </div>

            {tasksError && <p className="mt-2 text-xs text-[#E4484D]">{tasksError}</p>}

            {!tasksLoading && !tasksError && tasks.length === 0 && (
              <p className="mt-2 text-xs text-[#667385]">
                No tasks assigned to you yet. A query can be raised once your manager assigns one.
              </p>
            )}

            {selected && (
              <p className="mt-2 text-xs text-[#667385]">
                Status:{" "}
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    statusStyles[selected.status ?? ""] ?? statusStyles.Pending
                  }`}
                >
                  {selected.status ?? "Pending"}
                </span>
              </p>
            )}
          </div>

          <div className="rounded-xl border border-[#DCE2E8] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[#667385]">
              <MessageCircle size={16} />
              Employee query / problem / remarks
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Write your query, problem or remarks here..."
              rows={4}
              className={`${FIELD} mt-3 resize-none placeholder:text-[#B6C0CC]`}
            />

            <p className="mt-1 text-right text-xs text-[#667385]">
              {message.length}/{MAX_CHARS}
            </p>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-[#E4484D]">{error}</p>}
        {success && <p className="mt-3 text-sm text-[#0E9F8B]">{success}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleRaiseQuery}
            disabled={submitting}
            className="rounded-full bg-[#6A55D6] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5a47bd] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Raising…" : "Raise query"}
          </button>
        </div>
      </section>
  );
};

export default EmployeeQuery;
