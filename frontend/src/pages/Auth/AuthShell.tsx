import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/logo2.png";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
};

/**
 * Shared frame for the login and signup screens, so the two stay visually
 * identical apart from their form.
 */
const AuthShell: React.FC<AuthShellProps> = ({ title, subtitle, children, footer }) => (
  <div className="grid min-h-screen place-items-center bg-[#EDF0F3] px-5 py-10 text-[#121C2B]">
    <div className="w-full max-w-[420px]">
      <Link to="/" className="mb-6 flex items-center justify-center">
        <img src={logo} alt="Work Flow" className="h-10 w-auto object-contain" />
      </Link>

      <div className="rounded-[18px] border border-[#DCE2E8] bg-white p-6 sm:p-7">
        <h1 className="font-['Bricolage_Grotesque',sans-serif] text-2xl font-bold">{title}</h1>
        <p className="mt-1.5 text-sm text-[#667385]">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>

      <div className="mt-5 text-center text-sm text-[#667385]">{footer}</div>
    </div>
  </div>
);

export default AuthShell;