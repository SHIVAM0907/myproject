import React from "react";
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Check,
} from "lucide-react";

type Summary = {
  startDate?: string;
  endDate?: string;
  totalWorkingMinutes?: number;
  totalOvertimeMinutes?: number;
  presentDays?: number;
  tasksCompleted?: number;
};

type TaskSummary = {
  total?: number;
  completed?: number;
};

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

function formatDate(value?: string) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDuration(minutes?: number) {
  const total = minutes ?? 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

// Every card shares this layout, so icon + label always sit side by side on one
// line and the value goes underneath. Previously one card had a different
// structure, which is why its label overlapped the card edge.
const SummaryCard: React.FC<{
  icon: React.ReactNode;
  tone: string;
  iconBg: string;
  label: string;
  value: React.ReactNode;
}> = ({ icon, tone, iconBg, label, value }) => (
  // The card is a CSS size container, so the label font scales with the card's
  // own width (cqw units) and always fits on one line, whatever the screen.
  <div
    className={`min-w-0 rounded-xl border p-3 ${tone}`}
    style={{ containerType: "inline-size" }}
  >
    <div className="flex min-w-0 items-center gap-1.5">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconBg}`}
      >
        {icon}
      </div>

      <p
        className="whitespace-nowrap font-medium text-[#667385]"
        style={{ fontSize: "clamp(10px, 6.2cqw, 13px)" }}
      >
        {label}
      </p>
    </div>

    <p
      className={`${DISPLAY} mt-4 whitespace-nowrap text-center font-bold`}
      style={{ fontSize: "clamp(15px, 9cqw, 21px)" }}
    >
      {value}
    </p>
  </div>
);

const WorkSummary: React.FC<{ summary?: Summary; taskSummary?: TaskSummary; loading?: boolean }> = ({
  summary,
  taskSummary,
}) => {
  return (
    <section aria-label="Work summary" className="mt-4 rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E9EEF3] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EEEBFA]">
            <BarChart3 size={19} className="text-[#6A55D6]" />
          </div>

          <h3 className={`${DISPLAY} text-[17px] font-bold`}>Work summary</h3>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-3 whitespace-nowrap rounded-full border border-[#DCE2E8] bg-white px-4 py-2 text-sm text-[#667385]">
          <CalendarDays size={16} className="shrink-0 text-[#6A55D6]" />

          <span>{formatDate(summary?.startDate)}</span>

          <span className="text-[#B6C0CC]">−</span>

          <span>{formatDate(summary?.endDate)}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        <SummaryCard
          tone="border-[#6A55D6]/20 bg-[#EEEBFA]"
          iconBg="bg-white"
          icon={<CalendarDays size={18} className="text-[#6A55D6]" />}
          label="Start Date"
          value={formatDate(summary?.startDate)}
        />

        <SummaryCard
          tone="border-[#6A55D6]/20 bg-[#EEEBFA]"
          iconBg="bg-white"
          icon={<CalendarDays size={18} className="text-[#6A55D6]" />}
          label="End Date"
          value={formatDate(summary?.endDate)}
        />

        <SummaryCard
          tone="border-[#0E9F8B]/20 bg-[#E6F5F2]"
          iconBg="bg-white"
          icon={<Clock3 size={18} className="text-[#0E9F8B]" />}
          label="Total Working Hours"
          value={formatDuration(summary?.totalWorkingMinutes)}
        />

        <SummaryCard
          tone="border-[#E2A100]/25 bg-[#FDF3DC]"
          iconBg="bg-white"
          icon={<Clock3 size={18} className="text-[#9C6F00]" />}
          label="Total Overtime"
          value={formatDuration(summary?.totalOvertimeMinutes)}
        />

        <SummaryCard
          tone="border-[#0E9F8B]/20 bg-[#E6F5F2]"
          iconBg="bg-white"
          icon={<Check size={18} className="text-[#0E9F8B]" />}
          label="Tasks Completed"
          value={taskSummary?.completed ?? summary?.tasksCompleted ?? 0}
        />
      </div>
    </section>
  );
};

export default WorkSummary;