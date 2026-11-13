import React from "react";

type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
};

/**
 * Labelled input shared by the login and signup forms.
 *
 * The label is a real <label htmlFor> rather than a placeholder, so the field
 * stays identifiable once it has a value and screen readers announce it.
 */
const Field: React.FC<FieldProps> = ({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  placeholder,
  hint,
  required,
  minLength,
  maxLength,
}) => (
  <div>
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[#121C2B]">
      {label}
      {hint && <span className="ml-2 font-normal text-[#667385]">{hint}</span>}
    </label>
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      aria-required={required || undefined}
      className="w-full rounded-xl border border-[#DCE2E8] bg-white px-3.5 py-2.5 text-sm text-[#121C2B] outline-none transition placeholder:text-[#9AA5B1] focus:border-[#6A55D6] focus:ring-2 focus:ring-[#6A55D6]/20"
    />
  </div>
);

export default Field;