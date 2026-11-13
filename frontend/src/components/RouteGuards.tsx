import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEmployeeAuth } from "../contexts/EmployeeAuthContext";
import { useAuth } from "../contexts/AuthContext";
import type { EmployeeRole } from "../types/Employee";

/**
 * Shown while the session is still being resolved.
 *
 * `EmployeeAuthProvider` starts with `loading: true` and only clears it after
 * `/me` settles, so rendering the guarded page first would flash a dashboard
 * (or a login redirect) before we know whether there is a session at all.
 */
const Splash: React.FC = () => (
  <div className="grid min-h-screen place-content-center gap-3 bg-[#EDF0F3] text-center">
    <div
      className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#DCE2E8] border-t-[#6A55D6]"
      aria-hidden="true"
    />
    <p role="status" className="text-sm text-[#667385]">
      Loading your workspace…
    </p>
  </div>
);

/** Where an employee belongs, decided by their role. */
const homeFor = (role: EmployeeRole | undefined) => (role === "manager" ? "/manager" : "/employee");

/**
 * Gate for the employee/manager dashboards.
 *
 * Without this, `/manager/*` rendered for anyone: the dashboard fetched data,
 * got a 401 and showed an error, which is a confusing way to discover you are
 * signed out. Redirecting to /login instead preserves `from` so the login page
 * could send them back afterwards.
 */
export const RequireAuth: React.FC = () => {
  const { employee, loading } = useEmployeeAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!employee) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
};

/**
 * Gate that also enforces a role. An employee who deep-links /manager is sent
 * to their own dashboard rather than shown a permission error.
 */
export const RequireRole: React.FC<{ role: EmployeeRole }> = ({ role }) => {
  const { employee, loading } = useEmployeeAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!employee) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (employee.role !== role) return <Navigate to={homeFor(employee.role)} replace />;

  return <Outlet />;
};

/**
 * Keeps /login and /signup away from users who already have a session, so
 * signing in twice from the same browser doesn't silently replace the token.
 */
export const RedirectIfSignedIn: React.FC = () => {
  const { employee, loading } = useEmployeeAuth();

  if (loading) return <Splash />;
  if (employee) return <Navigate to={homeFor(employee.role)} replace />;

  return <Outlet />;
};

/**
 * Gate for the /admin screens, which live in the platform realm.
 *
 * Deliberately separate from RequireAuth: those routes are authorised by the
 * platform token in `token`, not the employee token in `employee_token`, and a
 * platform session carries no employee role. Use `isAuthenticated` rather than
 * `user` — the platform token is the source of truth for "is signed in", and
 * `user` is null until the /me round trip resolves.
 */
export const RequirePlatformAuth: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!isAuthenticated) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  return <Outlet />;
};

/** Keeps /admin/login away from a manager who already has a platform session. */
export const RedirectIfPlatformSignedIn: React.FC = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return <Splash />;
  if (isAuthenticated) return <Navigate to="/admin" replace />;

  return <Outlet />;
};