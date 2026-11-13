import React from "react";
import type { AdminEmployeeListItem } from "../../../types/Employee";

type DirectoryProps = {
  employees: AdminEmployeeListItem[];
  total: number;
  page: number;
  totalPages: number;
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  role: string;
  onRoleChange: (value: string) => void;
  onPage: (page: number) => void;
  onAdd: () => void;
  onEdit: (person: AdminEmployeeListItem) => void;
  onDelete: (person: AdminEmployeeListItem) => void;
  /** Id of the account currently being deleted, so its row can show progress. */
  deletingId?: string | null;
};

const FIELD = "mt-1 w-full rounded-xl border border-[#DCE2E8] bg-white px-3 py-2 text-sm text-[#121C2B] outline-none focus:border-[#6A55D6]";

const STATUS_COLOR: Record<string, string> = {
  active: "#0E9F8B",
  on_leave: "#E2A100",
  inactive: "#667385",
  terminated: "#E4484D",
};

const managerName = (person: AdminEmployeeListItem) => {
  const manager = person.manager;
  if (!manager || typeof manager !== "object") return "—";
  return `${manager.firstName ?? ""} ${manager.lastName ?? ""}`.trim() || "—";
};

const EmployeeDirectory: React.FC<DirectoryProps> = ({
  employees,
  total,
  page,
  totalPages,
  loading,
  query,
  onQueryChange,
  status,
  onStatusChange,
  role,
  onRoleChange,
  onPage,
  onAdd,
  onEdit,
  onDelete,
  deletingId,
}) => (
  <section aria-label="Employee directory" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="mr-auto font-['Bricolage_Grotesque',sans-serif] text-[17px] font-bold">
        Employee directory
      </h2>
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search name, email or code…"
        aria-label="Search employees"
        className={`${FIELD} max-w-[220px]`}
      />
      <select
        aria-label="Status filter"
        className={`${FIELD} w-auto`}
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="on_leave">On leave</option>
        <option value="inactive">Inactive</option>
        <option value="terminated">Terminated</option>
      </select>
      <select
        aria-label="Role filter"
        className={`${FIELD} w-auto`}
        value={role}
        onChange={(e) => onRoleChange(e.target.value)}
      >
        <option value="">All roles</option>
        <option value="employee">Employees</option>
        <option value="manager">Managers</option>
        <option value="admin">Administrators</option>
      </select>
      <button
        type="button"
        onClick={onAdd}
        className="rounded-xl bg-[#6A55D6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5a47bd]"
      >
        Add account
      </button>
    </div>

    <div className="overflow-x-auto">
      <div className="min-w-[940px]">
        <div className="grid grid-cols-[1.3fr_1.4fr_1fr_1fr_90px_110px_150px] gap-3 pb-2 text-xs text-[#667385]">
          <span>Name</span>
          <span>Email</span>
          <span>Department</span>
          <span>Reports to</span>
          <span>Role</span>
          <span>Status</span>
          <span className="text-right">Actions</span>
        </div>

        {loading && <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">Loading…</p>}

        {!loading && employees.length === 0 && (
          <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">
            No employees match these filters.
          </p>
        )}

        {employees.map((person) => (
          <div
            key={person._id}
            className="grid grid-cols-[1.3fr_1.4fr_1fr_1fr_90px_110px_150px] items-center gap-3 border-t border-[#DCE2E8] py-2.5 text-sm"
          >
            <span className="font-semibold">
              {person.firstName} {person.lastName}
              <span className="ml-1.5 text-xs font-normal text-[#667385]">{person.employeeCode}</span>
            </span>
            <span className="truncate text-[#667385]">{person.email}</span>
            <span className="truncate text-[#667385]">{person.department || "—"}</span>
            <span className="truncate text-[#667385]">{managerName(person)}</span>
            <span className="text-xs text-[#667385]">{person.role}</span>
            <span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{
                  color: STATUS_COLOR[person.job?.status ?? ""] ?? "#667385",
                  background: "#F4F6F8",
                }}
              >
                {(person.job?.status ?? "unknown").replace("_", " ")}
              </span>
            </span>
            <span className="flex justify-end gap-1.5">
              <button
                type="button"
                disabled={deletingId === person._id}
                onClick={() => onEdit(person)}
                aria-label={`Edit ${person.firstName} ${person.lastName}`}
                className="rounded-full border border-[#DCE2E8] px-3 py-1 text-xs font-semibold transition hover:bg-[#F4F6F8] disabled:opacity-40"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={deletingId === person._id}
                onClick={() => onDelete(person)}
                aria-label={`Delete ${person.firstName} ${person.lastName}`}
                title={`Delete ${person.firstName} ${person.lastName}`}
                className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:bg-rose-50 disabled:opacity-40"
              >
                {deletingId === person._id ? "Deleting…" : "Delete"}
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#667385]">
      <span className="mr-auto">
        Showing {employees.length} of {total} employee{total === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        disabled={page <= 1 || loading}
        onClick={() => onPage(page - 1)}
        className="rounded-full border border-[#DCE2E8] px-3 py-1 font-semibold disabled:opacity-40"
      >
        Previous
      </button>
      <span>
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages || loading}
        onClick={() => onPage(page + 1)}
        className="rounded-full border border-[#DCE2E8] px-3 py-1 font-semibold disabled:opacity-40"
      >
        Next
      </button>
    </div>
  </section>
);

export default EmployeeDirectory;