// Summary hero: merges the old "Today's Attendance" and "Current Activity" panels.
import React from "react";
import employeeApi from "../../../lib/employeeApi";
import type { TeamAttendanceStats } from "../../../types/Employee";

const POLL_MS = 30_000;
const C = 2 * Math.PI * 62;

const TodayAttendance: React.FC<{ activity?: Record<string, number> }> = ({ activity }) => {
  const [stats, setStats] = React.useState<TeamAttendanceStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setError(null);
        const res = await employeeApi.get<{ date: string; stats: TeamAttendanceStats }>("/team/attendance/stats");
        if (active) setStats(res.data?.stats ?? null);
      } catch (err: any) {
        if (active) setError(err.response?.data?.message || "Could not load attendance summary.");
      }
    };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    const timer = setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const total = stats?.total ?? 0;
  const present = stats?.present ?? 0;
  const late = stats?.late ?? 0;
  const absent = stats?.absent ?? 0;
  const len = (pct?: number) => ((pct ?? 0) / 100) * C;
  const arcs = [
    { color: "#0E9F8B", len: len(stats?.presentPct), off: 0 },
    { color: "#E2A100", len: len(stats?.latePct), off: -len(stats?.presentPct) },
    { color: "#E4484D", len: len(stats?.absentPct), off: -(len(stats?.presentPct) + len(stats?.latePct)) },
  ];

  const chips = [
    { label: "late", value: late, color: "#E2A100" },
    { label: "absent", value: absent, color: "#E4484D" },
    { label: "on break", value: activity?.onBreak ?? 0, color: "#3B82C4" },
    { label: "on call", value: activity?.onCall ?? 0, color: "#6A55D6" },
    { label: "abnormal", value: activity?.abnormal ?? 0, color: "#E4484D" },
  ];

  return (
    <section aria-label="Attendance summary" className="grid grid-cols-1 items-center gap-7 rounded-[22px] border border-[#DCE2E8] bg-white p-6 sm:grid-cols-[auto_1fr] sm:px-8">
      <div className="relative h-[150px] w-[150px] justify-self-center">
        <svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label={`${present} of ${total} present`}>
          <g fill="none" strokeWidth="14" transform="rotate(-90 75 75)">
            <circle cx="75" cy="75" r="62" stroke="#F4F6F8" />
            {arcs.map((a, i) =>
              a.len > 0 ? (
                <circle key={i} cx="75" cy="75" r="62" stroke={a.color} strokeLinecap="round" strokeDasharray={`${Math.max(a.len - 4, 1)} ${C}`} strokeDashoffset={a.off} />
              ) : null,
            )}
          </g>
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center font-['Bricolage_Grotesque',sans-serif] text-4xl font-bold">
          {stats?.presentPct ?? 0}%<small className="font-['Instrument_Sans',sans-serif] text-xs font-normal text-[#667385]">checked in</small>
        </div>
      </div>

      <div>
        <h1 className="max-w-[24ch] font-['Bricolage_Grotesque',sans-serif] text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight">
          {present} of {total} people are in.
        </h1>
        <p className="mb-4 mt-2 text-[#667385]">
          {absent > 0 ? `${absent} absent today.` : "Everyone is accounted for."}
        </p>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <div key={c.label} className="flex items-center gap-2 rounded-xl bg-[#F4F6F8] px-3 py-2">
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              <b className="font-['Bricolage_Grotesque',sans-serif] text-xl">{c.value}</b>
              <span className="text-[13px] text-[#667385]">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TodayAttendance;