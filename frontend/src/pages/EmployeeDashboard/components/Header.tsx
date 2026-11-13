import React from "react";
import { CalendarDays, Sun, UserRound } from "lucide-react";
import { useEmployeeAuth } from "../../../contexts/EmployeeAuthContext";
import employeeApi from "../../../lib/employeeApi";
import { getProfileImageUrl } from "../../../utils/getImageUrl";
import type { AttendanceToday } from "../../../types/Employee";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

// Resolves the R2 key to a signed URL whenever the signed-in employee changes,
// so a picture uploaded on the profile screen appears here without a reload.
// Falls back to an empty string while loading, and on failure, so the header
// shows initials rather than a broken image.
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

const EMPLOYEE_ATTENDANCE_KEY = "employee_attendance_status";
const EMPLOYEE_ATTENDANCE_EVENT = "employee-attendance-status-change";

const getStoredAttendanceStatus = (): string => {
  if (typeof window === "undefined") return "offline";
  return localStorage.getItem(EMPLOYEE_ATTENDANCE_KEY) ?? "offline";
};

// The API answers with present/on_break/leave/absent, while the locally stored
// hint uses online/offline. checkIn/checkOut is the reliable signal either way,
// because the record keeps status "present" after a checkout, so the status
// string on its own would still read as present.
const labelFor = (status: string | null | undefined, checkedIn: boolean) => {
  if (status === "on_break") return "On Break";
  if (status === "leave") return "On Leave";
  return checkedIn ? "Online" : "Offline";
};

const dotFor = (label: string) => {
  if (label === "On Break") return "bg-[#E2A100]";
  if (label === "On Leave") return "bg-[#6A55D6]";
  if (label === "Online") return "bg-[#0E9F8B]";
  return "bg-[#B6C0CC]";
};

const Header: React.FC<{
  attendanceToday?: AttendanceToday;
  loading?: boolean;
  onRefresh?: () => void;
}> = ({ attendanceToday }) => {
  const { employee } = useEmployeeAuth();
  const [liveStatus, setLiveStatus] = React.useState<string>(getStoredAttendanceStatus());
  const [ownAttendance, setOwnAttendance] = React.useState<AttendanceToday | undefined>(undefined);

  // Check in/out broadcasts a change so a header rendered on a page with no
  // attendance data of its own still updates straight away.
  React.useEffect(() => {
    const syncStatus = () => setLiveStatus(getStoredAttendanceStatus());

    window.addEventListener(EMPLOYEE_ATTENDANCE_EVENT, syncStatus);

    return () => {
      window.removeEventListener(EMPLOYEE_ATTENDANCE_EVENT, syncStatus);
    };
  }, []);

  // The button needs real attendance to decide which way round it should read,
  // so pages that render the header without it get their own copy.
  React.useEffect(() => {
    if (attendanceToday) return;
    let active = true;

    const load = async () => {
      try {
        const res = await employeeApi.get<{ attendance: AttendanceToday }>("/attendance/today");
        if (active) setOwnAttendance(res.data?.attendance ?? undefined);
      } catch {
        if (active) setOwnAttendance(undefined);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [attendanceToday]);

  const today = attendanceToday ?? ownAttendance;

  const employeeName =
    employee && (employee.firstName || employee.lastName)
      ? `${employee.firstName ?? ""} ${employee.lastName ?? ""}`.trim()
      : "Employee";

  const employeeCode = employee?.employeeCode ?? "EMP";

  const profileImage = useProfileImage(employee?.profile?.imageUrl);
  const initials = `${employee?.firstName?.[0] ?? ""}${employee?.lastName?.[0] ?? ""}`.toUpperCase();
  // Initials stand in until the signed URL lands, and permanently if there is
  // no picture or the lookup fails, so the avatar is never a bare grey circle.
  const avatarNode = profileImage ? (
    <img src={profileImage} alt={employeeName} className="h-full w-full object-cover" />
  ) : (
    <span className="text-xs font-bold text-[#6A55D6]">{initials || <UserRound size={20} strokeWidth={1.8} />}</span>
  );

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good Morning" : hour < 18 ? "Good Afternoon" : "Good Evening";

  // Short month keeps the date pill compact enough to stay on one line.
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  // Freshly fetched attendance is authoritative; the stored hint is only a
  // fallback for the pages that mount the header without it.
  const checkedIn = today
    ? Boolean(today.checkIn && !today.checkOut)
    : liveStatus === "online";

  const attendanceLabel = labelFor(today?.status ?? liveStatus, checkedIn);
  const attendanceColor = dotFor(attendanceLabel);

  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[#DCE2E8] bg-white px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        {/* Left: avatar + greeting */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EEEBFA] text-[#6A55D6]">
            {avatarNode}
          </div>

          <div className="min-w-0">
            <h2 className={`${DISPLAY} flex items-center gap-1.5 whitespace-nowrap text-[19px] font-bold leading-tight`}>
              {greeting}
              <Sun size={20} strokeWidth={1.8} className="shrink-0 text-[#E2A100]" />
            </h2>

            <p className="mt-0.5 whitespace-nowrap text-[17px] font-semibold leading-tight">
              {employeeName}
            </p>

            <p className="mt-0.5 whitespace-nowrap text-xs leading-tight text-[#667385]">
              Employee ID: {employeeCode}
            </p>
          </div>
        </div>

        {/* Right: date, status, action, profile */}
        <div className="flex shrink-0 items-center gap-4 whitespace-nowrap">
          <div className="flex h-10 items-center gap-2 rounded-full border border-[#DCE2E8] bg-white px-3">
            <CalendarDays size={16} className="shrink-0 text-[#6A55D6]" />
            <span className="text-sm font-medium text-[#667385]">{formattedDate}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${attendanceColor}`} />
            <span className="text-[15px] font-semibold">{attendanceLabel}</span>
          </div>

          <div className="flex items-center gap-2.5 border-l border-[#DCE2E8] pl-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EEEBFA] text-[#6A55D6]">
              {avatarNode}
            </div>

            <div className="leading-tight">
              <p className="whitespace-nowrap text-[15px] font-semibold">{employeeName}</p>
              {employee?.designation && (
                <p className="whitespace-nowrap text-xs text-[#667385]">{employee.designation}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;