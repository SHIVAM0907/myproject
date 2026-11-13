import React, { useState } from "react";
import { CalendarDays, ChevronRight, Users2, ChevronDown } from "lucide-react";

type DayCell = { day: number; dim?: boolean };
type Priority = "High" | "Medium" | "Low";

type AssignedTask = {
  title: string;
  priority: Priority;
  status: string;
};

const DateAndAssignedTasks: React.FC = () => {
  const [selected, setSelected] = useState(17);

  const weeks: DayCell[][] = [
    [{ day: 31, dim: true }, { day: 1 }, { day: 2 }, { day: 3 }, { day: 4 }, { day: 5 }, { day: 6 }],
    [{ day: 7 }, { day: 8 }, { day: 9 }, { day: 10 }, { day: 11 }, { day: 12 }, { day: 13 }],
    [{ day: 14 }, { day: 15 }, { day: 16 }, { day: 17 }, { day: 18 }, { day: 19 }, { day: 20 }],
    [{ day: 21 }, { day: 22 }, { day: 23 }, { day: 24 }, { day: 25 }, { day: 26 }, { day: 27 }],
    [
      { day: 28 },
      { day: 29 },
      { day: 30 },
      { day: 1, dim: true },
      { day: 2, dim: true },
      { day: 3, dim: true },
      { day: 4, dim: true },
    ],
  ];
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const tasks: AssignedTask[] = [
    { title: "UI design update", priority: "High", status: "Book a trial" },
    { title: "API integration", priority: "Medium", status: "In progress" },
    { title: "Fronted bug fixes", priority: "High", status: "On hold" },
  ];

  const priorityStyles: Record<Priority, string> = {
    High: "bg-rose-50 text-rose-500",
    Medium: "bg-amber-50 text-amber-600",
    Low: "bg-green-50 text-green-600",
  };

  const statusStyles: Record<string, string> = {
    "Book a trial": "bg-green-50 text-green-600",
    "In progress": "bg-blue-50 text-blue-600",
    "On hold": "bg-violet-50 text-violet-600",
  };

  const statusDot: Record<string, string> = {
    "Book a trial": "bg-green-500",
    "In progress": "bg-blue-500",
    "On hold": "bg-violet-500",
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      {/* Date */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">Date</h3>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50">
            September 2026
            <ChevronRight size={16} className="text-gray-400" />
          </button>

          <button
            onClick={() => setSelected(17)}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <CalendarDays size={15} className="text-[#2459A6]" />
            Today
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-y-2 text-center">
          {weekdays.map((wd) => (
            <span key={wd} className="text-xs font-medium text-gray-400">
              {wd}
            </span>
          ))}

          {weeks.map((week, wIndex) =>
            week.map((cell, cIndex) => {
              const isSelected = cell.day === selected && !cell.dim;
              return (
                <button
                  key={`${wIndex}-${cIndex}`}
                  onClick={() => !cell.dim && setSelected(cell.day)}
                  disabled={cell.dim}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
                    cell.dim
                      ? "cursor-default text-gray-300"
                      : isSelected
                      ? "bg-[#2459A6] font-semibold text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {cell.day}
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Manager assigned tasks */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Users2 size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">
            Manager assigned tasks
          </h3>
        </div>

        <div className="mt-4 divide-y divide-gray-100">
          {tasks.map((task, idx) => (
            <div
              key={task.title}
              className="flex items-center justify-between gap-3 py-3.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-[#2459A6]">
                  {idx + 1}
                </span>

                <div>
                  <p className="text-sm font-medium text-[#10284A]">
                    {task.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Priority:{" "}
                    <span
                      className={`ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        priorityStyles[task.priority]
                      }`}
                    >
                      {task.priority}
                    </span>
                  </p>
                </div>
              </div>

              <button
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${statusStyles[task.status]}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot[task.status]}`} />
                {task.status}
                <ChevronDown size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DateAndAssignedTasks;