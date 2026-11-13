import React from "react";
import platformApi from "../../../lib/platformApi";
import Modal, { LabeledField, inputClass } from "./Modal";
import type {
  AdminCreateEmployeePayload,
  AdminManagerOption,
  EmployeeRole,
} from "../../../types/Employee";

type AddEmployeeDialogProps = {
  managers: AdminManagerOption[];
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Create an employee, manager or admin outright.
 *
 * Distinct from public signup, which forces role "employee" and creates the
 * account inactive because it is unauthenticated. Here the administrator picks
 * the role and the account is created active, so it can sign in immediately.
 */
const AddEmployeeDialog: React.FC<AddEmployeeDialogProps> = ({ managers, onClose, onSaved }) => {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [role, setRole] = React.useState<EmployeeRole>("employee");
  const [phone, setPhone] = React.useState("");
  const [department, setDepartment] = React.useState("");
  const [designation, setDesignation] = React.useState("");
  // "" means "no manager yet", which is sent as an omitted field rather than an
  // empty string, so the server leaves `manager` alone instead of trying to
  // resolve "" as an id.
  const [manager, setManager] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<string[]>([]);

  // Reports-to only makes sense for a team member, and the server refuses
  // anything that is not role "manager" — so hide the picker for the other roles
  // rather than offering a choice that will be rejected.
  const showsManager = role === "employee";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors([]);

    const payload: AdminCreateEmployeePayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
      role,
      phone: phone.trim(),
      department: department.trim(),
      designation: designation.trim(),
    };
    if (showsManager && manager) payload.manager = manager;

    try {
      await platformApi.post("/admin/employees", payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not create that account.");
      setFieldErrors(err.response?.data?.errors ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add an account"
      description="Creates an employee, manager or administrator that can sign in straight away."
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="First name" htmlFor="newFirstName">
            <input
              id="newFirstName"
              className={inputClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={80}
            />
          </LabeledField>
          <LabeledField label="Last name" htmlFor="newLastName">
            <input
              id="newLastName"
              className={inputClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={80}
            />
          </LabeledField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="Email" htmlFor="newEmail">
            <input
              id="newEmail"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </LabeledField>
          <LabeledField label="Temporary password" htmlFor="newPassword" hint="min 8 characters, a letter and a number">
            <input
              id="newPassword"
              type="text"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="off"
            />
          </LabeledField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <LabeledField label="Role" htmlFor="newRole">
            <select
              id="newRole"
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as EmployeeRole)}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Administrator</option>
            </select>
          </LabeledField>
          <LabeledField label="Phone" htmlFor="newPhone">
            <input
              id="newPhone"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
            />
          </LabeledField>
          <LabeledField label="Department" htmlFor="newDepartment">
            <input
              id="newDepartment"
              className={inputClass}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              maxLength={80}
            />
          </LabeledField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="Designation" htmlFor="newDesignation">
            <input
              id="newDesignation"
              className={inputClass}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              maxLength={80}
            />
          </LabeledField>

          {showsManager && (
            <LabeledField label="Reports to" htmlFor="newManager" hint="optional">
              <select
                id="newManager"
                className={inputClass}
                value={manager}
                onChange={(e) => setManager(e.target.value)}
              >
                <option value="">Not assigned yet</option>
                {managers.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.firstName} {m.lastName}
                    {m.employeeCode ? ` (${m.employeeCode})` : ""}
                  </option>
                ))}
              </select>
            </LabeledField>
          )}
        </div>

        {managers.length === 0 && role === "employee" && (
          <p className="text-xs text-[#667385]">
            No managers exist yet, so this account cannot be filed under one. Create a manager
            first, or assign the reports-to later from the directory.
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600"
          >
            {error}
            {fieldErrors.length > 1 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {fieldErrors.slice(1).map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#DCE2E8] px-4 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[#121C2B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#26364d] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AddEmployeeDialog;