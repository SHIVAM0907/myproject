// Route table. The paths match the Sidebar `to` targets and the navigate()
// calls in QuickActions, so the nav and the router stay in sync.

import React from "react";
import { Route, Routes } from "react-router-dom";

import {
  RedirectIfPlatformSignedIn,
  RedirectIfSignedIn,
  RequireAuth,
  RequirePlatformAuth,
  RequireRole,
} from "./components/RouteGuards";

import Home from "./pages/Landing/Home";
import Login from "./pages/Auth/Login";
import SignUp from "./pages/Auth/SignUp";

import AdminLogin from "./pages/Admin/AdminLogin";
import AdminDashboard from "./pages/Admin/AdminDashboard";

import EmployeeDashboard from "./pages/EmployeeDashboard/EmployeeDashboard";
import MyTasks from "./pages/EmployeeDashboard/Sections/MyTasks";
import ApplyForLeave from "./pages/EmployeeDashboard/Sections/ApplyForLeave";
import EmployeeProfile from "./pages/EmployeeDashboard/Sections/EmployeeProfile";
import EmployeePasswordSetting from "./pages/EmployeeDashboard/Sections/EmployeePasswordSetting";

import ManagerDashboard from "./pages/ManagerDashboard/ManagerDashboard";
import AssignedTasks from "./pages/ManagerDashboard/sections/AssignedTasks";
import MyTeamMembers from "./pages/ManagerDashboard/sections/My-employee";
import ManagerReports from "./pages/ManagerDashboard/sections/ManagerReports";
import ManagerQueries from "./pages/ManagerDashboard/sections/Managerqueries";
import ManagerProfile from "./pages/ManagerDashboard/sections/ManagerProfile";
import ManagerPasswordSettings from "./pages/ManagerDashboard/sections/ManagerPasswordSettings";

const NotFound: React.FC = () => (
  <div className="grid min-h-screen place-content-center text-center">
    <h1 className="font-['Bricolage_Grotesque',sans-serif] text-4xl font-bold">404</h1>
    <p className="mt-2 text-[#667385]">That page does not exist.</p>
  </div>
);

const App: React.FC = () => (
  <Routes>
    {/* Public. `/` was previously a redirect to /employee, which sent
        signed-out visitors to a dashboard that immediately failed to load. */}
    <Route path="/" element={<Home />} />

    {/* Platform realm. A separate guard chain because /admin is authorised by
        the platform token, not the employee token. */}
    <Route element={<RedirectIfPlatformSignedIn />}>
      <Route path="/admin/login" element={<AdminLogin />} />
    </Route>
    <Route element={<RequirePlatformAuth />}>
      <Route path="/admin" element={<AdminDashboard />} />
    </Route>

    {/* `RedirectIfSignedIn` keeps these away from users who already have a
        session, so signing in twice can't silently replace a live token. */}
    <Route element={<RedirectIfSignedIn />}>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
    </Route>

    {/* One session check gates every dashboard; managers are additionally
        checked for their role and bounced to their own dashboard otherwise. */}
    <Route element={<RequireAuth />}>
      <Route path="/employee" element={<EmployeeDashboard />} />
      <Route path="/employee/my-tasks" element={<MyTasks />} />
      <Route path="/employee/apply-leave" element={<ApplyForLeave />} />
      <Route path="/employee/profile" element={<EmployeeProfile />} />
      <Route path="/employee/settings" element={<EmployeePasswordSetting />} />
    </Route>

    <Route element={<RequireRole role="manager" />}>
      <Route path="/manager" element={<ManagerDashboard />} />
      <Route path="/manager/assigned-tasks" element={<AssignedTasks />} />
      <Route path="/manager/team-members" element={<MyTeamMembers />} />
      <Route path="/manager/reports" element={<ManagerReports />} />
      <Route path="/manager/queries" element={<ManagerQueries />} />
      <Route path="/manager/profile" element={<ManagerProfile />} />
      <Route path="/manager/settings" element={<ManagerPasswordSettings />} />
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;