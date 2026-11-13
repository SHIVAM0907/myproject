import React from "react";
import { Link } from "react-router-dom";
import AuthShell from "./AuthShell";
import Field from "./Field";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/** Matches the `password` rules on POST /api/auth/register. */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

type SignUpValues = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  department: string;
  designation: string;
};

const EMPTY: SignUpValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phone: "",
  department: "",
  designation: "",
};

/**
 * Public registration.
 *
 * Accounts are created inactive on purpose: POST /api/auth/register returns
 * `pendingApproval: true` and issues no token, so this page shows a
 * confirmation state instead of signing the user straight in. Administrators
 * approve with `npm run employees -- list|approve`, after which the same
 * credentials work on /login.
 */
const SignUp: React.FC = () => {
  const [values, setValues] = React.useState<SignUpValues>(EMPTY);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [created, setCreated] = React.useState<{ email: string; employeeCode: string } | null>(null);

  const set = (key: keyof SignUpValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server so the user gets the rule
    // immediately rather than after a round trip.
    if (!PASSWORD_RULE.test(values.password)) {
      setError("Password must be at least 8 characters and contain both a letter and a number.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data?.message || "Could not create your account.");
        return;
      }

      setCreated({ email: data.email, employeeCode: data.employee?.employeeCode ?? "" });
      setValues(EMPTY);
    } catch {
      setError("Could not reach the server. Check that the API is running.");
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <AuthShell
        title="Account created"
        subtitle="Your details are with an administrator for review."
        footer={
          <Link to="/login" className="font-medium text-[#6A55D6] hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-xl border border-[#DCE2E8] bg-[#EDF0F3] p-4">
          <p className="text-sm text-[#121C2B]">
            We created an account for{" "}
            <span className="font-medium">{created.email}</span>
            {created.employeeCode && (
              <>
                {" "}
                <span className="text-[#667385]">({created.employeeCode})</span>
              </>
            )}
            .
          </p>
          <p className="mt-2 text-sm text-[#667385]">
            Sign-in unlocks once an administrator approves it. You can sign in with these credentials
            straight after that — no need to register again.
          </p>
        </div>

        <Link
          to="/login"
          className="mt-5 block w-full rounded-xl bg-[#121C2B] px-4 py-2.5 text-center text-sm font-medium text-white transition hover:bg-[#26364d]"
        >
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join your team's workspace in a couple of minutes."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-medium text-[#6A55D6] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="firstName"
            label="First name"
            autoComplete="given-name"
            value={values.firstName}
            onChange={set("firstName")}
            required
          />
          <Field
            id="lastName"
            label="Last name"
            autoComplete="family-name"
            value={values.lastName}
            onChange={set("lastName")}
            required
          />
        </div>

        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder="you@workflow.com"
          value={values.email}
          onChange={set("email")}
          required
        />

        <Field
          id="password"
          label="Password"
          hint="8+ chars, a letter and a number"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={values.password}
          onChange={set("password")}
          required
          minLength={8}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="department"
            label="Department"
            hint="optional"
            autoComplete="organization-title"
            placeholder="Engineering"
            value={values.department}
            onChange={set("department")}
          />
          <Field
            id="designation"
            label="Designation"
            hint="optional"
            placeholder="Product Designer"
            value={values.designation}
            onChange={set("designation")}
          />
        </div>

        <Field
          id="phone"
          label="Phone"
          hint="optional"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          value={values.phone}
          onChange={set("phone")}
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
};

export default SignUp;