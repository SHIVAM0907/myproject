// import React, { useState } from "react";
// import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// type DayCell = {
//   day: number;
//   dim?: boolean;
//   events?: number;
// };

// const CalendarWidget: React.FC = () => {
//   const [selected, setSelected] = useState(18);
//   const monthLabel = "September 2026";
//   const today = 18;

//   const weeks: DayCell[][] = [
//     [
//       { day: 31, dim: true },
//       { day: 1 },
//       { day: 2 },
//       { day: 3, events: 2 },
//       { day: 4, events: 1 },
//       { day: 5 },
//       { day: 6 },
//     ],
//     [
//       { day: 7 },
//       { day: 8 },
//       { day: 9, events: 1 },
//       { day: 10 },
//       { day: 11 },
//       { day: 12 },
//       { day: 13 },
//     ],
//     [
//       { day: 14, events: 3 },
//       { day: 15 },
//       { day: 16 },
//       { day: 17 },
//       { day: 18, events: 2 },
//       { day: 19 },
//       { day: 20 },
//     ],
//     [
//       { day: 21, events: 1 },
//       { day: 22 },
//       { day: 23 },
//       { day: 24 },
//       { day: 25 },
//       { day: 26 },
//       { day: 27 },
//     ],
//     [
//       { day: 28 },
//       { day: 29 },
//       { day: 30 },
//       { day: 1, dim: true },
//       { day: 2, dim: true },
//       { day: 3, dim: true },
//       { day: 4, dim: true },
//     ],
//   ];

//   const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

//   const agendaByDay: Record<number, string[]> = {
//     18: ["Frontend Bug Fixes — due today", "Team Retrospective — 3:00 PM"],
//     14: ["Marketing Website Update", "Analytics Report", "UAT sign-off"],
//     21: ["Database Optimization review"],
//     9: ["Sprint planning"],
//     3: ["Client demo", "API Integration kickoff"],
//     4: ["Design handoff"],
//   };

//   const agenda = agendaByDay[selected] ?? [];

//   return (
//     <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
//       <div className="flex items-center justify-between">
//         <div className="flex items-center gap-2">
//           <CalendarDays size={20} className="text-[#10284A]" />
//           <h3 className="text-lg font-semibold text-[#10284A]">Calendar</h3>
//         </div>

//         <button
//           onClick={() => setSelected(today)}
//           className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-[#2459A6] transition hover:bg-blue-100"
//         >
//           Today
//         </button>
//       </div>

//       <div className="mt-4 flex items-center justify-between">
//         <button className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
//           <ChevronLeft size={16} />
//         </button>

//         <span className="text-sm font-semibold text-[#10284A]">
//           {monthLabel}
//         </span>

//         <button className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600">
//           <ChevronRight size={16} />
//         </button>
//       </div>

//       <div className="mt-4 grid grid-cols-7 gap-1 text-center">
//         {weekdays.map((wd, i) => (
//           <span
//             key={`${wd}-${i}`}
//             className="pb-1 text-[11px] font-semibold text-gray-400"
//           >
//             {wd}
//           </span>
//         ))}

//         {weeks.map((week, wIndex) =>
//           week.map((cell, cIndex) => {
//             const isSelected = cell.day === selected && !cell.dim;
//             const isToday = cell.day === today && !cell.dim;

//             return (
//               <button
//                 key={`${wIndex}-${cIndex}`}
//                 onClick={() => !cell.dim && setSelected(cell.day)}
//                 disabled={cell.dim}
//                 className={`relative aspect-square rounded-lg text-sm transition ${
//                   cell.dim
//                     ? "cursor-default text-gray-300"
//                     : isSelected
//                     ? "bg-[#2459A6] font-semibold text-white"
//                     : isToday
//                     ? "border border-[#2459A6] font-semibold text-[#2459A6]"
//                     : "text-gray-600 hover:bg-gray-100"
//                 }`}
//               >
//                 {cell.day}
//                 {cell.events && !cell.dim && (
//                   <span
//                     className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
//                       isSelected ? "bg-white" : "bg-[#2459A6]"
//                     }`}
//                   />
//                 )}
//               </button>
//             );
//           })
//         )}
//       </div>

//       <div className="mt-4 border-t border-gray-100 pt-4">
//         <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
//           {selected === today ? "Today" : `Sep ${selected}`}
//         </p>

//         <div className="mt-2 space-y-2">
//           {agenda.length > 0 ? (
//             agenda.map((item, idx) => (
//               <div key={idx} className="flex items-center gap-2 text-sm">
//                 <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2459A6]" />
//                 <span className="text-gray-600">{item}</span>
//               </div>
//             ))
//           ) : (
//             <p className="text-sm text-gray-400">No events scheduled</p>
//           )}
//         </div>
//       </div>
//     </section>
//   );
// };

// export default CalendarWidget;

import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type CalendarEvent = {
  id: string;
  title: string;
  type: "task" | "meeting" | "query";
  date: string;
  status?: string;
};

type DayCell = {
  day: number;
  dim?: boolean;
  count?: number;
};

const CalendarWidget: React.FC<{ events?: CalendarEvent[]; onMonthChange?: (month: string) => void | Promise<void> }> = ({ events = [], onMonthChange }) => {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today.getDate());
  const monthLabel = selectedMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

  const moveMonth = (offset: number) => {
    const nextMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + offset, 1);
    const monthDayLimit = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    setSelectedMonth(nextMonth);
    setSelected((current) => Math.min(current, monthDayLimit));
    if (onMonthChange) {
      onMonthChange(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);
    }
  };

  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];

  const calendarDays = useMemo(() => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const leading = (firstDay.getDay() + 6) % 7;
    const cells: DayCell[] = [];

    for (let i = 0; i < leading; i += 1) {
      cells.push({ day: new Date(year, month, i - leading + 1).getDate(), dim: true });
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, count: events.filter((event) => event.date === dateKey).length });
    }

    while (cells.length % 7 !== 0) {
      const next = cells.length - lastDay.getDate() - leading + 1;
      cells.push({ day: next, dim: true });
    }

    return Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  }, [events, selectedMonth]);

  const agenda = useMemo(() => {
    const selectedDate = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), selected);
    const selectedKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;
    return events
      .filter((event) => event.date === selectedKey)
      .map((event) => `${event.title} (${event.type})`);
  }, [events, selected, selectedMonth]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">Calendar</h3>
        </div>

        <button
          onClick={() => {
            const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            setSelectedMonth(currentMonth);
            setSelected(today.getDate());
            if (onMonthChange) {
              onMonthChange(`${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`);
            }
          }}
          className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-semibold text-[#2459A6] transition hover:bg-blue-100"
        >
          Today
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <ChevronLeft size={16} />
        </button>

        <span className="text-sm font-semibold text-[#10284A]">
          {monthLabel}
        </span>

        <button
          type="button"
          onClick={() => moveMonth(1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((wd, i) => (
          <span key={`${wd}-${i}`} className="pb-1 text-[11px] font-semibold text-gray-400">
            {wd}
          </span>
        ))}

        {calendarDays.map((week, wIndex) =>
          week.map((cell, cIndex) => {
            const isSelected = cell.day === selected && !cell.dim;
            const isToday = cell.day === today.getDate() && !cell.dim;

            return (
              <button
                key={`${wIndex}-${cIndex}`}
                onClick={() => !cell.dim && setSelected(cell.day)}
                disabled={cell.dim}
                className={`relative aspect-square rounded-lg text-sm transition ${
                  cell.dim ? "cursor-default text-gray-300" : isSelected ? "bg-[#2459A6] font-semibold text-white" : isToday ? "border border-[#2459A6] font-semibold text-[#2459A6]" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {cell.day}
                {!cell.dim && (cell.count ?? 0) > 0 && (
                  <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? "bg-white" : "bg-[#2459A6]"}`} />
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {selected === today.getDate() ? "Today" : `${today.toLocaleString("en-US", { month: "short" })} ${selected}`}
        </p>

        <div className="mt-2 space-y-2">
          {agenda.length > 0 ? (
            agenda.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2459A6]" />
                <span className="text-gray-600">{item}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400">No events scheduled</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default CalendarWidget;