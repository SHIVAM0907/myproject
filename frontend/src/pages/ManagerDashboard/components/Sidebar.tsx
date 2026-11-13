
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useEmployeeAuth } from "../../../contexts/EmployeeAuthContext";
import logo from "../../../assets/logo2.png";

type SidebarProps = {
  active?: "dashboard" | "team-attendance" | "assigned-tasks" | "my-calendar" | "reports" | "team-members" | "query" | "profile" | "settings";
};

const NAV = [
  { id: "dashboard", label: "Today", to: "/manager" },
  { id: "assigned-tasks", label: "Tasks", to: "/manager/assigned-tasks" },
  { id: "team-members", label: "Team", to: "/manager/team-members" },
  { id: "reports", label: "Reports", to: "/manager/reports" },
  { id: "query", label: "Queries", to: "/manager/queries" },
  { id: "profile", label: "Profile", to: "/manager/profile" },
  { id: "settings", label: "Settings", to: "/manager/settings" },
] as const;

const Sidebar: React.FC<SidebarProps> = ({ active = "dashboard" }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { logout: employeeLogout } = useEmployeeAuth();

  const handleLogout = () => {
    employeeLogout();
    logout();
    navigate("/");
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-4">
      <Link to="/" className="flex items-center">
        <img src={logo} alt="Work Flow" className="h-8 w-auto object-contain" />
      </Link>

      <nav aria-label="Main" className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-[#DCE2E8] bg-white p-1">
        {NAV.map((item) => (
          <Link
            key={item.id}
            to={item.to}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
              item.id === active ? "bg-[#121C2B] text-white" : "text-[#667385] hover:text-[#121C2B]"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={handleLogout}
        className="ml-auto rounded-full px-4 py-1.5 text-sm font-medium text-[#E4484D] transition hover:bg-white"
      >
        Log out
      </button>
    </div>
  );
};

export default Sidebar;