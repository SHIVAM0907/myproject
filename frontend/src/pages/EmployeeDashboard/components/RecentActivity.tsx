import React from "react";
import { Clock } from "lucide-react";

type ActivityEntry = { type: string; at: string; meta?: any };

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

const ACTIVITY_LABELS: Record<string, { text: string; color: string; status?: string }> = {
  checkin: { text: "Checked in", color: "bg-[#0E9F8B]", status: "Online" },
  checkout: { text: "Checked out", color: "bg-[#B6C0CC]" },
  break_start: { text: "Break started", color: "bg-[#E2A100]" },
  break_end: { text: "Break ended", color: "bg-[#6A55D6]" },
  meeting_start: { text: "Meeting started", color: "bg-[#6A55D6]" },
  meeting_end: { text: "Meeting ended", color: "bg-[#6A55D6]", status: "Back online" },
  task_assigned: { text: "New task assigned", color: "bg-[#6A55D6]" },
  task_completed: { text: "Task completed", color: "bg-[#0E9F8B]" },
  profile_updated: { text: "Profile updated", color: "bg-[#B6C0CC]" },
  leave_submitted: { text: "Leave requested", color: "bg-[#E2A100]" },
  leave_approved: { text: "Leave approved", color: "bg-[#0E9F8B]" },
  leave_rejected: { text: "Leave rejected", color: "bg-[#E4484D]" },
  query_raised: { text: "Query raised", color: "bg-[#E2A100]" },
  query_reviewed: { text: "Query reviewed", color: "bg-[#6A55D6]" },
};

// Extra text shown after the label, e.g. "New task assigned · by Surjya Paul".
// Reads meta.title (or taskTitle) and meta.assignedBy (a name string or a
// {firstName, lastName} object), so it works for task_assigned / task_completed
// and any other event that carries a title.
function detailFor(type: string, meta: any): string {
  if (!meta) return "";
  const title = meta.title ?? meta.taskTitle ?? meta.detail ?? "";
  const by = meta.assignedBy;
  const byName =
    typeof by === "string"
      ? by
      : by && (by.firstName || by.lastName)
        ? `${by.firstName ?? ""} ${by.lastName ?? ""}`.trim()
        : "";
  // New task assigned: show only who assigned it, not the task title.
  if (type === "task_assigned") return byName ? `by ${byName}` : "";
  if (title && byName) return `${title} — by ${byName}`;
  return title || (byName ? `by ${byName}` : "");
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Convert snake_case event types like "employee_created" to readable labels.
function readableLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Local-calendar key (YYYY-MM-DD), so grouping follows the employee's own day
// rather than UTC.
function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Computed from the current date on every render, so "Today" / "Yesterday"
// roll over by themselves each day; older days show the actual date.
function dayLabel(d: Date) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const key = dayKey(d);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";

  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type Group = { key: string; label: string; entries: ActivityEntry[] };

// Newest first, then split into one group per calendar day.
function groupByDay(items: ActivityEntry[]): Group[] {
  const sorted = [...items]
    .filter((a) => !Number.isNaN(new Date(a.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const groups: Group[] = [];
  for (const entry of sorted) {
    const d = new Date(entry.at);
    const key = dayKey(d);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, label: dayLabel(d), entries: [entry] });
    }
  }
  return groups;
}

const RecentActivity: React.FC<{ activities?: ActivityEntry[]; loading?: boolean }> = ({
  activities,
  loading,
}) => {
  const groups = groupByDay(activities ?? []);

  return (
    <section aria-label="Recent activity" className="flex h-[520px] flex-col rounded-[18px] border border-[#DCE2E8] bg-white px-5 pb-6 pt-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-[#6A55D6]" />

          <h3 className={`${DISPLAY} text-[17px] font-bold`}>Recent activity</h3>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-4 [scrollbar-gutter:stable]">
        {loading ? (
          <p className="text-sm text-[#667385]">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-[#667385]">No recent activity.</p>
        ) : (
          <div className="relative">
            {/* Timeline line runs the full height of the content */}
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[#E9EEF3]" />

            <div className="flex flex-col gap-5">
              {groups.map((group) => (
                <div key={group.key} className="relative">
                  {/* Date label */}
                  <div className="relative mb-3 flex items-center gap-3">
                    <span className="relative z-10 h-4 w-4 shrink-0 rounded-full border-2 border-white bg-[#121C2B]" />
                    <span className="rounded-full bg-[#EEEBFA] px-3 py-1 text-xs font-semibold text-[#6A55D6]">
                      {group.label}
                    </span>
                    <span className="h-px flex-1 bg-[#E9EEF3]" />
                  </div>

                  <div className="flex flex-col gap-4">
                    {group.entries.map((activity, index) => {
                      const meta =
                        ACTIVITY_LABELS[activity.type] || { text: readableLabel(activity.type), color: "bg-[#B6C0CC]" };
                      return (
                        <div key={`${group.key}-${index}`} className="relative flex items-center gap-4">
                          {/* Timeline Dot */}
                          <div
                            className={`relative z-10 h-4 w-4 shrink-0 rounded-full border-2 border-white ${meta.color}`}
                          />

                          {/* Time */}
                          <span className="w-20 shrink-0 whitespace-nowrap text-xs text-[#667385]">
                            {formatTime(activity.at)}
                          </span>

                          {/* Activity */}
                          <span className="min-w-0 flex-1 text-sm font-medium">
                            {meta.text}
                            {detailFor(activity.type, activity.meta) && (
                              <span className="ml-1.5 font-normal text-[#667385]">
                                · {detailFor(activity.type, activity.meta)}
                              </span>
                            )}
                          </span>

                          {/* Status */}
                          {meta.status && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E6F5F2] px-2 py-0.5 text-[11px] font-semibold leading-none text-[#0E9F8B]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#0E9F8B]" />
                              {meta.status}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default RecentActivity;