// Apply for Leave, wired to the real leave endpoints:
//   GET  /api/employee/leave/balance -> { balance }
//   GET  /api/employee/leave/history -> { leaveRequests }
//   POST /api/employee/leave         -> submit for approval
//   POST /api/employee/leave/draft   -> save without submitting
//
// The API uses lowercase enums (`casual`, `pending`, `full_day`), which the
// types in types/Employee.ts already declare; the previous version of this page
// re-declared its own Title-Cased unions, so the display labels are mapped here
// instead of widening the shared types.
import React from "react";
import { useEmployeeAuth } from "../../../contexts/EmployeeAuthContext";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import employeeApi from "../../../lib/employeeApi";
import { uploadApi, uploadPutHeaders } from "../../../lib/uploadApi";
import type {
  DayType,
  LeaveBalanceBucket,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from "../../../types/Employee";


const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";
const FIELD = "mt-1 w-full rounded-xl border border-[#DCE2E8] bg-white px-3 py-2.5 text-sm text-[#121C2B] outline-none focus:border-[#6A55D6]";

const TYPES: LeaveType[] = ["casual", "sick", "earned", "unpaid"];
const DAY_TYPES: DayType[] = ["full_day", "first_half", "second_half"];
const STATUSES: LeaveStatus[] = ["draft", "pending", "approved", "rejected", "cancelled"];

const TYPE_LABEL: Record<LeaveType, string> = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
};
const DAY_LABEL: Record<DayType, string> = {
  full_day: "Full Day",
  first_half: "First Half",
  second_half: "Second Half",
};
const STATUS_LABEL: Record<LeaveStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const T_COLOR: Record<LeaveType, string> = {
  casual: "#6A55D6",
  sick: "#E4484D",
  earned: "#0E9F8B",
  unpaid: "#E2A100",
};
const S_COLOR: Record<LeaveStatus, string> = {
  draft: "#667385",
  pending: "#E2A100",
  approved: "#0E9F8B",
  rejected: "#E4484D",
  cancelled: "#667385",
};

/** An empty balance, so the cards still render before/if the fetch fails. */
const EMPTY_BALANCE: Record<LeaveType, LeaveBalanceBucket> = {
  casual: { label: "Casual Leave", total: 0, used: 0, remaining: 0 },
  sick: { label: "Sick Leave", total: 0, used: 0, remaining: 0 },
  earned: { label: "Earned Leave", total: 0, used: 0, remaining: 0 },
  unpaid: { label: "Unpaid Leave", total: 0, used: 0, remaining: 0 },
};

/** "2026-09-02" — the wire format the API stores and expects. */
const dayKey = (iso: string | undefined | null) => (iso ? String(iso).slice(0, 10) : "");

const fmt = (s: string) =>
  new Date(`${dayKey(s)}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

/**
 * Mirrors the server's duration rule in leave.controller.ts `buildLeave`:
 * business days, falling back to half the calendar span for a weekend-only
 * request, never below half a day. Counting plain calendar days here would show
 * "5 days" for a Mon–Fri request the server records as 3 once a weekend is
 * inside the range, which reads as the system losing days.
 */
const durationOf = (from: string, to: string): number => {
  if (!from || !to) return 0;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() < start.getTime()) return 0;

  let business = 0;
  let calendar = 0;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor.setDate(cursor.getDate() + 1)) {
    calendar += 1;
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) business += 1;
  }
  return Math.max(0.5, Math.round((business || calendar / 2) * 100) / 100);
};

/** Uploads one file through the presigned URL flow and returns its storage key. */
const uploadFile = async (file: File): Promise<string> => {
  const { data } = await uploadApi.post("/get-upload-url", {
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    folderMain: "leave",
  });

  const response = await fetch(data.uploadUrl, {
    method: "PUT",
    body: file,
    headers: uploadPutHeaders(file.type || "application/octet-stream"),
  });
  if (!response.ok) throw new Error(`Could not upload ${file.name}.`);

  return data.key as string;
};

const ApplyLeave: React.FC = () => {
  const { employee } = useEmployeeAuth();
  const name = `${employee?.firstName ?? ""} ${employee?.lastName ?? ""}`.trim() || "Employee";

  const [balance, setBalance] = React.useState<Record<LeaveType, LeaveBalanceBucket>>(EMPTY_BALANCE);
  const [history, setHistory] = React.useState<LeaveRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<"submit" | "draft" | null>(null);

  const [form, setForm] = React.useState({
    leaveType: "casual" as LeaveType,
    dayType: "full_day" as DayType,
    from: "",
    to: "",
    contact: "",
    reason: "",
  });
  const [files, setFiles] = React.useState<File[]>([]);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = React.useState("");
  const [fStatus, setFStatus] = React.useState("all");
  const [fType, setFType] = React.useState("all");
  const [fYear, setFYear] = React.useState("year");

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const [balanceRes, historyRes] = await Promise.all([
        employeeApi.get<{ balance: Record<LeaveType, Omit<LeaveBalanceBucket, "label">> }>(
          "/leave/balance",
        ),
        employeeApi.get<{ leaveRequests: LeaveRequest[] }>("/leave/history"),
      ]);

      const raw = balanceRes.data?.balance ?? ({} as Record<LeaveType, Omit<LeaveBalanceBucket, "label">>);
      setBalance(
        TYPES.reduce(
          (acc, type) => {
            acc[type] = { label: TYPE_LABEL[type], ...(raw[type] ?? EMPTY_BALANCE[type]) };
            return acc;
          },
          { ...EMPTY_BALANCE },
        ),
      );
      setHistory(historyRes.data?.leaveRequests ?? []);
    } catch (err: any) {
      setLoadError(err.response?.data?.message || "Could not load your leave details.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const days = React.useMemo(() => durationOf(form.from, form.to), [form.from, form.to]);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const managerName =
    employee?.manager && typeof employee.manager === "object"
      ? `${employee.manager.firstName} ${employee.manager.lastName}`.trim()
      : "";

  /** Shared by Submit and Save as draft — same body, different endpoint. */
  const send = async (mode: "submit" | "draft") => {
    const endpoint = mode === "submit" ? "/leave" : "/leave/draft";

    if (!form.from || !form.to) {
      return setMsg({ ok: false, text: "Pick your start and end dates." });
    }
    if (days <= 0) return setMsg({ ok: false, text: "The end date can't be before the start date." });
    if (mode === "submit" && !form.reason.trim()) {
      return setMsg({ ok: false, text: "Please give a reason for your leave." });
    }

    const bucket = balance[form.leaveType];
    if (mode === "submit" && bucket.total > 0 && days > bucket.remaining) {
      return setMsg({
        ok: false,
        text: `You only have ${bucket.remaining} day(s) of ${TYPE_LABEL[form.leaveType].toLowerCase()} left.`,
      });
    }

    setSaving(mode);
    setMsg(null);
    try {
      // Attachments are stored as storage keys, so upload before submitting.
      const attachments = await Promise.all(files.map(uploadFile));

      await employeeApi.post(endpoint, {
        leaveType: form.leaveType,
        dayType: form.dayType,
        fromDate: form.from,
        toDate: form.to,
        reason: form.reason.trim() || undefined,
        contactWhileOnLeave: form.contact.trim() || undefined,
        attachments,
      });

      setForm({
        leaveType: form.leaveType,
        dayType: "full_day",
        from: "",
        to: "",
        contact: "",
        reason: "",
      });
      setFiles([]);
      setMsg({
        ok: true,
        text:
          mode === "submit"
            ? "Request sent to your manager for approval."
            : "Draft saved. Submit it from your history when you're ready.",
      });
      await load();
    } catch (err: any) {
      setMsg({
        ok: false,
        text: err.response?.data?.message || (err.message ?? "Could not save your request."),
      });
    } finally {
      setSaving(null);
    }
  };

  const year = String(new Date().getFullYear());
  const rows = history.filter((request) => {
    const from = dayKey(request.fromDate);
    return (
      (fStatus === "all" || request.status === fStatus) &&
      (fType === "all" || request.leaveType === fType) &&
      (fYear === "all" || from.startsWith(year)) &&
      `${TYPE_LABEL[request.leaveType]} ${request.reason ?? ""}`
        .toLowerCase()
        .includes(q.trim().toLowerCase())
    );
  });

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="apply-leave" />
        <Header />

        <header className="mb-4">
          <h1 className={`${DISPLAY} text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight`}>
            Apply for leave
          </h1>
          <p className="mt-1 text-[#667385]">
            {name}
            {employee?.employeeCode ? ` · ${employee.employeeCode}` : ""}
          </p>
        </header>

        {loadError && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={load}
              className="ml-auto rounded-full bg-white px-3 py-1 text-xs font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        <section
          aria-label="Leave balance"
          aria-busy={loading}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          {TYPES.map((type) => {
            const bucket = balance[type];
            // Unpaid leave has no allowance to draw down, so it shows days taken
            // rather than a meaningless "0 left of 0".
            const tracked = bucket.total > 0;
            return (
              <div
                key={type}
                className="rounded-[18px] border border-[#DCE2E8] bg-white p-4"
              >
                <div className="flex items-center gap-2 text-sm text-[#667385]">
                  <i className="h-2 w-2 rounded-full" style={{ background: T_COLOR[type] }} />
                  {TYPE_LABEL[type]}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <b className={`${DISPLAY} text-4xl`}>{tracked ? bucket.remaining : bucket.used}</b>
                  <span className="text-sm text-[#667385]">
                    {tracked ? `left of ${bucket.total} days` : "taken"}
                  </span>
                </div>
                {tracked && (
                  <div className="mt-3 h-1.5 rounded-full bg-[#F4F6F8]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, (bucket.remaining / bucket.total) * 100))}%`,
                        background: T_COLOR[type],
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </section>

        <section aria-label="New leave request" className={`${CARD} mt-4`}>
          <h3 className={`${DISPLAY} text-[17px] font-bold`}>New leave request</h3>
          <p className="mb-3 text-sm text-[#667385]">
            {managerName
              ? `Requests go to ${managerName} for approval.`
              : "Requests go to your reporting manager for approval."}
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-[#667385]">
              Leave type *
              <select
                className={FIELD}
                value={form.leaveType}
                onChange={(e) => set({ leaveType: e.target.value as LeaveType })}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>

            {/* The API derives the approver from the employee's `manager` field
                and ignores any manager sent in the body, so this is shown for
                confirmation rather than being editable. */}
            <label className="text-xs font-medium text-[#667385]">
              Reporting manager
              <input
                className={`${FIELD} cursor-not-allowed bg-[#F4F6F8] text-[#667385]`}
                value={managerName || "Not assigned yet"}
                readOnly
              />
            </label>

            <label className="text-xs font-medium text-[#667385]">
              From *
              <input
                type="date"
                className={FIELD}
                value={form.from}
                onChange={(e) =>
                  set({
                    from: e.target.value,
                    to: form.to && form.to < e.target.value ? e.target.value : form.to,
                  })
                }
              />
            </label>

            <label className="text-xs font-medium text-[#667385]">
              To *
              <input
                type="date"
                min={form.from}
                className={FIELD}
                value={form.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            </label>

            <label className="text-xs font-medium text-[#667385]">
              Day type
              <select
                className={FIELD}
                value={form.dayType}
                onChange={(e) => set({ dayType: e.target.value as DayType })}
              >
                {DAY_TYPES.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LABEL[d]}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-medium text-[#667385]">
              Contact while on leave
              <input
                className={FIELD}
                value={form.contact}
                onChange={(e) => set({ contact: e.target.value })}
                placeholder="Phone number or alternate contact"
              />
            </label>

            <label className="text-xs font-medium text-[#667385] md:col-span-2">
              Reason *
              <textarea
                rows={3}
                className={FIELD}
                value={form.reason}
                onChange={(e) => set({ reason: e.target.value })}
                placeholder="Briefly describe the reason for your leave…"
              />
            </label>

            <label className="text-xs font-medium text-[#667385] md:col-span-2">
              Attachments
              <span className={`${FIELD} block cursor-pointer text-[#667385]`}>
                {files.length ? `${files.length} file(s) added` : "Add file (optional, e.g. medical certificate)"}
              </span>
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
            </label>

            <div className="flex items-center rounded-xl bg-[#F4F6F8] px-4 py-3 text-sm md:col-span-2">
              {days > 0 ? (
                <span>
                  <b className={DISPLAY}>{days} day{days === 1 ? "" : "s"}</b>{" "}
                  <span className="text-[#667385]">
                    · {fmt(form.from)}
                    {form.to !== form.from ? ` to ${fmt(form.to)}` : ""}
                    {DAY_LABEL[form.dayType] !== "Full Day" && ` · ${DAY_LABEL[form.dayType]}`}
                  </span>
                </span>
              ) : (
                <span className="text-[#667385]">Pick your dates to see the duration.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              {msg && (
                <p role="status" className={`mr-auto text-sm ${msg.ok ? "text-[#0E9F8B]" : "text-rose-600"}`}>
                  {msg.text}
                </p>
              )}
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => send("draft")}
                className="ml-auto rounded-full bg-[#F4F6F8] px-5 py-2.5 text-sm font-semibold hover:bg-[#e9edf1] disabled:opacity-60"
              >
                {saving === "draft" ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => send("submit")}
                className="rounded-full bg-[#6A55D6] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#5a47bd] disabled:opacity-60"
              >
                {saving === "submit" ? "Sending…" : "Submit request"}
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Leave history" className={`${CARD} mt-4`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className={`${DISPLAY} mr-auto text-[17px] font-bold`}>Leave history</h3>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search requests…"
              aria-label="Search requests"
              className={`${FIELD} mt-0 max-w-[200px] py-1.5`}
            />
            <select
              aria-label="Status filter"
              className={`${FIELD} mt-0 w-auto py-1.5`}
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="all">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Type filter"
              className={`${FIELD} mt-0 w-auto py-1.5`}
              value={fType}
              onChange={(e) => setFType(e.target.value)}
            >
              <option value="all">All</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <select
              aria-label="Year filter"
              className={`${FIELD} mt-0 w-auto py-1.5`}
              value={fYear}
              onChange={(e) => setFYear(e.target.value)}
            >
              <option value="year">This year</option>
              <option value="all">All time</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              <div className="grid grid-cols-[1.2fr_1.3fr_60px_1.3fr_100px] gap-3 pb-2 text-xs text-[#667385]">
                <span>Type</span>
                <span>Dates</span>
                <span>Days</span>
                <span>Reason</span>
                <span>Status</span>
              </div>

              {loading && <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">Loading your requests…</p>}

              {!loading && rows.length === 0 && (
                <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">
                  {history.length === 0 ? "You have not made any leave requests yet." : "No requests match these filters."}
                </p>
              )}

              {rows.map((request) => {
                const from = dayKey(request.fromDate);
                const to = dayKey(request.toDate);
                return (
                  <div
                    key={request._id ?? `${request.fromDate}-${request.leaveType}`}
                    className="grid grid-cols-[1.2fr_1.3fr_60px_1.3fr_100px] items-center gap-3 border-t border-[#DCE2E8] py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <i className="h-2 w-2 rounded-full" style={{ background: T_COLOR[request.leaveType] }} />
                      {TYPE_LABEL[request.leaveType]}
                    </span>
                    <span>
                      {fmt(from).slice(0, 6)}
                      {to !== from ? ` – ${fmt(to).slice(0, 6)}` : ""}
                    </span>
                    <span>{request.days}</span>
                    <span className="truncate text-[#667385]">{request.reason || "—"}</span>
                    <span
                      className="w-fit rounded-full bg-[#F4F6F8] px-2.5 py-0.5 text-xs font-semibold"
                      style={{ color: S_COLOR[request.status] }}
                    >
                      {STATUS_LABEL[request.status]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-[#667385]">
            Showing {rows.length} of {history.length} requests
          </p>
        </section>
      </div>
    </div>
  );
};

export default ApplyLeave;