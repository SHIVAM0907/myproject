import React from "react";
import { Zap, Coffee, Phone, AlertTriangle, X, Users } from "lucide-react";

type Stats = {
  onBreak?: number;
  onBreakPct?: number;
  onCall?: number;
  onCallPct?: number;
  abnormal?: number;
  abnormalPct?: number;
  onBreakNames?: string[];
  onCallNames?: string[];
  abnormalNames?: string[];
  onCallMeetings?: { name: string; title: string | null; with: string }[];
};

type Card = {
  key: "onBreak" | "onCall" | "abnormal";
  label: string;
  namesKey: "onBreakNames" | "onCallNames" | "abnormalNames";
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  bg: string;
  iconColor: string;
};

type OnCallMeeting = { name: string; title: string | null; with: string };

const CurrentActivity: React.FC<{ stats?: Stats; loading?: boolean }> = ({ stats, loading }) => {
  const [openCard, setOpenCard] = React.useState<Card["key"] | null>(null);

  const cards: Card[] = [
    {
      key: "onBreak",
      label: "On Break",
      namesKey: "onBreakNames",
      icon: Coffee,
      bg: "bg-green-50",
      iconColor: "text-green-600",
    },
    {
      key: "onCall",
      label: "On Call",
      namesKey: "onCallNames",
      icon: Phone,
      bg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
    {
      key: "abnormal",
      label: "Abnormal",
      namesKey: "abnormalNames",
      icon: AlertTriangle,
      bg: "bg-rose-50",
      iconColor: "text-rose-500",
    },
  ];

  const valueFor = (key: Card["key"]) =>
    key === "onBreak" ? stats?.onBreak ?? 0 : key === "onCall" ? stats?.onCall ?? 0 : stats?.abnormal ?? 0;

  const pctFor = (key: Card["key"]) =>
    key === "onBreak"
      ? stats?.onBreakPct ?? 0
      : key === "onCall"
        ? stats?.onCallPct ?? 0
        : stats?.abnormalPct ?? 0;

  const open = cards.find((card) => card.key === openCard) ?? null;

  const close = () => setOpenCard(null);

  React.useEffect(() => {
    if (!openCard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCard]);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Zap size={22} className="shrink-0 text-amber-500" />
        <h3 className="text-lg font-semibold text-[#10284A]">
          Current Activity
        </h3>
      </div>

      {/* content-center keeps the single row of three cards optically aligned
          with the taller two-by-two grid in Today's Attendance beside it. */}
      <div className="mt-4 grid flex-1 grid-cols-3 content-center gap-3 sm:gap-4">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => setOpenCard(card.key)}
            disabled={loading}
            className={`min-w-0 rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${card.bg}`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
              <card.icon size={18} className={card.iconColor} />
            </div>

            <p className="mt-3 truncate text-sm font-medium text-gray-600">
              {card.label}
            </p>

            <p className="mt-1 text-2xl font-bold leading-tight text-[#10284A]">
              {loading ? "--" : valueFor(card.key)}
            </p>

            <p className="mt-0.5 truncate text-xs text-gray-500">
              {loading ? "--" : `${pctFor(card.key)}%`}
            </p>
          </button>
        ))}
      </div>

      {openCard && open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
          aria-hidden={false}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${open.label} employees`}
            className="max-h-[85vh] w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${open.bg}`}>
                  <open.icon size={18} className={open.iconColor} />
                </div>
                <div>
                  <h4 className="text-base font-semibold text-[#10284A]">
                    {open.label}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {loading ? "--" : valueFor(open.key)} employee{valueFor(open.key) === 1 ? "" : "s"} right now
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
              {open.key === "onCall" ? (
                (stats?.onCallMeetings ?? []).length > 0 ? (
                  <ul className="space-y-2">
                    {(stats?.onCallMeetings ?? []).map((meeting: OnCallMeeting) => (
                      <li
                        key={meeting.name}
                        className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700"
                      >
                        <Users size={16} className="mt-0.5 shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{meeting.name}</p>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {meeting.title ? `In "${meeting.title}"` : "In a call"}
                            {meeting.with ? ` with ${meeting.with}` : " alone"}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-gray-500">
                    No one is on call right now.
                  </p>
                )
              ) : (stats?.[open.namesKey] ?? []).length > 0 ? (
                <ul className="space-y-2">
                  {stats?.[open.namesKey]?.map((name) => (
                    <li
                      key={name}
                      className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700"
                    >
                      <Users size={16} className="shrink-0 text-gray-400" />
                      <span className="truncate">{name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-gray-500">
                  No one is {open.label.toLowerCase()} right now.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default CurrentActivity;