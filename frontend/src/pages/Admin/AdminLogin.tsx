import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../../assets/logo2.png";
import Field from "../Auth/Field";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Sign-in for the platform/admin realm.
 *
 * Separate from /login on purpose: it posts to /api/auth/login, which mints a
 * token signed with JWT_PLATFORM_SECRET and accepts only the `admin` role. A
 * team manager is refused here and signs in at /login instead; the employee
 * login cannot reach /api/admin, and this token cannot reach the employee
 * subsystem, so the sessions stay independent.
 */
const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    // AuthContext.login always resolves to a status object rather than
    // throwing, and stores the token in PLATFORM_TOKEN_KEY on success.
    const result = await login({ email, password });

    if (!result.success) {
      setError(result.error || "Could not sign in.");
      setSubmitting(false);
      return;
    }

    const from = (location.state as { from?: string } | null)?.from;
    navigate(from || "/admin", { replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#EDF0F3] px-5 py-10 text-[#121C2B]">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-6 flex items-center justify-center">
          <img src={logo} alt="Work Flow" className="h-10 w-auto object-contain" />
        </Link>

        <div className="rounded-[18px] border border-[#DCE2E8] bg-white p-6 sm:p-7">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#6A55D6]/10 px-3 py-1 text-xs font-medium text-[#6A55D6]">
            Administrator
          </span>
          <h1 className="mt-3 font-['Bricolage_Grotesque',sans-serif] text-2xl font-bold">
            Admin console
          </h1>
          <p className="mt-1.5 text-sm text-[#667385]">
            Manage employees, approve signups and review team data.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            <Field
              id="adminEmail"
              label="Administrator email"
              type="email"
              autoComplete="email"
              placeholder="admin@learnilm.test"
              value={email}
              onChange={setEmail}
              required
            />
            <Field
              id="adminPassword"
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
              {submitting ? "Signing in…" : "Sign in to admin"}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center text-sm text-[#667385]">
          Looking for the employee app?{" "}
          <Link to="/login" className="font-medium text-[#6A55D6] hover:underline">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;