

import React, { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

type UiStatus = "Present" | "Half Day" | "Leave" | "Absent" | "Unknown";

type DayEntry = {
  status: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingHours?: string;
  breakTime?: string;
  overtime?: string | null;
  tasksCompleted?: number;
  leaveType?: string;
};

const STATUS_MAP: Record<string, UiStatus> = {
  present: "Present",
  late: "Present",
  on_call: "Present",
  half_day: "Half Day",
  on_break: "Present",
  leave: "Leave",
  Leave: "Leave",
  absent: "Absent",
};

function toUiStatus(raw?: string): UiStatus {
  if (!raw) return "Absent";
  return STATUS_MAP[raw] ?? "Unknown";
}

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

function getStatusColor(status: UiStatus) {
  switch (status) {
    case "Present":
      return { dot: "bg-[#0E9F8B]", ring: "border-[#0E9F8B]/40 bg-white", text: "text-[#0E9F8B]", badge: "bg-[#E6F5F2] text-[#0E9F8B]" };
    case "Half Day":
      return { dot: "bg-[#E2A100]", ring: "border-[#E2A100]/50 bg-white", text: "text-[#9C6F00]", badge: "bg-[#FDF3DC] text-[#9C6F00]" };
    case "Leave":
      return { dot: "bg-[#6A55D6]", ring: "border-[#6A55D6]/40 bg-white", text: "text-[#6A55D6]", badge: "bg-[#EEEBFA] text-[#6A55D6]" };
    default:
      return { dot: "bg-[#E4484D]", ring: "border-[#E4484D]/40 bg-white", text: "text-[#E4484D]", badge: "bg-[#FCE8E8] text-[#E4484D]" };
  }
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STANDARD_DAY_MINUTES = 540; // 9 hours — mirrors backend default
const HALF_DAY_MINUTES = STANDARD_DAY_MINUTES / 2;

// Parse "3h 46m" → 226 minutes
function parseWorkingHours(value?: string): number {
  if (!value) return 0;
  const match = value.match(/(\d+)h\s*(\d+)m/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

// For open sessions (checked in, not out), compute live working hours
// mirroring the backend's monthlyAttendance logic.
function liveWorkingMinutes(entry: DayEntry): number {
  if (entry.checkIn && !entry.checkOut) {
    const checkInMs = new Date(entry.checkIn).getTime();
    const breakMs = parseWorkingHours(entry.breakTime) * 60000;
    return Math.max(0, Math.floor((Date.now() - checkInMs - breakMs) / 60000));
  }
  return parseWorkingHours(entry.workingHours);
}

// Half Day rule: worked more than 0 but less than half the standard day.
function uiStatusFor(entry: DayEntry | undefined): UiStatus {
  if (!entry) return "Absent";
  const minutes = liveWorkingMinutes(entry);
  if (minutes > 0 && minutes < HALF_DAY_MINUTES) return "Half Day";
  return toUiStatus(entry.status);
}

const AttendanceDetails: React.FC = () => {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [dayMap, setDayMap] = useState<Record<string, DayEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<number | null>(null);

  const load = useCallback(async (date: Date) => {
    setLoading(true);
    setError(null);
    try {
      const res = await employeeApi.get("/attendance/month", { params: { date: date.toISOString() } });
      setDayMap(res.data?.dayMap ?? {});
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(viewDate);
    setSelectedDate(null);
  }, [viewDate, load]);

  // Refetch after check-in / check-out / break start / break end.
  useEffect(() => {
    const handleRefresh = () => load(viewDate);
    window.addEventListener("employee-attendance-status-change", handleRefresh);
    return () => window.removeEventListener("employee-attendance-status-change", handleRefresh);
  }, [viewDate, load]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-start

  const entryFor = (day: number): DayEntry | undefined => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return dayMap[key];
  };

  const today = selectedDate ? entryFor(selectedDate) : undefined;
  const todayUiStatus = uiStatusFor(today);
  const todayColors = getStatusColor(todayUiStatus);

  return (
    <section aria-label="Attendance details" className="mt-4 rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-[#E9EEF3] pb-4">
        <CalendarDays size={22} className="text-[#6A55D6]" />

        <h3 className={`${DISPLAY} text-[17px] font-bold`}>Attendance details</h3>
      </div>

      {error && <p className="mt-3 text-sm text-[#E4484D]">{error}</p>}

      {/* Main Content */}
      <div className="mt-4 grid grid-cols-[1.55fr_0.9fr_1fr] gap-4">
        {/* CALENDAR */}
        <div className="rounded-xl border border-[#DCE2E8] bg-white p-4">
          {/* Month Header */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#667385] transition hover:bg-[#F4F6F8] hover:text-[#6A55D6]"
            >
              <ChevronLeft size={18} />
            </button>

            <h4 className={`${DISPLAY} text-[17px] font-bold`}>
              {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h4>

            <button
              type="button"
              aria-label="Next month"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#667385] transition hover:bg-[#F4F6F8] hover:text-[#6A55D6]"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Week Days */}
          <div className="mt-5 grid grid-cols-7 text-center">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className="text-xs font-medium text-[#667385]"
              >
                {day}
              </span>
            ))}
          </div>

          {/* Calendar */}
          <div className="mt-3 grid grid-cols-7 gap-y-2 text-center">
            {Array.from({ length: firstWeekday }, (_, i) => (
              <div key={`blank-${i}`} className="h-12" />
            ))}

            {loading
              ? Array.from({ length: daysInMonth }, (_, i) => (
                  <div key={i} className="flex h-12 flex-col items-center justify-center">
                    <span className="text-sm text-[#B6C0CC]">{i + 1}</span>
                  </div>
                ))
              : Array.from({ length: daysInMonth }, (_, index) => {
                  const date = index + 1;
                  const entry = entryFor(date);
                  const uiStatus = uiStatusFor(entry);
                  const colors = getStatusColor(uiStatus);
                  const hasOvertime = Boolean(entry?.overtime);

                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className="flex h-12 flex-col items-center justify-center"
                    >
                      {/* Date */}
                      <span
                        className={`flex h-8 w-8 items-center justify-center text-sm font-medium ${
                          selectedDate === date
                            ? "rounded-full bg-[#6A55D6] text-white"
                            : "text-[#121C2B]"
                        }`}
                      >
                        {date}
                      </span>

                      {/* Status */}
                      {entry ? (
                        <span
                          className={`mt-1 flex h-3 w-3 items-center justify-center rounded-full ${
                            hasOvertime ? `border-2 ${colors.ring}` : colors.dot
                          }`}
                        >
                          {hasOvertime && <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />}
                        </span>
                      ) : (
                        <span className="mt-1 h-2 w-2 rounded-full bg-[#E9EEF3]" />
                      )}
                    </button>
                  );
                })}
          </div>
        </div>

        {/* LEGEND */}
        <div className="rounded-xl border border-[#DCE2E8] bg-white p-4">
          <h4 className={`${DISPLAY} text-[17px] font-bold`}>Legend</h4>

          <div className="mt-4 space-y-4">
            {[
              { label: "Present", chip: "bg-[#E6F5F2]", dot: "bg-[#0E9F8B]" },
              { label: "Half Day", chip: "bg-[#FDF3DC]", dot: "bg-[#E2A100]" },
              { label: "Leave", chip: "bg-[#EEEBFA]", dot: "bg-[#6A55D6]" },
              { label: "Absent", chip: "bg-[#FCE8E8]", dot: "bg-[#E4484D]" },
            ].map(({ label, chip, dot }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${chip}`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                </span>
                <span className="text-sm text-[#667385]">{label}</span>
              </div>
            ))}

            {[
              { label: "Present + Overtime", border: "border-[#0E9F8B]/40", dot: "bg-[#0E9F8B]" },
              { label: "Half Day + Overtime", border: "border-[#E2A100]/50", dot: "bg-[#E2A100]" },
              { label: "Leave + Overtime", border: "border-[#6A55D6]/40", dot: "bg-[#6A55D6]" },
              { label: "Absent + Overtime", border: "border-[#E4484D]/40", dot: "bg-[#E4484D]" },
            ].map(({ label, border, dot }) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white ${border}`}>
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                </span>
                <span className="text-sm text-[#667385]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-4">
          {/* Select Date */}
          <div className="rounded-xl border border-[#DCE2E8] bg-white p-4">
            <h4 className={`${DISPLAY} text-[17px] font-bold`}>Select date</h4>

            <div className="mt-3 flex h-11 w-full items-center gap-2 rounded-xl bg-[#F4F6F8] px-3 text-sm text-[#667385]">
              <CalendarDays size={17} className="text-[#6A55D6]" />

              <span>
                {selectedDate
                  ? `${selectedDate} ${viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
                  : "No date selected"}
              </span>
            </div>
          </div>

          {/* Selected Date Details */}
          <div className="rounded-xl border border-[#DCE2E8] bg-white p-4">
            <h4 className={`${DISPLAY} text-[17px] font-bold`}>Selected date details</h4>

            {!selectedDate ? (
              <p className="mt-4 text-sm text-[#667385]">Pick a date on the calendar.</p>
            ) : (
              <div className="mt-2 divide-y divide-[#E9EEF3]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-[#667385]">Status</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${todayColors.badge}`}>
                    {todayUiStatus}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-[#667385]">Working hours</span>
                  <span className="text-sm font-semibold">
                    {today?.workingHours ?? "0h 00m"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-[#667385]">Break time</span>
                  <span className="text-sm font-semibold">
                    {today?.breakTime ?? "0m"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-[#667385]">Overtime</span>
                  <span className="text-sm font-semibold">
                    {today?.overtime ?? "00h 00m"}
                  </span>
                </div>

                <div className="flex items-center justify-between py-3">
                  <span className="text-sm text-[#667385]">Tasks completed</span>
                  <span className="text-sm font-semibold">
                    {today?.tasksCompleted ?? 0}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AttendanceDetails;
