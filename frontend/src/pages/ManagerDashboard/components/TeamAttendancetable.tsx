// Team attendance as an hour-by-hour timeline (same data and polling as the old table).
import React, { useCallback, useEffect, useState } from "react";
import employeeApi from "../../../lib/employeeApi";
import type { TeamAttendanceRow } from "../../../types/Employee";

const POLL_MS = 30_000;
const START = 8;
const END = 18;
const TABS = ["All", "Present", "Late", "Absent", "Leave", "Break", "On Call", "Offline"] as const;

const BAR: Record<string, string> = { Online: "#0E9F8B", Break: "#3B82C4", "On Call": "#6A55D6", Offline: "#667385" };
const LABEL: Record<string, string> = { Online: "#0E9F8B", Break: "#3B82C4", "On Call": "#6A55D6", Late: "#E2A100", Absent: "#E4484D", Leave: "#667385", Offline: "#667385" };

const initialsOf = (name: string) => name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const hoursOf = (v: string | Date) => {
  const d = new Date(v);
  return d.getHours() + d.getMinutes() / 60;
};
const pct = (h: number) => Math.min(100, Math.max(0, ((h - START) / (END - START)) * 100));
const formatDuration = (m?: number) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : "-");

const TeamAttendanceTable: React.FC = () => {
  const [rows, setRows] = useState<TeamAttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]>("All");

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await employeeApi.get<{ date: string; rows: TeamAttendanceRow[] }>("/team/attendance/rows");
      setRows(res.data?.rows ?? []);
    } catch (err: any) {
      setRows([]);
      setError(err.response?.data?.message || "Could not load team attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    const timer = setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const filtered =
    activeTab === "All"
      ? rows
      : rows.filter((r) => (r.attendance ?? "Absent") === activeTab || (r.activity ?? "Offline") === activeTab);

  const now = hoursOf(new Date());

  return (
    <section aria-label="Team day" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-['Bricolage_Grotesque',sans-serif] text-[17px] font-bold tracking-tight">Team day, hour by hour</h3>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${activeTab === tab ? "bg-[#6A55D6] text-white" : "bg-[#F4F6F8] text-[#667385] hover:text-[#121C2B]"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}

      <div className="overflow-x-auto">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[150px_1fr_78px] text-xs text-[#667385]">
            <span />
            <div className="flex justify-between pb-1.5">
              {Array.from({ length: (END - START) / 2 + 1 }, (_, i) => START + i * 2).map((h) => (
                <span key={h}>{h % 12 || 12}{h < 12 ? "a" : "p"}</span>
              ))}
            </div>
            <span />
          </div>

          {loading ? (
            <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">No one is in this group right now.</p>
          ) : (
            filtered.map((emp) => {
              const attendance = emp.attendance ?? "Absent";
              const activity = emp.activity ?? "Offline";
              const hasBar = Boolean(emp.checkIn);
              const from = hasBar ? hoursOf(emp.checkIn as string) : 0;
              const to = hasBar ? (emp.checkOut ? hoursOf(emp.checkOut) : now) : 0;
              const color = attendance === "Late" && !emp.checkOut ? BAR.Online : BAR[activity] ?? BAR.Offline;
              const pillKey = attendance === "Absent" || attendance === "Leave" || attendance === "Late" ? attendance : activity;

              return (
                <div key={emp._id} className="grid grid-cols-[150px_1fr_78px] items-center border-t border-[#DCE2E8] py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#F4F6F8] text-[11px] font-semibold text-[#6A55D6]">
                      {initialsOf(emp.name)}
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm font-semibold">{emp.name}</strong>
                      <small className="text-xs text-[#667385]">{emp.department || "-"}</small>
                    </div>
                  </div>

                  <div
                    className="relative h-[22px] rounded-[7px]"
                    style={{ background: "repeating-linear-gradient(90deg,#F4F6F8 0 calc(10% - 1px),transparent calc(10% - 1px) 10%)" }}
                  >
                    {hasBar ? (
                      <>
                        {attendance === "Late" && (
                          <div className="absolute inset-y-0 rounded-md bg-[#E2A100]" style={{ left: `${pct(Math.max(START, from - 1))}%`, width: `${pct(from) - pct(Math.max(START, from - 1))}%` }} />
                        )}
                        <div className="absolute inset-y-0 rounded-md" style={{ left: `${pct(from)}%`, width: `${Math.max(pct(to) - pct(from), 1)}%`, background: color }} />
                        {!emp.checkOut && <div className="absolute -inset-y-1 z-[2] w-0.5 bg-[#E4484D]" style={{ left: `${pct(now)}%` }} />}
                      </>
                    ) : (
                      <span className="absolute left-2 top-0.5 text-xs text-[#667385]">{attendance === "Leave" ? "On leave today" : "No check-in yet"}</span>
                    )}
                  </div>

                  <div className="flex flex-col items-end">
                    <span className="rounded-full bg-[#F4F6F8] px-2.5 py-0.5 text-xs font-semibold" style={{ color: LABEL[pillKey] }}>{pillKey}</span>
                    <small className="mt-0.5 text-[11px] text-[#667385]">{formatDuration(emp.workingMinutes)}</small>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#667385]">
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#0E9F8B]" />Online</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#3B82C4]" />Break</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#6A55D6]" />On call</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-[#E2A100]" />Late start</span>
        <span><i className="mr-1.5 inline-block h-2.5 w-[3px] bg-[#E4484D]" />Now</span>
      </div>
    </section>
  );
};

export default TeamAttendanceTable;