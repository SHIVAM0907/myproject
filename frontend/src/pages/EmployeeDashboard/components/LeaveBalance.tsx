import React, { useEffect, useMemo, useState } from "react";
import { Briefcase, Stethoscope, PartyPopper, CalendarX2 } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

type LeaveType = {
  key: keyof typeof balanceMap;
  label: string;
  used: number;
  total: number | null;
  icon: React.ElementType;
  iconColor: string;
  barColor: string;
};

const balanceMap = {
  casual: { label: "Casual Leave", icon: Briefcase, iconColor: "text-[#2459A6]", barColor: "bg-[#2459A6]" },
  sick: { label: "Sick Leave", icon: Stethoscope, iconColor: "text-rose-500", barColor: "bg-rose-500" },
  earned: { label: "Earned Leave", icon: PartyPopper, iconColor: "text-green-600", barColor: "bg-green-500" },
  unpaid: { label: "Unpaid Leave", icon: CalendarX2, iconColor: "text-amber-500", barColor: "bg-amber-500" },
} as const;

const emptyBalance = {
  casual: { total: 0, used: 0, remaining: 0 },
  sick: { total: 0, used: 0, remaining: 0 },
  earned: { total: 0, used: 0, remaining: 0 },
  unpaid: { total: 0, used: 0, remaining: 0 },
};

const LeaveBalance: React.FC = () => {
  const [balance, setBalance] = useState<Record<string, { total: number; used: number; remaining: number }>>(emptyBalance);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    employeeApi
      .get("/leave/balance")
      .then((res) => {
        if (mounted) {
          setBalance(res.data?.balance ?? emptyBalance);
        }
      })
      .catch(() => {
        if (mounted) setBalance(emptyBalance);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const leaves = useMemo<LeaveType[]>(() =>
    (Object.keys(balanceMap) as Array<keyof typeof balanceMap>).map((key) => ({
      key,
      label: balanceMap[key].label,
      used: Number(balance?.[key]?.used ?? 0),
      total: key === "unpaid" ? null : Number(balance?.[key]?.total ?? 0),
      icon: balanceMap[key].icon,
      iconColor: balanceMap[key].iconColor,
      barColor: balanceMap[key].barColor,
    })),
    [balance],
  );

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[#10284A]">Leave Balance</h3>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {leaves.map((leave) => {
          const pct = leave.total ? Math.min(100, (leave.used / leave.total) * 100) : 0;

          return (
            <div key={leave.key} className="rounded-xl border border-gray-100 px-3.5 py-3">
              {/* Icon beside the text keeps the card short */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50">
                  <leave.icon size={18} className={leave.iconColor} />
                </div>

                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[13px] font-medium leading-tight text-gray-500">
                    {leave.label}
                  </p>

                  <p className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap leading-tight">
                    <span className="text-xl font-bold text-[#10284A]">
                      {loading ? "--" : leave.used}
                    </span>
                    <span className="text-xs text-gray-400">
                      {loading ? "Loading" : leave.total ? `of ${leave.total} days` : "taken"}
                    </span>
                  </p>
                </div>
              </div>

              {leave.total ? (
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={`h-full rounded-full ${leave.barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default LeaveBalance;