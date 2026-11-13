import React from "react";
import platformApi from "../../../lib/platformApi";
import Modal, { LabeledField, inputClass } from "./Modal";
import type {
  AdminEditEmployeePayload,
  AdminEmployeeListItem,
  AdminManagerOption,
} from "../../../types/Employee";

type EditEmployeeDialogProps = {
  person: AdminEmployeeListItem;
  managers: AdminManagerOption[];
  onClose: () => void;
  onSaved: () => void;
};

const managerIdOf = (person: AdminEmployeeListItem): string =>
  person.manager && typeof person.manager === "object" ? person.manager._id : "";

/**
 * Edit the descriptive fields of one account.
 *
 * Only the fields PATCH /admin/employees/:id owns are editable here. Role and
 * job status deliberately stay out: they live on /job alongside the
 * self-demotion guard, so this form cannot be used to quietly promote someone
 * or strip an administrator of their own access.
 */
const EditEmployeeDialog: React.FC<EditEmployeeDialogProps> = ({
  person,
  managers,
  onClose,
  onSaved,
}) => {
  const [firstName, setFirstName] = React.useState(person.firstName ?? "");
  const [lastName, setLastName] = React.useState(person.lastName ?? "");
  const [email, setEmail] = React.useState(person.email ?? "");
  const [phone, setPhone] = React.useState(person.phone ?? "");
  const [department, setDepartment] = React.useState(person.department ?? "");
  const [designation, setDesignation] = React.useState(person.designation ?? "");
  const [bio, setBio] = React.useState(person.profile?.bio ?? "");
  const [manager, setManager] = React.useState(managerIdOf(person));

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<string[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors([]);

    const payload: AdminEditEmployeePayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      department: department.trim(),
      designation: designation.trim(),
      bio: bio.trim(),
      // Always sent: `null` clears the reports-to, and omitting it would keep
      // whatever the account already had, which is indistinguishable from the
      // user picking "Not assigned" here.
      manager: manager || null,
    };

    try {
      await platformApi.patch(`/admin/employees/${person._id}`, payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not save those changes.");
      setFieldErrors(err.response?.data?.errors ?? []);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit ${person.firstName} ${person.lastName}`}
      description={`${person.employeeCode ?? ""} · currently ${person.role}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="First name" htmlFor="editFirstName">
            <input
              id="editFirstName"
              className={inputClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              maxLength={80}
            />
          </LabeledField>
          <LabeledField label="Last name" htmlFor="editLastName">
            <input
              id="editLastName"
              className={inputClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              maxLength={80}
            />
          </LabeledField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="Email" htmlFor="editEmail">
            <input
              id="editEmail"
              type="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </LabeledField>
          <LabeledField label="Phone" htmlFor="editPhone">
            <input
              id="editPhone"
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={32}
            />
          </LabeledField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledField label="Department" htmlFor="editDepartment">
            <input
              id="editDepartment"
              className={inputClass}
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              maxLength={80}
            />
          </LabeledField>
          <LabeledField label="Designation" htmlFor="editDesignation">
            <input
              id="editDesignation"
              className={inputClass}
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              maxLength={80}
            />
          </LabeledField>
        </div>

        <LabeledField label="Reports to" htmlFor="editManager" hint="who manages this account">
          <select
            id="editManager"
            className={inputClass}
            value={manager}
            onChange={(e) => setManager(e.target.value)}
          >
            <option value="">Not assigned</option>
            {managers.map((m) => (
              <option key={m._id} value={m._id}>
                {m.firstName} {m.lastName}
                {m.employeeCode ? ` (${m.employeeCode})` : ""}
              </option>
            ))}
          </select>
        </LabeledField>

        {managers.length === 0 && (
          <p className="text-xs text-[#667385]">
            No managers exist yet. Reports-to can only be someone with the manager role.
          </p>
        )}

        <LabeledField label="Bio" htmlFor="editBio">
          <textarea
            id="editBio"
            rows={3}
            className={inputClass}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={1000}
          />
        </LabeledField>

        <p className="text-xs text-[#667385]">
          Role and account status are changed from the directory and the approval queue, not here.
        </p>

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
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditEmployeeDialog;