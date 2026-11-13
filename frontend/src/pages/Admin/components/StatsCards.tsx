import React from "react";
import type { AdminEmployeeStats } from "../../../types/Employee";

type StatsCardsProps = {
  stats: AdminEmployeeStats | null;
  loading: boolean;
  pendingCount: number;
};

const TONES: Array<{ key: string; label: string; color: string }> = [
  { key: "employee", label: "Employees", color: "#6A55D6" },
  { key: "manager", label: "Managers", color: "#0E9F8B" },
  { key: "active", label: "Active", color: "#0E9F8B" },
  { key: "inactive", label: "Awaiting approval", color: "#E2A100" },
];

/** Headline counts, driven entirely by GET /api/admin/stats. */
const StatsCards: React.FC<StatsCardsProps> = ({ stats, loading, pendingCount }) => (
  <section aria-label="Organisation overview" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {TONES.map((tone) => {
      const value =
        tone.key === "employee" || tone.key === "manager"
          ? (stats?.byRole?.[tone.key] ?? 0)
          : (stats?.byStatus?.[tone.key] ?? 0);

      // `byStatus.inactive` counts every inactive row; the approval panel's
      // count is the authoritative pending figure, so prefer it there.
      const shown = tone.key === "inactive" ? pendingCount : value;

      return (
        <div key={tone.key} className="rounded-[18px] border border-[#DCE2E8] bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-[#667385]">
            <i className="h-2 w-2 rounded-full" style={{ background: tone.color }} aria-hidden="true" />
            {tone.label}
          </div>
          <p className="mt-2 font-['Bricolage_Grotesque',sans-serif] text-4xl font-bold" style={{ color: tone.color }}>
            {loading ? "—" : shown}
          </p>
        </div>
      );
    })}
  </section>
);

export default StatsCards;