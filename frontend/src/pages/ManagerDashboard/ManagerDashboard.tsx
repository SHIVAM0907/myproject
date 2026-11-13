// import React from "react";
// import Sidebar from "../ManagerDashboard/components/Sidebar";
// import Header from "../ManagerDashboard/components/Header";
// import TodayAttendance from "./components/TodayAttendance";
// import PendingLeaveRequests from "../ManagerDashboard/components/PendingLeaveRequests";
// import AlertsNotifications from "../ManagerDashboard/components/AlertNotification";
// import TeamAttendanceTable from "./components/TeamAttendancetable";
// import QuickActions from "../ManagerDashboard/components/QuickActions";
// import employeeApi from "../../lib/employeeApi";
// import type { ManagerDashboardData } from "../../types/Employee";

// const ManagerDashboard: React.FC = () => {
//   const [dashboard, setDashboard] = React.useState<ManagerDashboardData | null>(null);
//   const [loading, setLoading] = React.useState(true);
//   const [error, setError] = React.useState<string | null>(null);

//   const fetchDashboard = React.useCallback(async () => {
//     try {
//       setError(null);
//       const res = await employeeApi.get<ManagerDashboardData>("/managers-dashboard");
//       setDashboard(res.data);
//     } catch (err: any) {
//       setError(err.response?.data?.message || "Could not load your dashboard.");
//     } finally {
//       setLoading(false);
//     }
//   }, []);

//   React.useEffect(() => {
//     fetchDashboard();
//   }, [fetchDashboard]);

//   return (
//     <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
//       <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
//         <Sidebar active="dashboard" />
//         <Header attendanceToday={dashboard?.attendanceToday} loading={loading} onRefresh={fetchDashboard} />

//         {error && (
//           <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
//         )}

//         <TodayAttendance activity={dashboard?.attendance as Record<string, number> | undefined} />

//         <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
//           <div id="team-attendance-section">
//             <TeamAttendanceTable />
//           </div>
//           <div className="space-y-4" id="pending-leave-section">
//             <PendingLeaveRequests requests={dashboard?.pendingLeaves} loading={loading} onReviewed={fetchDashboard} />
//             <AlertsNotifications alerts={dashboard?.alerts} loading={loading} />
//           </div>
//         </div>

//         <QuickActions attendanceToday={dashboard?.attendanceToday} onRefresh={fetchDashboard} />
//       </div>
//     </div>
//   );
// };

// export default ManagerDashboard;

import React from "react";
import Sidebar from "../ManagerDashboard/components/Sidebar";
import Header from "../ManagerDashboard/components/Header";
import TodayAttendance from "./components/TodayAttendance";
import PendingLeaveRequests from "../ManagerDashboard/components/PendingLeaveRequests";
import AlertsNotifications from "../ManagerDashboard/components/AlertNotification";
import TeamAttendanceTable from "./components/TeamAttendancetable";
import QuickActions from "../ManagerDashboard/components/QuickActions";
import employeeApi from "../../lib/employeeApi";
import type { ManagerDashboardData } from "../../types/Employee";

const ManagerDashboard: React.FC = () => {
  const [dashboard, setDashboard] = React.useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDashboard = React.useCallback(async () => {
    try {
      setError(null);
      const res = await employeeApi.get<ManagerDashboardData>("/managers-dashboard");
      setDashboard(res.data);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="dashboard" />
        <Header attendanceToday={dashboard?.attendanceToday} loading={loading} onRefresh={fetchDashboard} />

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</div>
        )}

        <TodayAttendance activity={dashboard?.attendance as Record<string, number> | undefined} />

        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div id="team-attendance-section">
            <TeamAttendanceTable />
          </div>
          <div className="space-y-4" id="pending-leave-section">
            <PendingLeaveRequests requests={dashboard?.pendingLeaves} loading={loading} onReviewed={fetchDashboard} />
            <AlertsNotifications alerts={dashboard?.alerts} loading={loading} />
          </div>
        </div>

        <QuickActions attendanceToday={dashboard?.attendanceToday} onRefresh={fetchDashboard} />
      </div>
    </div>
  );
};

export default ManagerDashboard;