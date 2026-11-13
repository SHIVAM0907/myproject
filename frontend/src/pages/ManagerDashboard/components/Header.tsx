import React from "react";
import { LogIn, LogOut } from "lucide-react";
import { useEmployeeAuth } from "../../../contexts/EmployeeAuthContext";
import employeeApi from "../../../lib/employeeApi";
import { getProfileImageUrl } from "../../../utils/getImageUrl";
import type { AttendanceToday } from "../../../types/Employee";

const useProfileImage = (imageUrl?: string) => {
  const [src, setSrc] = React.useState("");
  React.useEffect(() => {
    let active = true;
    if (!imageUrl) {
      setSrc("");
      return;
    }
    getProfileImageUrl(imageUrl).then((url) => {
      if (active) setSrc(url);
    });
    return () => {
      active = false;
    };
  }, [imageUrl]);
  return src;
};

const Header: React.FC<{
  attendanceToday?: AttendanceToday;
  loading?: boolean;
  onRefresh?: () => void;
}> = ({ attendanceToday, loading, onRefresh }) => {
  const { employee } = useEmployeeAuth();
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [ownAttendance, setOwnAttendance] = React.useState<AttendanceToday | undefined>(undefined);

  React.useEffect(() => {
    if (attendanceToday) return;
    let active = true;
    employeeApi
      .get<{ attendance: AttendanceToday }>("/attendance/today")
      .then((res) => active && setOwnAttendance(res.data?.attendance ?? undefined))
      .catch(() => active && setOwnAttendance(undefined));
    return () => {
      active = false;
    };
  }, [attendanceToday]);

  const today = attendanceToday ?? ownAttendance;
  const managerName =
    employee && (employee.firstName || employee.lastName)
      ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
      : "Manager";
  const profileImage = useProfileImage(employee?.profile?.imageUrl);
  const initials = `${employee?.firstName?.[0] ?? ""}${employee?.lastName?.[0] ?? ""}`.toUpperCase() || "M";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const formattedDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date());

  const checkedIn = Boolean(today?.checkIn && !today?.checkOut);
  const onBreak = today?.status === "on_break";
  const statusLabel = onBreak ? "On break" : checkedIn ? "Online" : "Offline";
  const statusColor = onBreak ? "bg-[#E2A100]" : checkedIn ? "bg-[#0E9F8B]" : "bg-gray-400";

  const runAction = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      if (onRefresh) onRefresh();
      else {
        const res = await employeeApi.get<{ attendance: AttendanceToday }>("/attendance/today");
        setOwnAttendance(res.data?.attendance ?? undefined);
      }
    } catch (err: any) {
      setActionError(err.response?.data?.message || "That action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="mb-4 flex flex-wrap items-center gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-semibold text-[#6A55D6]">
        {profileImage ? <img src={profileImage} alt={managerName} className="h-full w-full object-cover" /> : initials}
      </div>
      <div className="min-w-0">
        <h2 className="truncate font-['Bricolage_Grotesque',sans-serif] text-2xl font-bold tracking-tight">
          {greeting}, {managerName}
        </h2>
        <p className="text-sm text-[#667385]">{formattedDate}</p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {actionError && <p className="max-w-[220px] truncate rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{actionError}</p>}
        <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          {statusLabel}
        </span>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => runAction(() => employeeApi.post(checkedIn ? "/attendance/check-out" : "/attendance/check-in"))}
          className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
            checkedIn ? "bg-[#E4484D] hover:bg-[#cf3a3f]" : "bg-[#6A55D6] hover:bg-[#5a47bd]"
          }`}
        >
          {checkedIn ? <LogOut size={16} /> : <LogIn size={16} />}
          {checkedIn ? "Check out" : "Check in"}
        </button>
      </div>
    </header>
  );
};

export default Header;
