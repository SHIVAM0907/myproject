import React from "react";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";

const Calendar: React.FC = () => {
  return (
    <section aria-label="My calendar" className="mt-4">
      <h1 className={`${DISPLAY} text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight`}>
        My calendar
      </h1>

      <p className="mt-1 text-[#667385]">View your meetings and scheduled activities.</p>

      <div className={`${CARD} mt-4`}>
        <h2 className={`${DISPLAY} text-[17px] font-bold`}>September 2026</h2>

        <p className="mt-3 text-sm text-[#667385]">Calendar events will appear here.</p>
      </div>
    </section>
  );
};

export default Calendar;