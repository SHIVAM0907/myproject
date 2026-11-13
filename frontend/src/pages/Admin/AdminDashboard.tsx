import React from "react";
import AdminHeader from "./components/AdminHeader";
import StatsCards from "./components/StatsCards";
import PendingApprovals from "./components/PendingApprovals";
import EmployeeDirectory from "./components/EmployeeDirectory";
import AddEmployeeDialog from "./components/AddEmployeeDialog";
import EditEmployeeDialog from "./components/EditEmployeeDialog";
import Modal from "./components/Modal";
import platformApi from "../../lib/platformApi";
import type {
  AdminEmployeeListItem,
  AdminEmployeeListResponse,
  AdminEmployeeStats,
  AdminManagerOption,
} from "../../types/Employee";

/**
 * Admin console for the platform realm.
 *
 * Authorised by the platform token in `token`, not the employee token, so it
 * works independently of whether anyone is signed in to the employee app. Every
 * read here goes through `platformApi`, which attaches the right Authorization
 * header per request.
 */
const AdminDashboard: React.FC = () => {
  const [stats, setStats] = React.useState<AdminEmployeeStats | null>(null);
  const [pending, setPending] = React.useState<AdminEmployeeListItem[]>([]);
  const [directory, setDirectory] = React.useState<AdminEmployeeListItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Feeds every reports-to picker. Re-fetched alongside the rest of the console
  // so a manager created here immediately becomes assignable, and so a manager
  // whose account was terminated stops being offered.
  const [managers, setManagers] = React.useState<AdminManagerOption[]>([]);

  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminEmployeeListItem | null>(null);
  const [deleting, setDeleting] = React.useState<AdminEmployeeListItem | null>(null);
  // The account staged for deletion, awaiting confirmation in the dialog below.
  const [pendingDelete, setPendingDelete] = React.useState<AdminEmployeeListItem | null>(null);

  // The directory filters are held here and only re-fetch once typing stops,
  // so each keystroke doesn't fire a request.
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [role, setRole] = React.useState("");

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [statsRes, pendingRes, directoryRes, managersRes] = await Promise.all([
        platformApi.get<AdminEmployeeStats>("/admin/stats"),
        platformApi.get<{ employees: AdminEmployeeListItem[] }>("/admin/employees/pending"),
        platformApi.get<AdminEmployeeListResponse>("/admin/employees", {
          params: { page, limit: 20, search: query || undefined, status: status || undefined, role: role || undefined },
        }),
        platformApi.get<{ managers: AdminManagerOption[] }>("/admin/managers"),
      ]);

      setStats(statsRes.data);
      setPending(pendingRes.data?.employees ?? []);
      setDirectory(directoryRes.data?.employees ?? []);
      setTotal(directoryRes.data?.total ?? 0);
      setTotalPages(directoryRes.data?.totalPages ?? 1);
      setManagers(managersRes.data?.managers ?? []);
    } catch (err: any) {
      // platformApi already cleared an expired token; the guard will send the
      // user to /admin/login on the next navigation.
      setError(err.response?.data?.message || "Could not load the admin console.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, query, role, status]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  // Any filter change restarts pagination, otherwise switching to a filtered
  // view can land on a page beyond the new result set.
  const applyFilter = (setter: (value: string) => void) => (value: string) => {
    setPage(1);
    setter(value);
  };

  /**
   * Deleting is staged through `confirmDelete` rather than fired straight from
   * the row button. A native `window.confirm` blocks the whole page and cannot
   * be styled, so the confirmation reuses the console's own Modal and matches
   * the create/edit dialogs.
   */
  const askDelete = (person: AdminEmployeeListItem) => setPendingDelete(person);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const person = pendingDelete;
    setPendingDelete(null);
    setDeleting(person);
    setError(null);
    try {
      await platformApi.delete(`/admin/employees/${person._id}`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not delete that account.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <AdminHeader onRefresh={refresh} refreshing={refreshing} />

        <header className="mb-4">
          <h1 className="font-['Bricolage_Grotesque',sans-serif] text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight">
            Admin console
          </h1>
          <p className="mt-1 text-[#667385]">
            Add and edit employees, managers and administrators, approve signups and review team
            data.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <StatsCards stats={stats} loading={loading} pendingCount={pending.length} />
          <PendingApprovals
            pending={pending}
            managers={managers}
            loading={loading}
            onChanged={load}
          />
          <EmployeeDirectory
            employees={directory}
            total={total}
            page={page}
            totalPages={totalPages}
            loading={loading}
            query={query}
            onQueryChange={applyFilter(setQuery)}
            status={status}
            onStatusChange={applyFilter(setStatus)}
            role={role}
            onRoleChange={applyFilter(setRole)}
            onPage={setPage}
            onAdd={() => setAdding(true)}
            onEdit={(person) => setEditing(person)}
            onDelete={askDelete}
            deletingId={deleting?._id ?? null}
          />
        </div>
      </div>

      {adding && (
        <AddEmployeeDialog
          managers={managers}
          onClose={() => setAdding(false)}
          onSaved={load}
        />
      )}

      {editing && (
        <EditEmployeeDialog
          person={editing}
          managers={managers}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}

      {pendingDelete && (
        <Modal
          title={`Delete ${pendingDelete.firstName} ${pendingDelete.lastName}?`}
          description={`${pendingDelete.email} · ${pendingDelete.employeeCode}`}
          onClose={() => setPendingDelete(null)}
        >
          <div className="space-y-4 text-sm text-[#121C2B]">
            <p>
              This permanently removes the account, along with its attendance records, leave
              requests, tasks, queries and meeting invitations. Anyone reporting to{" "}
              <strong>{pendingDelete.firstName}</strong> becomes unassigned.
            </p>
            <p className="rounded-xl border border-[#DCE2E8] bg-[#F4F6F8] px-4 py-3 text-xs text-[#667385]">
              To keep the record and only block sign-in, terminate the account from the approval
              queue instead.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-full border border-[#DCE2E8] px-4 py-2 text-sm font-semibold transition hover:bg-[#F4F6F8]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-full bg-[#E4484D] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d33b40]"
              >
                Delete account
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminDashboard;