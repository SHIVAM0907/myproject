import React from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../../../assets/logo2.png";
import { useAuth } from "../../../contexts/AuthContext";

type AdminHeaderProps = {
  onRefresh: () => void;
  refreshing: boolean;
};

const AdminHeader: React.FC<AdminHeaderProps> = ({ onRefresh, refreshing }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim();

  const handleLogout = () => {
    // Signs out of the platform realm only; an employee session in another tab
    // is untouched.
    logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-4">
      <Link to="/" className="flex items-center">
        <img src={logo} alt="Work Flow" className="h-8 w-auto object-contain" />
      </Link>

      <nav aria-label="Main" className="flex items-center gap-1 rounded-full border border-[#DCE2E8] bg-white p-1">
        <span className="rounded-full bg-[#121C2B] px-4 py-1.5 text-sm font-medium text-white">
          Admin console
        </span>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {name && <span className="text-sm text-[#667385]">{name}</span>}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-full border border-[#DCE2E8] bg-white px-4 py-1.5 text-sm font-medium transition hover:border-[#121C2B] disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-[#E4484D] transition hover:bg-white"
        >
          Log out
        </button>
      </div>
    </div>
  );
};

export default AdminHeader;