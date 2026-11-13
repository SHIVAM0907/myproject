import React, { useEffect, useMemo, useState } from "react";
import { History, Search, ChevronDown } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

type LeaveType = "Casual Leave" | "Sick Leave" | "Earned Leave" | "Unpaid Leave";

type LeaveRecord = {
  _id?: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string;
  status: string;
};

const leaveTypeMap: Record<string, LeaveType> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};

const typeDotColor: Record<LeaveType, string> = {
  "Casual Leave": "bg-[#2459A6]",
  "Sick Leave": "bg-rose-500",
  "Earned Leave": "bg-green-500",
  "Unpaid Leave": "bg-amber-500",
};

const statusStyles: Record<string, string> = {
  approved: "bg-green-50 text-green-600",
  rejected: "bg-rose-50 text-rose-500",
  pending: "bg-amber-50 text-amber-600",
  draft: "bg-slate-100 text-slate-600",
  cancelled: "bg-gray-100 text-gray-500",
};

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const LeaveHistoryTable: React.FC = () => {
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    employeeApi
      .get("/leave/history")
      .then((res) => {
        if (mounted) setRecords(res.data?.leaveRequests ?? []);
      })
      .catch(() => {
        if (mounted) setRecords([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const filteredRecords = useMemo(
    () =>
      records.filter((r) => {
        const label = leaveTypeMap[r.leaveType] ?? r.leaveType;
        const reason = (r.reason ?? "").toLowerCase();
        return label.toLowerCase().includes(search.toLowerCase()) || reason.includes(search.toLowerCase());
      }),
    [records, search],
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <History size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">
            Leave History
          </h3>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2">
          <Search size={16} className="text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leave requests..."
            className="w-48 bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-400"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {["All Status", "All Types", "This Year"].map((filter) => (
          <button
            key={filter}
            className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {filter}
            <ChevronDown size={14} className="text-gray-400" />
          </button>
        ))}
      </div>

      {/* Fixed-height area: rows scroll inside it and the header row stays visible */}
      <div className="mt-4 max-h-[340px] overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-xs font-medium text-gray-400">
              <th className="pb-3 pr-4 font-medium">Leave Type</th>
              <th className="pb-3 pr-4 font-medium">From</th>
              <th className="pb-3 pr-4 font-medium">To</th>
              <th className="pb-3 pr-4 font-medium">Days</th>
              <th className="pb-3 pr-4 font-medium">Reason</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 font-medium">View More</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400">
                  Loading leave history...
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400">
                  No leave requests match your search.
                </td>
              </tr>
            ) : (
              filteredRecords.map((r) => {
                const label = leaveTypeMap[r.leaveType] ?? r.leaveType;
                const status = String(r.status || "pending").toLowerCase();
                return (
                  <tr key={r._id ?? `${r.leaveType}-${r.fromDate}-${r.toDate}`} className="text-sm">
                    <td className="py-3.5 pr-4">
                      <span className="flex items-center gap-2 font-medium text-[#10284A]">
                        <span className={`h-2 w-2 rounded-full ${typeDotColor[label as LeaveType] ?? "bg-gray-400"}`} />
                        {label}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-gray-600">{formatDate(r.fromDate)}</td>
                    <td className="py-3.5 pr-4 text-gray-600">{formatDate(r.toDate)}</td>
                    <td className="py-3.5 pr-4 text-gray-600">{r.days}</td>
                    <td className="py-3.5 pr-4 text-gray-600">{r.reason || "-"}</td>

                    <td className="py-3.5 pr-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[status] ?? "bg-gray-100 text-gray-500"}`}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>

                    <td className="py-3.5">
                      <button className="text-sm font-medium text-[#2459A6] hover:underline">
                        View More
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

    </section>
  );
};

export default LeaveHistoryTable;