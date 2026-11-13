import React, { useState } from "react";

type Category = "Absent" | "Abnormal" | "Exceeded Break Time" | "Other";
type AlertEntry = { category: string; text: string; time: string };

const BAR: Record<Category, string> = {
  Absent: "#E4484D",
  "Exceeded Break Time": "#E2A100",
  Abnormal: "#3B82C4",
  Other: "#0E9F8B",
};
const TABS: Array<"All" | Category> = ["All", "Absent", "Abnormal", "Exceeded Break Time"];

const AlertsNotifications: React.FC<{ alerts?: AlertEntry[]; loading?: boolean }> = ({ alerts, loading }) => {
  const [activeTab, setActiveTab] = useState<"All" | Category>("All");
  const items = alerts ?? [];
  const filtered = activeTab === "All" ? items : items.filter((a) => a.category === activeTab);

  return (
    <section aria-label="Alerts" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <h3 className="font-['Bricolage_Grotesque',sans-serif] text-[17px] font-bold tracking-tight">Alerts</h3>

      <div className="mb-2 mt-3 flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${activeTab === tab ? "bg-[#6A55D6] text-white" : "bg-[#F4F6F8] text-[#667385] hover:text-[#121C2B]"}`}
          >
            {tab === "Exceeded Break Time" ? "Long breaks" : tab}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-4 text-sm text-[#667385]">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-sm text-[#667385]">No alerts right now.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {filtered.map((alert, i) => (
            <li key={i} className="flex gap-3 border-t border-[#DCE2E8] py-3">
              <i className="w-1 shrink-0 rounded" style={{ background: BAR[alert.category as Category] ?? BAR.Other }} />
              <div>
                <b className="text-sm">{alert.text}</b>
                <br />
                <small className="text-[#667385]">{alert.time}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default AlertsNotifications;