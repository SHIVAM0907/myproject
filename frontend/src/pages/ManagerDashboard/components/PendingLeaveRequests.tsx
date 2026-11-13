import React, { useState } from "react";
import employeeApi from "../../../lib/employeeApi";

type LeaveRequest = {
  _id?: string;
  employee?: string | { _id: string; firstName: string; lastName: string; employeeCode?: string; department?: string };
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason?: string;
  status: string;
};

const nameOf = (e: LeaveRequest["employee"]) =>
  e && typeof e === "object" ? `${e.firstName} ${e.lastName}`.trim() : "Unknown";

function formatDates(from: string, to: string) {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const a = new Date(from).toLocaleDateString("en-GB", opts);
  const b = new Date(to).toLocaleDateString("en-GB", opts);
  return a === b ? a : `${a} \u2013 ${b}`;
}

const TYPES: Record<string, string> = { casual: "Casual leave", sick: "Sick leave", earned: "Earned leave", unpaid: "Unpaid leave" };

const PendingLeaveRequests: React.FC<{
  requests?: LeaveRequest[];
  loading?: boolean;
  onReviewed: () => void;
}> = ({ requests, loading, onReviewed }) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const items = requests ?? [];

  const review = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    setError(null);
    try {
      await employeeApi.patch(`/team/leave/${id}/status`, { status });
      onReviewed();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not update this leave request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Leave requests" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <h3 className="mb-2 font-['Bricolage_Grotesque',sans-serif] text-[17px] font-bold tracking-tight">Leave waiting on you</h3>
      {error && <p className="mb-2 text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="py-4 text-sm text-[#667385]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-sm text-[#667385]">No pending leave requests.</p>
      ) : (
        items.map((req) => (
          <div key={req._id ?? `${req.leaveType}-${req.fromDate}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 border-t border-[#DCE2E8] py-3">
            <div className="min-w-0">
              <b className="block truncate">{nameOf(req.employee)}</b>
              <small className="text-[#667385]">
                {TYPES[req.leaveType] ?? req.leaveType} · {formatDates(req.fromDate, req.toDate)}
                {req.reason ? ` · ${req.reason}` : ""}
              </small>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busyId === req._id || !req._id}
                onClick={() => req._id && review(req._id, "approved")}
                className="rounded-lg bg-[#0E9F8B] px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busyId === req._id || !req._id}
                onClick={() => req._id && review(req._id, "rejected")}
                className="rounded-lg bg-[#F4F6F8] px-3 py-1.5 text-xs font-semibold text-[#E4484D] transition hover:bg-[#e9edf1] disabled:opacity-60"
              >
                Reject
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
};

export default PendingLeaveRequests;