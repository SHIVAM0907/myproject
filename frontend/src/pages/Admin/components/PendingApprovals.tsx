import React from "react";
import platformApi from "../../../lib/platformApi";
import type {
  AdminEmployeeListItem,
  AdminManagerOption,
  EmployeeRole,
} from "../../../types/Employee";

type PendingApprovalsProps = {
  pending: AdminEmployeeListItem[];
  managers: AdminManagerOption[];
  loading: boolean;
  onChanged: () => void;
};

const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

const ROLE_LABEL: Record<EmployeeRole, string> = {
  employee: "Employee",
  manager: "Manager",
  admin: "Administrator",
};

/**
 * The approval queue. Signup creates accounts with `job.status: "inactive"`,
 * which the employee login refuses, so an account stays unusable until someone
 * sets it active here.
 *
 * The role picker and the reports-to picker both sit in the approval row,
 * because approval is when those two decisions are actually made — who this
 * person is, and who they report to. All three values (status, role, manager)
 * go out in one PATCH /job call, so the account never lands half-configured.
 *
 * Reports-to is hidden for manager and admin rows: those roles do not report to
 * anyone, and the server rejects a reports-to that is not a manager anyway.
 */
const PendingApprovals: React.FC<PendingApprovalsProps> = ({
  pending,
  managers,
  loading,
  onChanged,
}) => {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Per-row choices keyed by account id, so several approvals can be staged
  // against different roles and managers before any is submitted.
  const [chosenManager, setChosenManager] = React.useState<Record<string, string>>({});
  const [chosenRole, setChosenRole] = React.useState<Record<string, EmployeeRole>>({});

  const decide = async (id: string, status: "active" | "terminated") => {
    setBusyId(id);
    setError(null);
    try {
      const approving = status === "active";
      const role = chosenRole[id] ?? "employee";
      const managerId = approving && role === "employee" ? chosenManager[id] : "";

      await platformApi.patch(`/admin/employees/${id}/job`, {
        status,
        ...(approving ? { role } : {}),
        // Only sent when one was actually chosen: an empty string would fail
        // the manager validation, and omitting it leaves any existing
        // reports-to untouched.
        ...(managerId ? { manager: managerId } : {}),
      });

      setChosenManager((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setChosenRole((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not update that account.");
    } finally {
      setBusyId(null);
    }
  };

  const roleFor = (id: string): EmployeeRole => chosenRole[id] ?? "employee";

  return (
    <section aria-label="Awaiting approval" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-['Bricolage_Grotesque',sans-serif] text-[17px] font-bold">
          Awaiting approval
        </h2>
        <span className="rounded-full bg-[#E2A100]/10 px-3 py-1 text-xs font-semibold text-[#E2A100]">
          {pending.length} pending
        </span>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-600">
          {error}
        </div>
      )}

      {loading && <p className="py-4 text-sm text-[#667385]">Loading…</p>}

      {!loading && pending.length === 0 && (
        <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">
          Nothing is waiting for approval.
        </p>
      )}

      {!loading && pending.length > 0 && (
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[1.4fr_1.2fr_110px_120px_170px_160px] gap-3 pb-2 text-xs text-[#667385]">
              <span>Name</span>
              <span>Email</span>
              <span>Applied</span>
              <span>Role</span>
              <span>Manager</span>
              <span className="text-right">Decision</span>
            </div>

            {pending.map((person) => {
              const role = roleFor(person._id);
              return (
                <div
                  key={person._id}
                  className="grid grid-cols-[1.4fr_1.2fr_110px_120px_170px_160px] items-center gap-3 border-t border-[#DCE2E8] py-2.5 text-sm"
                >
                  <span className="font-semibold">
                    {person.firstName} {person.lastName}
                    <span className="ml-1.5 text-xs font-normal text-[#667385]">{person.employeeCode}</span>
                    {person.department && (
                      <span className="block text-xs font-normal text-[#667385]">
                        {person.department}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[#667385]">{person.email}</span>
                  <span className="text-[#667385]">{timeOf(person.createdAt)}</span>

                  <span>
                    <select
                      aria-label={`Role for ${person.firstName} ${person.lastName}`}
                      className="w-full rounded-xl border border-[#DCE2E8] bg-white px-2.5 py-1.5 text-xs text-[#121C2B] outline-none focus:border-[#6A55D6]"
                      value={role}
                      onChange={(e) =>
                        setChosenRole((prev) => ({
                          ...prev,
                          [person._id]: e.target.value as EmployeeRole,
                        }))
                      }
                    >
                      <option value="employee">Employee</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </span>

                  <span>
                    {role === "employee" ? (
                      managers.length === 0 ? (
                        <span className="text-xs text-[#667385]">
                          No managers yet — approve without one
                        </span>
                      ) : (
                        <select
                          aria-label={`Manager for ${person.firstName} ${person.lastName}`}
                          className="w-full rounded-xl border border-[#DCE2E8] bg-white px-2.5 py-1.5 text-xs text-[#121C2B] outline-none focus:border-[#6A55D6]"
                          value={chosenManager[person._id] ?? ""}
                          onChange={(e) =>
                            setChosenManager((prev) => ({ ...prev, [person._id]: e.target.value }))
                          }
                        >
                          <option value="">No manager</option>
                          {managers.map((m) => (
                            <option key={m._id} value={m._id}>
                              {m.firstName} {m.lastName}
                              {m.employeeCode ? ` (${m.employeeCode})` : ""}
                            </option>
                          ))}
                        </select>
                      )
                    ) : (
                      <span className="text-xs text-[#667385]">
                        {ROLE_LABEL[role]}s do not report to anyone
                      </span>
                    )}
                  </span>

                  <span className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={busyId === person._id}
                      onClick={() => decide(person._id, "active")}
                      className="rounded-full bg-[#0E9F8B] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b8577] disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === person._id}
                      onClick={() => decide(person._id, "terminated")}
                      className="rounded-full bg-[#F4F6F8] px-3 py-1.5 text-xs font-semibold text-[#E4484D] transition hover:bg-[#eceff3] disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default PendingApprovals;