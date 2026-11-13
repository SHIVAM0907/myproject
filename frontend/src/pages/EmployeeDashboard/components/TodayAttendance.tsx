import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  Clock3,
  Coffee,
  LogIn,
  LogOut,
  UsersRound,
} from "lucide-react";
import employeeApi from "../../../lib/employeeApi";
import type { AttendanceToday } from "../../../types/Employee";
import MeetingDialog from "../../../components/MeetingDialog";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

const EMPLOYEE_ATTENDANCE_KEY = "employee_attendance_status";
const EMPLOYEE_ATTENDANCE_EVENT = "employee-attendance-status-change";

const updateStoredAttendanceStatus = (status: string) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(EMPLOYEE_ATTENDANCE_KEY, status);
  window.dispatchEvent(new Event(EMPLOYEE_ATTENDANCE_EVENT));
};

function formatTime(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(minutes?: number) {
  const total = minutes ?? 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

// Zero-pads minutes and seconds so the value does not reflow as it counts up.
function formatRunningTime(minutes: number) {
  const totalSeconds = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}h ${pad(m)}m ${pad(s)}s`;
}

// One stat card. Label + icon stay on a single line (nowrap, shrinkable),
// value sits underneath. Compact height so the row is not oversized.
const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  live?: boolean;
  tone: string;
  iconColor: string;
}> = ({ icon, label, value, live, tone, iconColor }) => (
  // Size container: fonts scale with the card's own width (cqw), so the label
  // always fits on one line. Icon sits above the label to give the text the
  // full card width, which lets the fonts be larger.
  <div
    className={`flex min-w-0 flex-col rounded-xl border px-3 py-3.5 ${tone}`}
    style={{ containerType: "inline-size" }}
  >
    <span className={iconColor}>{icon}</span>

    <p
      className="mt-2 whitespace-nowrap font-medium text-[#667385]"
      style={{ fontSize: "clamp(10px, 8.6cqw, 14px)" }}
    >
      {label}
    </p>

    <div className="mt-3 flex items-center justify-center gap-1.5 whitespace-nowrap">
      {live && (
        <span
          title="Live"
          className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#0E9F8B]"
        />
      )}
      <p
        className={`${DISPLAY} font-bold tabular-nums`}
        style={{ fontSize: "clamp(14px, 12cqw, 19px)" }}
      >
        {value}
      </p>
    </div>
  </div>
);

const TodayAttendance: React.FC<{
  attendanceToday?: AttendanceToday;
  loading?: boolean;
  onRefresh: () => void;
  onLeaveRequest: () => void;
}> = ({ attendanceToday, loading, onRefresh, onLeaveRequest }) => {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showMeeting, setShowMeeting] = useState(false);

  const status = attendanceToday?.status;
  const checkedIn = Boolean(attendanceToday?.checkIn && !attendanceToday?.checkOut);
  const onBreak = status === "on_break";

  // Only tick while on the clock, so an idle dashboard does no per-second work.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!checkedIn) return;

    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [checkedIn]);

  // Mirrors liveWorkingMinutes() on the server: persisted once checked out,
  // otherwise measured from check-in, with completed breaks deducted and an
  // in-progress break acting as the end of the window so the clock pauses.
  const liveWorkingMinutes = useMemo(() => {
    const persisted = attendanceToday?.workingMinutes ?? 0;
    if (!checkedIn) return persisted;

    const checkInMs = new Date(attendanceToday?.checkIn ?? 0).getTime();
    if (Number.isNaN(checkInMs)) return persisted;

    const endMs = attendanceToday?.breakStart
      ? new Date(attendanceToday.breakStart).getTime()
      : now;

    return Math.max(0, (endMs - checkInMs) / 60000 - (attendanceToday?.breakMinutes ?? 0));
  }, [attendanceToday, checkedIn, now]);

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      onRefresh();
    } catch (err: any) {
      setActionError(err.response?.data?.message || "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckIn = () =>
    runAction(async () => {
      await employeeApi.post("/attendance/check-in");
      updateStoredAttendanceStatus("online");
    });

  const handleCheckOut = () =>
    runAction(async () => {
      await employeeApi.post("/attendance/check-out");
      updateStoredAttendanceStatus("offline");
    });

  const handleBreakStart = () =>
    runAction(async () => {
      await employeeApi.post("/attendance/break/start");
      updateStoredAttendanceStatus("on_break");
    });

  const handleBreakEnd = () =>
    runAction(async () => {
      await employeeApi.post("/attendance/break/end");
      updateStoredAttendanceStatus("online");
    });

  return (
    <section aria-label="Today's attendance" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <CalendarCheck size={22} strokeWidth={2} className="text-[#6A55D6]" />

        <h3 className={`${DISPLAY} text-[17px] font-bold`}>Today's attendance</h3>
      </div>

      {actionError && (
        <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">
          {actionError}
        </p>
      )}

      {/* Main Content */}
      <div className="mt-4 grid grid-cols-[250px_minmax(0,1fr)] items-start gap-4">
        {/* LEFT STATUS */}
        <div className="rounded-xl border border-[#DCE2E8] bg-white p-4">
          {/* Current Status */}
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${checkedIn ? "bg-[#0E9F8B]" : "bg-[#B6C0CC]"}`}
            />

            <p className="text-[13px] text-[#667385]">Current status</p>
          </div>

          {/* Online Status */}
          <div className="mt-2 flex h-11 items-center rounded-xl bg-[#F4F6F8] px-4">
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  onBreak ? "bg-[#E2A100]" : checkedIn ? "bg-[#0E9F8B]" : "bg-[#B6C0CC]"
                }`}
              />

              <span className={`${DISPLAY} text-[17px] font-bold`}>
                {onBreak ? "On Break" : checkedIn ? "Online" : "Offline"}
              </span>
            </div>
          </div>

          {/* Checked In Message */}
          {checkedIn && (
            <div className="mt-3 rounded-xl bg-[#E6F5F2] px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0E9F8B] text-base font-semibold text-white">
                  ✓
                </div>

                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[14px] font-semibold text-[#0E9F8B]">
                    You are checked in
                  </p>

                  <p className="mt-0.5 whitespace-nowrap text-xs text-[#667385]">
                    Since {formatTime(attendanceToday?.checkIn)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Check Out / Check In */}
          <div className="mt-3">
            {checkedIn ? (
              <button
                type="button"
                disabled={busy || loading}
                onClick={handleCheckOut}
                className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#E4484D] text-[15px] font-semibold text-white transition hover:bg-[#c93b40] disabled:opacity-60"
              >
                <LogOut size={18} className="shrink-0" />
                Check Out
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || loading}
                onClick={handleCheckIn}
                className="flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#6A55D6] text-[15px] font-semibold text-white transition hover:bg-[#5a47bd] disabled:opacity-60"
              >
                <LogIn size={18} className="shrink-0" />
                Check In
              </button>
            )}
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="min-w-0">
          {/* STAT CARDS */}
          <div className="grid grid-cols-5 gap-2.5">
            <StatCard
              icon={<Clock3 size={20} />}
              label="Check In"
              value={formatTime(attendanceToday?.checkIn)}
            tone="border-[#0E9F8B]/20 bg-[#E6F5F2]"
              iconColor="text-[#0E9F8B]"
            />

            <StatCard
              icon={<Clock3 size={20} />}
              label="Check Out"
              value={formatTime(attendanceToday?.checkOut)}
            tone="border-[#E4484D]/20 bg-[#FCE8E8]"
              iconColor="text-[#E4484D]"
            />

            <StatCard
              live={checkedIn}
              icon={<Clock3 size={20} />}
              label="Working Hours"
              value={
                checkedIn
                  ? formatRunningTime(liveWorkingMinutes)
                  : formatDuration(attendanceToday?.workingMinutes)
              }
            tone="border-[#6A55D6]/20 bg-[#EEEBFA]"
              iconColor="text-[#6A55D6]"
            />

            <StatCard
              icon={<Coffee size={20} />}
              label="Break Time"
              value={formatDuration(attendanceToday?.breakMinutes)}
            tone="border-[#E2A100]/25 bg-[#FDF3DC]"
              iconColor="text-[#9C6F00]"
            />

            <StatCard
              icon={<Clock3 size={20} />}
              label="Overtime"
              value={formatDuration(attendanceToday?.overtimeMinutes)}
            tone="border-[#E4484D]/20 bg-[#FCE8E8]"
              iconColor="text-[#E4484D]"
            />
          </div>

          {/* ACTION AREA */}
          <div className="mt-3 rounded-xl bg-[#F8FAFC] p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {/* Start / End Break */}
              <button
                type="button"
                disabled={busy || loading || !checkedIn}
                onClick={onBreak ? handleBreakEnd : handleBreakStart}
                className="flex h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#DCE2E8] bg-white px-3 text-[15px] font-semibold text-[#667385] transition hover:border-[#6A55D6] hover:text-[#6A55D6] disabled:opacity-60"
              >
                <Coffee size={18} className="shrink-0" />
                <span>{onBreak ? "End Break" : "Start Break"}</span>
              </button>

              {/* Start Meeting */}
              <button
                type="button"
                onClick={() => setShowMeeting(true)}
                className="flex h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#6A55D6]/25 bg-[#EEEBFA] px-3 text-[15px] font-semibold text-[#6A55D6] transition hover:bg-[#6A55D6] hover:text-white"
              >
                <UsersRound size={18} className="shrink-0" />
                <span>Start Meeting</span>
              </button>

              {/* Leave Request */}
              <button
                type="button"
                onClick={onLeaveRequest}
                className="flex h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[#E4484D]/25 bg-[#FCE8E8] px-3 text-[15px] font-semibold text-[#E4484D] transition hover:bg-[#E4484D] hover:text-white"
              >
                <CalendarDays size={18} className="shrink-0" />
                <span>Leave Request</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <MeetingDialog
        open={showMeeting}
        onClose={() => setShowMeeting(false)}
        onCreated={onRefresh}
        scope="employee"
      />
    </section>
  );
};

export default TodayAttendance;