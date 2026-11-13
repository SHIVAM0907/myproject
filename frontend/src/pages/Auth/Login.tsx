import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import Field from "./Field";
import { useEmployeeAuth } from "../../contexts/EmployeeAuthContext";
import { clearEmployeeSession, employeeApi, setEmployeeSession } from "../../lib/employeeApi";

/**
 * The single sign-in page for both realms of the employee subsystem.
 *
 * POST /api/employee/login returns `{ token, isManager, employee }`; the role
 * decides where we land, so managers go to /manager and everyone else to
 * /employee. Only the employee realm is offered here — the platform/admin
 * realm stays behind /api/auth/login for the admin screens.
 */
const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshEmployee } = useEmployeeAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const { data } = await employeeApi.post("/login", { email, password });
      const token = data?.token as string | undefined;
      if (!token) {
        setError(data?.message || "Could not sign in.");
        return;
      }

      // `setEmployeeSession` deliberately keeps an existing non-manager token
      // instead of overwriting it, so without clearing first a stale or expired
      // token in localStorage would make a fresh, correct password look like it
      // did nothing — the dashboard would silently reload the old session.
      clearEmployeeSession();
      setEmployeeSession(token, Boolean(data.isManager));

      // Populates EmployeeAuthContext so the dashboards render immediately
      // rather than flashing a signed-out state on first paint.
      await refreshEmployee();

      // `RequireAuth` records where the visitor was headed before bouncing them
      // here, so a deep link survives the detour. Falls back to the role's own
      // dashboard when there was no guarded page behind it.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from || (data.isManager ? "/manager" : "/employee"), { replace: true });
    } catch (err: any) {
      // The backend distinguishes a wrong password (401) from an account that
      // is still awaiting administrator approval (403); both read `message`.
      setError(err.response?.data?.message || "Could not sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Work Flow workspace."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-medium text-[#6A55D6] hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@workflow.com"
          value={email}
          onChange={setEmail}
          required
        />

        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
          required
        />

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[#121C2B] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#26364d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-[#667385]">
        Accounts created through signup are reviewed by an administrator before they can sign in.
      </p>
    </AuthShell>
  );
};

export default Login;