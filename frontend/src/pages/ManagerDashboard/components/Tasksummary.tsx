import React from "react";
import {
  ClipboardList,
  CheckCircle2,
  Clock3,
  AlertTriangle,
} from "lucide-react";
import type { TaskSummary as TaskSummaryType } from "../../../types/Employee";

const TaskSummary: React.FC<{ summary?: TaskSummaryType | null; loading?: boolean }> = ({ summary, loading }) => {
  const stats = [
    {
      label: "Total Tasks",
      value: summary?.total ?? 0,
      icon: ClipboardList,
      bg: "bg-blue-50",
      iconColor: "text-[#2459A6]",
      labelColor: "text-[#2459A6]",
    },
    {
      label: "Completed",
      value: summary?.completed ?? 0,
      icon: CheckCircle2,
      bg: "bg-green-50",
      iconColor: "text-green-600",
      labelColor: "text-green-600",
    },
    {
      label: "In Progress",
      value: summary?.inProgress ?? 0,
      icon: Clock3,
      bg: "bg-amber-50",
      iconColor: "text-amber-500",
      labelColor: "text-amber-600",
    },
    {
      label: "Overdue",
      value: summary?.overdue ?? 0,
      icon: AlertTriangle,
      bg: "bg-rose-50",
      iconColor: "text-rose-500",
      labelColor: "text-rose-600",
    },
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-[#10284A]" />
        <h3 className="text-lg font-semibold text-[#10284A]">
          Task Summary
        </h3>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-xl p-4 ${stat.bg}`}>
            <div className="flex items-center gap-2">
              <stat.icon size={16} className={stat.iconColor} />
              <span className={`text-sm font-semibold ${stat.labelColor}`}>
                {stat.label}
              </span>
            </div>

            <p className="mt-2 text-2xl font-bold text-[#10284A]">
              {loading ? "—" : stat.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default TaskSummary;
