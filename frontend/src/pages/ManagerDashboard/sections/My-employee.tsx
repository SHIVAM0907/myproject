import React from "react";
import { Search, UserPlus, UserMinus, X, Check, Loader2, Users } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import employeeApi from "../../../lib/employeeApi";
import type { AvailableEmployee } from "../../../types/Employee";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";
const FIELD = "w-full rounded-xl border border-[#DCE2E8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6A55D6]";
const ALERT = "rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600";

const initialsOf = (first?: string, last?: string) =>
  `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";

const fullName = (e: { firstName?: string; lastName?: string }) =>
  `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function describeErrors(err: any, fallback: string) {
  const data = err?.response?.data;
  const details = Array.isArray(data?.errors) ? data.errors.filter(Boolean) : [];
  if (details.length) return details.join(' ');
  return data?.message || fallback;
}

type EmployeeRow = {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
  job?: { joinDate?: string };
};

type EmployeeDetail = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  employeeCode?: string;
  manager?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  job?: { joinDate?: string; status?: string; isActive?: boolean };
  personal?: { gender?: string; address?: string };
  profile?: { bio?: string };
};

const EmployeeTable: React.FC = () => {
  const [search, setSearch] = React.useState("");
  const [employees, setEmployees] = React.useState<EmployeeRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showPicker, setShowPicker] = React.useState(false);
  // The id being opened, kept separately from selectedEmployee so the dialog can
  // appear (and show its spinner) while the request is still in flight.
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = React.useState<EmployeeDetail | null>(null);
  const [detailsLoading, setDetailsLoading] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [available, setAvailable] = React.useState<AvailableEmployee[]>([]);
  const [availableLoading, setAvailableLoading] = React.useState(false);
  const [availableError, setAvailableError] = React.useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState("");
  const [addingId, setAddingId] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const fetchEmployees = React.useCallback(async () => {
    try {
      const res = await employeeApi.get<{ members: EmployeeRow[] }>('/team');
      setEmployees(res.data.members ?? []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Could not load team members.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const fetchAvailable = React.useCallback(async () => {
    setAvailableLoading(true);
    setAvailableError(null);
    try {
      const res = await employeeApi.get<{ employees: AvailableEmployee[] }>('/team/available');
      setAvailable(res.data.employees ?? []);
    } catch (err: any) {
      setAvailable([]);
      setAvailableError(err.response?.data?.message || 'Could not load employees.');
    } finally {
      setAvailableLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!showPicker) return;
    setPickerSearch('');
    fetchAvailable();
  }, [showPicker, fetchAvailable]);

  const handleAddMember = async (employee: AvailableEmployee) => {
    setAddingId(employee._id);
    setSuccess(null);
    setError(null);

    try {
      await employeeApi.post('/team/assign', { employeeId: employee._id });
      setSuccess(`${fullName(employee)} was added to your team.`);
      await fetchEmployees();
      await fetchAvailable();
    } catch (err: any) {
      setError(describeErrors(err, 'Could not add employee to your team.'));
      await fetchAvailable();
    } finally {
      setAddingId(null);
    }
  };

  const handleRemoveMember = async (employee: EmployeeRow) => {
    setRemovingId(employee._id);
    setSuccess(null);
    setError(null);
    setConfirmingId(null);

    try {
      await employeeApi.delete(`/team/assign/${employee._id}`);
      setSuccess(`${fullName(employee)} was removed from your team.`);
      await fetchEmployees();
      if (showPicker) await fetchAvailable();
    } catch (err: any) {
      setError(describeErrors(err, 'Could not remove employee from your team.'));
    } finally {
      setRemovingId(null);
    }
  };

  const filteredAvailable = available.filter((emp) => {
    const text = `${fullName(emp)} ${emp.department ?? ''} ${emp.designation ?? ''} ${emp.employeeCode ?? ''} ${emp.role === 'manager' ? 'manager' : ''}`.toLowerCase();
    return text.includes(pickerSearch.toLowerCase());
  });

  const handleViewMore = async (employeeId: string) => {
    setViewingId(employeeId);
    setSelectedEmployee(null);
    setDetailsLoading(true);
    setDetailsError(null);

    try {
      const response = await employeeApi.get<{ member: EmployeeDetail }>(`/team/member/${employeeId}`);
      setSelectedEmployee(response.data.member ?? null);
    } catch (err: any) {
      setDetailsError(err.response?.data?.message || 'Could not load employee details.');
      setSelectedEmployee(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setViewingId(null);
    setSelectedEmployee(null);
    setDetailsError(null);
  };

  const filteredEmployees = employees.filter((emp) => {
    const text = `${fullName(emp)} ${emp.department ?? ""} ${emp.employeeCode ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const departments = new Set(employees.map((emp) => emp.department).filter(Boolean)).size;
  const summary = [
    { label: "On your team", value: employees.length, color: "#121C2B" },
    { label: "Departments", value: departments, color: "#6A55D6" },
    { label: "Open roles", value: available.filter((e) => !e.inTeam).length, color: "#0E9F8B" },
  ];

  const detailFields: Array<{ label: string; value: string }> = selectedEmployee
    ? [
        { label: "Employee code", value: selectedEmployee.employeeCode ?? "-" },
        { label: "Department", value: selectedEmployee.department ?? "-" },
        { label: "Designation", value: selectedEmployee.designation ?? "-" },
        { label: "Status", value: selectedEmployee.job?.status ?? "-" },
        { label: "Join date", value: formatDate(selectedEmployee.job?.joinDate) },
        { label: "Gender", value: selectedEmployee.personal?.gender ?? "-" },
        { label: "Email", value: selectedEmployee.email ?? "-" },
        { label: "Phone", value: selectedEmployee.phone ?? "-" },
        { label: "Manager", value: selectedEmployee.manager ? fullName(selectedEmployee.manager) : "-" },
        { label: "Address", value: selectedEmployee.personal?.address ?? "-" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="team-members" />
        <Header />

        {/* Summary strip */}
        <section aria-label="Team summary" className="rounded-[22px] border border-[#DCE2E8] bg-white p-6 sm:px-8">
          <div className="flex items-start gap-3">
            <Users size={22} className="mt-1 shrink-0 text-[#6A55D6]" />
            <h1 className={`${DISPLAY} text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight`}>
              {employees.length === 1 ? "1 person reports to you." : `${employees.length} people report to you.`}
            </h1>
          </div>

          <p className="mb-4 mt-2 text-[#667385]">
            {loading ? "Loading your team…" : departments === 0 ? "No departments to show yet." : `Spread across ${departments} ${departments === 1 ? "department" : "departments"}.`}
          </p>

          <div className="flex flex-wrap gap-2">
            {summary.map((c) => (
              <div key={c.label} className="flex items-center gap-2 rounded-xl bg-[#F4F6F8] px-3 py-2">
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                <b className={`${DISPLAY} text-xl`}>{c.value}</b>
                <span className="text-[13px] text-[#667385]">{c.label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Team list + search */}
        <section aria-label="Team members" className={`${CARD} mt-4`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className={`${DISPLAY} mr-auto text-[17px] font-bold`}>Your team</h3>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              aria-label="Search team members"
              className={`${FIELD} max-w-[220px] py-1.5`}
            />

            <button
              type="button"
              onClick={() => setShowPicker((current) => !current)}
              className="flex items-center gap-2 rounded-full bg-[#6A55D6] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#5a47bd]"
            >
              <UserPlus size={15} />
              {showPicker ? "Close" : "Add employee"}
            </button>
          </div>

          {error && <p className={`${ALERT} mb-3`}>{error}</p>}
          {success && !showPicker && (
            <p className="mb-3 rounded-lg bg-[#F4F6F8] px-3 py-2 text-xs font-medium text-[#0E9F8B]">{success}</p>
          )}

          {showPicker && (
            <div className="mb-4 rounded-[14px] border border-[#DCE2E8] bg-[#F8FAFC] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className={`${DISPLAY} text-[15px] font-bold`}>All employees &amp; managers</h4>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  aria-label="Close employee picker"
                  className="rounded-full p-1 text-[#667385] transition hover:bg-white hover:text-[#121C2B]"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="relative mb-3">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA5B4]" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search by name, code, department or role…"
                  aria-label="Search all employees"
                  className={`${FIELD} pl-9`}
                />
              </div>

              {availableError && <p className={`${ALERT} mb-3`}>{availableError}</p>}
              {success && <p className="mb-3 text-xs font-medium text-[#0E9F8B]">{success}</p>}

              <div className="max-h-72 overflow-y-auto rounded-xl border border-[#DCE2E8] bg-white">
                {availableLoading ? (
                  <p className="flex items-center gap-2 px-4 py-6 text-sm text-[#667385]">
                    <Loader2 size={15} className="animate-spin" />
                    Loading employees…
                  </p>
                ) : filteredAvailable.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-[#667385]">No employees match your search.</p>
                ) : (
                  filteredAvailable.map((emp) => {
                    const adding = addingId === emp._id;

                    return (
                      <div key={emp._id} className="flex items-center justify-between gap-3 border-b border-[#DCE2E8] px-4 py-2.5 last:border-b-0">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F8] text-[11px] font-semibold text-[#6A55D6]">
                            {initialsOf(emp.firstName, emp.lastName)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <b className="truncate text-sm">{fullName(emp)}</b>
                              {emp.role === 'manager' && (
                                <span className="shrink-0 rounded-full bg-[#F4F6F8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6A55D6]">
                                  Manager
                                </span>
                              )}
                            </div>
                            <small className="block truncate text-xs text-[#667385]">
                              {emp.employeeCode ?? '-'}
                              {emp.designation ? ` · ${emp.designation}` : emp.department ? ` · ${emp.department}` : ''}
                            </small>
                          </div>
                        </div>

                        {emp.inTeam ? (
                          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[#0E9F8B]">
                            <Check size={14} />
                            On your team
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={adding}
                            onClick={() => handleAddMember(emp)}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#F4F6F8] px-3 py-1.5 text-xs font-semibold text-[#6A55D6] transition hover:bg-[#e9edf1] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adding ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                            {adding ? 'Adding…' : 'Add'}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {loading ? (
            <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">Loading team members…</p>
          ) : filteredEmployees.length === 0 ? (
            <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">
              {employees.length === 0 ? "You have not added anyone to your team yet." : "No employees match your search."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[110px_1.4fr_1fr_110px_auto] gap-3 pb-2 text-xs text-[#667385]">
                  <span>Employee ID</span><span>Name</span><span>Department</span><span>Join date</span><span>Actions</span>
                </div>

                {filteredEmployees.map((emp) => (
                  <div key={emp._id} className="grid grid-cols-[110px_1.4fr_1fr_110px_auto] items-center gap-3 border-t border-[#DCE2E8] py-2.5 text-sm">
                    <span className="truncate font-medium">{emp.employeeCode ?? "-"}</span>

                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F4F6F8] text-[11px] font-semibold text-[#6A55D6]">
                        {initialsOf(emp.firstName, emp.lastName)}
                      </div>
                      <b className="truncate">{fullName(emp)}</b>
                    </div>

                    <span className="truncate text-[#667385]">{emp.department ?? "-"}</span>
                    <span className="text-[#667385]">{formatDate(emp.job?.joinDate)}</span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleViewMore(emp._id)}
                        className="rounded-lg bg-[#F4F6F8] px-3 py-1.5 text-xs font-semibold text-[#6A55D6] transition hover:bg-[#e9edf1]"
                      >
                        View more
                      </button>

                      {confirmingId === emp._id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={removingId === emp._id}
                            onClick={() => handleRemoveMember(emp)}
                            className="flex items-center gap-1.5 rounded-lg bg-[#E4484D] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#cf3a3f] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {removingId === emp._id ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
                            {removingId === emp._id ? 'Removing…' : 'Yes, remove'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#667385] transition hover:text-[#121C2B]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(emp._id)}
                          className="flex items-center gap-1.5 rounded-lg bg-[#F4F6F8] px-3 py-1.5 text-xs font-semibold text-[#E4484D] transition hover:bg-[#fbe9ea]"
                        >
                          <UserMinus size={14} />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Employee details */}
        {viewingId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#121C2B]/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Employee details"
          >
            <div className="w-full max-w-2xl rounded-[18px] bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#DCE2E8] pb-3">
                <div className="min-w-0">
                  <p className="text-[13px] text-[#667385]">Employee details</p>
                  <h4 className={`${DISPLAY} truncate text-[19px] font-bold`}>
                    {selectedEmployee ? fullName(selectedEmployee) : "Loading…"}
                  </h4>
                </div>

                <button
                  type="button"
                  onClick={closeDetails}
                  aria-label="Close employee details"
                  className="shrink-0 rounded-full bg-[#F4F6F8] p-2 text-[#667385] transition hover:text-[#121C2B]"
                >
                  <X size={16} />
                </button>
              </div>

              {detailsLoading ? (
                <p className="flex items-center gap-2 py-5 text-sm text-[#667385]">
                  <Loader2 size={15} className="animate-spin" />
                  Loading employee details…
                </p>
              ) : detailsError ? (
                <p className={`${ALERT} mt-3`}>{detailsError}</p>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detailFields.map((f) => (
                      <div key={f.label} className="rounded-xl bg-[#F8FAFC] px-3 py-2.5">
                        <p className="text-xs text-[#667385]">{f.label}</p>
                        <p className="mt-0.5 truncate text-sm font-semibold">{f.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 rounded-xl bg-[#F8FAFC] px-3 py-2.5">
                    <p className="text-xs text-[#667385]">Bio</p>
                    <p className="mt-0.5 text-sm text-[#121C2B]">
                      {selectedEmployee?.profile?.bio || "No bio added yet."}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeTable;