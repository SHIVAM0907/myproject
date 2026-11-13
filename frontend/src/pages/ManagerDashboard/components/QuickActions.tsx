// Floating action bar. Break toggle and meeting dialog keep their original behaviour.
import React from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";
import type { AttendanceToday } from "../../../types/Employee";
import MeetingDialog from "../../../components/MeetingDialog";

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

const QuickActions: React.FC<{
  attendanceToday?: AttendanceToday;
  onRefresh: () => void | Promise<void>;
}> = ({ attendanceToday, onRefresh }) => {
  const navigate = useNavigate();
  const [showMeeting, setShowMeeting] = React.useState(false);
  const [breakBusy, setBreakBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const checkIn = attendanceToday?.checkIn ?? null;
  const checkOut = attendanceToday?.checkOut ?? null;
  const onBreak = attendanceToday?.status === "on_break";

  const handleBreakToggle = async () => {
    setBreakBusy(true);
    setActionError(null);
    try {
      if (onBreak) {
        await employeeApi.post("/attendance/break/end");
      } else {
        if (!checkIn) await employeeApi.post("/attendance/check-in");
        await employeeApi.post("/attendance/break/start");
      }
      await onRefresh();
    } catch (err: any) {
      setActionError(err.response?.data?.message || "Could not update your break.");
    } finally {
      setBreakBusy(false);
    }
  };

  const btn = "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="sticky bottom-3 mt-5 flex flex-col items-center gap-2">
      {actionError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{actionError}</p>}

      <div role="toolbar" aria-label="Quick actions" className="flex max-w-full gap-1.5 overflow-x-auto rounded-full bg-[#121C2B] p-1.5">
        <button type="button" className={btn} onClick={() => scrollToId("team-attendance-section")}>Review attendance</button>
        <button type="button" className={btn} onClick={() => scrollToId("pending-leave-section")}>Decide leave</button>
        <button type="button" className={btn} onClick={() => navigate("/manager/reports")}>Open reports</button>
        <button type="button" className={btn} onClick={() => navigate("/manager/team-members")}>See team</button>
        <button type="button" className={btn} disabled={breakBusy || Boolean(checkOut)} onClick={handleBreakToggle} title={checkOut ? "You already checked out for today" : undefined}>
          {breakBusy ? <Loader2 size={16} className="inline animate-spin" /> : onBreak ? "End break" : "Take a break"}
        </button>
        <button type="button" className={btn} onClick={() => setShowMeeting(true)}>Start meeting</button>
      </div>

      <MeetingDialog open={showMeeting} onClose={() => setShowMeeting(false)} onCreated={() => onRefresh()} scope="manager" />
    </div>
  );
};

export default QuickActions;