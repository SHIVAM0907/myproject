import React from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Calendar from "./Calendar";
import TodayAttendance from "./components/TodayAttendance";
import ApplyLeave from "./Sections/ApplyForLeave";
import WorkSummary from "./components/WorkSummary";
import AttendanceDetails from "./components/AttendanceDetails";
import RecentActivity from "./components/RecentActivity";
import MeetingSummary from "./components/MeetingSummary";
import employeeApi from "../../lib/employeeApi";
import type { EmployeeDashboardData } from "../../types/Employee";

const EmployeeDashboard: React.FC = () => {
  const [activePage, setActivePage] = React.useState("dashboard");
  const [dashboard, setDashboard] = React.useState<EmployeeDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchDashboard = React.useCallback(async () => {
    try {
      setError(null);
      const res = await employeeApi.get<EmployeeDashboardData>("/dashboard");
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

        <Header
          attendanceToday={dashboard?.attendanceToday}
          loading={loading}
          onRefresh={fetchDashboard}
        />

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        {activePage === "dashboard" && (
          <>
            <TodayAttendance
              attendanceToday={dashboard?.attendanceToday}
              loading={loading}
              onRefresh={fetchDashboard}
              onLeaveRequest={() => setActivePage("applyLeave")}
            />
            <WorkSummary summary={dashboard?.summary} taskSummary={dashboard?.taskSummary} loading={loading} />
            <AttendanceDetails />

            <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <RecentActivity activities={dashboard?.recentActivity} loading={loading} />
              <MeetingSummary meetings={dashboard?.meetings} loading={loading} />
            </div>
          </>
        )}

        {activePage === "calendar" && <Calendar />}
        {activePage === "applyLeave" && <ApplyLeave />}
      </div>
    </div>
  );
};

export default EmployeeDashboard;