import React from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
// import DateAndAssignedTask from "../components/DateAndAssignedTasks";
import TaskDetails from "../components/TasksDetails";
import TodaysWorkSummary from "../components/TodaysWorkSummary";
import EmployeeQuery from "../components/EmployeeQuery";
import AllQueries from "../components/AllQueries";
import employeeApi from "../../../lib/employeeApi";
import type { EmployeeDashboardData } from "../../../types/Employee";

const MyTasks: React.FC = () => {
  const [summary, setSummary] = React.useState<EmployeeDashboardData["todayWorkSummary"] | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Returns a Promise so callers can await it / chain .finally().
  const fetchSummary = React.useCallback(async () => {
    try {
      const res = await employeeApi.get<EmployeeDashboardData>("/dashboard");
      setSummary(res?.data?.todayWorkSummary ?? null);
    } catch (e) {
      setSummary(null);
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetchSummary().finally(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [fetchSummary]);

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="my-tasks" />
        <Header />

        {/* <DateAndAssignedTask /> */}
        <TaskDetails onStatusChanged={fetchSummary} />
        {!loading && (
          <div className="mt-4">
            <TodaysWorkSummary summary={summary ?? undefined} />
          </div>
        )}
        <div className="mt-4">
          <EmployeeQuery />
        </div>
        <div className="mt-4">
          <AllQueries />
        </div>
      </div>
    </div>
  );
};

export default MyTasks;