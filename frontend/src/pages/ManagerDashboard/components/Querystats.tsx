import React from "react";
import { MessageSquare, Clock3, CheckCircle2, Repeat2 } from "lucide-react";

const QueryStats: React.FC = () => {
  const stats = [
    {
      label: "Total queries",
      value: "24",
      icon: MessageSquare,
      iconBg: "bg-blue-50",
      iconColor: "text-[#2459A6]",
    },
    {
      label: "Queries left for review",
      value: "8",
      icon: Clock3,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
    },
    {
      label: "Queries resolved",
      value: "14",
      icon: CheckCircle2,
      iconBg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      label: "Queries raised again",
      value: "2",
      icon: Repeat2,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${stat.iconBg}`}
          >
            <stat.icon size={18} className={stat.iconColor} />
          </div>

          <div>
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-0.5 text-xl font-bold text-[#10284A]">
              {stat.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default QueryStats;