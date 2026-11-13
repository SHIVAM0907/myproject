import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useEmployeeAuth } from "../../../contexts/EmployeeAuthContext";
import logo from "../../../assets/logo2.png";

type SidebarProps = {
  active?: "dashboard" | "my-tasks" | "apply-leave" | "profile" | "settings";
};

const NAV = [
  { id: "dashboard", label: "Dashboard", to: "/employee" },
  { id: "my-tasks", label: "My Tasks", to: "/employee/my-tasks" },
  { id: "apply-leave", label: "Apply Leave", to: "/employee/apply-leave" },
  { id: "profile", label: "Profile", to: "/employee/profile" },
  { id: "settings", label: "Settings", to: "/employee/settings" },
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