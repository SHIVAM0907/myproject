// Password form controls shared by the student, employee and manager settings
// screens. They live here (rather than beside the student dashboard) because all
// three dashboards reuse the identical markup.
//
// PasswordInputField calls onChange with the raw string, not a change event, so
// it can be handed a bare setState from useState directly.

import React from "react";
import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";

type PasswordInputFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
};

export const PasswordInputField: React.FC<PasswordInputFieldProps> = ({
  label,
  placeholder,
  value,
  onChange,
}) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[#10284A]">{label}</span>

      <span className="relative block">
        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 pr-11 text-sm text-[#10284A] outline-none transition placeholder:text-gray-400 focus:border-[#2459A6] focus:ring-2 focus:ring-[#2459A6]/15"
        />

        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 transition hover:text-[#2459A6]"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </label>
  );
};

type PasswordRequirementsChecklistProps = {
  password: string;
};

// Mirrors the PASSWORD_REGEX the settings screens validate against before they
// enable the submit button, so the checklist and the button can never disagree.
export const PasswordRequirementsChecklist: React.FC<PasswordRequirementsChecklistProps> = ({
  password,
}) => {
  const rules = [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "A lowercase letter", met: /[a-z]/.test(password) },
    { label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { label: "A number", met: /\d/.test(password) },
    { label: "A special character", met: /[!@#$%^&*]/.test(password) },
  ];

  const met = rules.filter((r) => r.met).length;

  return (
    <div className="w-full rounded-2xl border border-gray-100 bg-[#F8FAFC] p-4">
      <p className="mb-3 text-xs font-semibold text-[#10284A]">Password requirements</p>

      <ul className="m-0 list-none space-y-2 p-0">
        {rules.map((rule) => (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            <span
              className={`grid h-4 w-4 shrink-0 place-content-center rounded-full ${
                rule.met ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-400"
              }`}
            >
              {rule.met ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
            </span>

            <span className={rule.met ? "text-[#10284A]" : "text-gray-500"}>{rule.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all ${
            met === rules.length ? "bg-green-500" : "bg-[#2459A6]"
          }`}
          style={{ width: `${(met / rules.length) * 100}%` }}
        />
      </div>
    </div>
  );
};

type UpdatePasswordButtonProps = {
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
};

export const UpdatePasswordButton: React.FC<UpdatePasswordButtonProps> = ({
  onClick,
  disabled,
  loading,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || loading}
    className="inline-flex items-center gap-2 rounded-xl bg-[#2459A6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4a8a] disabled:cursor-not-allowed disabled:opacity-60"
  >
    {loading && <Loader2 size={16} className="animate-spin" />}
    {loading ? "Updating…" : "Update Password"}
  </button>
);