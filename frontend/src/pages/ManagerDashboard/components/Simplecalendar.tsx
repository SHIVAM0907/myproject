import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type CalendarEvent = {
  id: string;
  title: string;
  type: "task" | "meeting" | "query";
  date: string;
  status?: string;
};

type DayCell = { day: number; dim?: boolean; count?: number };

const SimpleCalendar: React.FC<{ events?: CalendarEvent[]; onMonthChange?: (month: string) => void | Promise<void> }> = ({ events = [], onMonthChange }) => {
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

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const weeks = useMemo(() => {
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

  const selectedEvents = useMemo(() => {
    const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), selected);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return events.filter((event) => event.date === dateKey);
  }, [events, selected, selectedMonth]);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarDays size={20} className="text-[#10284A]" />
        <h3 className="text-lg font-semibold text-[#10284A]">Calendar</h3>
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
                className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition ${
                  cell.dim ? "cursor-default text-gray-300" : isSelected ? "bg-[#2459A6] font-semibold text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {cell.day}
                {!cell.dim && (cell.count ?? 0) > 0 && <span className="absolute -bottom-1 h-1.5 w-1.5 rounded-full bg-[#2459A6]" />}
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
          {selectedEvents.length > 0 ? (
            selectedEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2459A6]" />
                <span className="text-gray-600">{event.title}</span>
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

export default SimpleCalendar;