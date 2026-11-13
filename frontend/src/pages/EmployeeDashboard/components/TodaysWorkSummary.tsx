import React from "react";
import {
  BarChart3,
  ClipboardList,
  CheckCircle2,
  PlayCircle,
  PauseCircle,
  Clock3,
  CheckCheck,
  CircleDashed,
  Hourglass,
  Users2,
  Timer,
} from "lucide-react";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

type TodayWorkSummaryData = {
  totalTasks?: number;
  notStarted?: number;
  completed?: number;
  inProgress?: number;
  onHold?: number;
  pending?: number;
  workingMinutes?: number;
  breakMinutes?: number;
  overtimeMinutes?: number;
  meetingsCount?: number;
};

const formatMinutes = (minutes = 0) => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.max(0, minutes % 60);
  return `${hours}h ${mins}m`;
};

const TodaysWorkSummary: React.FC<{ summary?: TodayWorkSummaryData }> = ({ summary }) => {
  const stats = [
    {
      label: "Total task",
      value: summary?.totalTasks ?? 0,
      icon: ClipboardList,
      bg: "bg-[#EEEBFA]",
      iconBg: "bg-white",
      iconColor: "text-[#6A55D6]",
    },
    {
      label: "Not started",
      value: summary?.notStarted ?? 0,
      icon: CircleDashed,
      bg: "bg-[#F4F6F8]",
      iconBg: "bg-white",
      iconColor: "text-[#667385]",
    },
    {
      label: "Pending",
      value: summary?.pending ?? 0,
      icon: Hourglass,
      bg: "bg-[#FDF3DC]",
      iconBg: "bg-white",
      iconColor: "text-[#9C6F00]",
    },
    {
      label: "In progress",
      value: summary?.inProgress ?? 0,
      icon: PlayCircle,
      bg: "bg-[#EEEBFA]",
      iconBg: "bg-white",
      iconColor: "text-[#6A55D6]",
    },
    {
      label: "On hold",
      value: summary?.onHold ?? 0,
      icon: PauseCircle,
      bg: "bg-[#FDF3DC]",
      iconBg: "bg-white",
      iconColor: "text-[#9C6F00]",
    },
    {
      label: "Completed",
      value: summary?.completed ?? 0,
      icon: CheckCircle2,
      bg: "bg-[#E6F5F2]",
      iconBg: "bg-white",
      iconColor: "text-[#0E9F8B]",
    },
    {
      label: "Working hours",
      value: formatMinutes(summary?.workingMinutes ?? 0),
      icon: Clock3,
      bg: "bg-[#E6F5F2]",
      iconBg: "bg-white",
      iconColor: "text-[#0E9F8B]",
    },
    {
      label: "Break time",
      value: formatMinutes(summary?.breakMinutes ?? 0),
      icon: CheckCheck,
      bg: "bg-[#FDF3DC]",
      iconBg: "bg-white",
      iconColor: "text-[#9C6F00]",
    },
    {
      label: "Meetings",
      value: summary?.meetingsCount ?? 0,
      icon: Users2,
      bg: "bg-[#EEEBFA]",
      iconBg: "bg-white",
      iconColor: "text-[#6A55D6]",
    },
    {
      label: "Overtime",
      value: formatMinutes(summary?.overtimeMinutes ?? 0),
      icon: Timer,
      bg: "bg-[#FCE8E8]",
      iconBg: "bg-white",
      iconColor: "text-[#E4484D]",
    },
  ];

  return (
    <section aria-label="Today's work summary" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <div className="flex items-center gap-2 border-b border-[#E9EEF3] pb-4">
        <BarChart3 size={20} className="text-[#6A55D6]" />
        <h3 className={`${DISPLAY} text-[17px] font-bold`}>Today's work summary</h3>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className={`flex items-center gap-3 rounded-xl px-3.5 py-3 ${stat.bg}`}>
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${stat.iconBg}`}>
              <stat.icon size={18} className={stat.iconColor} />
            </div>

            <div className="min-w-0">
              <p className="whitespace-nowrap text-[13px] font-medium leading-tight text-[#667385]">
                {stat.label}
              </p>

              <p className={`${DISPLAY} mt-0.5 whitespace-nowrap text-lg font-bold leading-tight`}>
                {stat.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TodaysWorkSummary;