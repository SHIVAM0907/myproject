import React from "react";
import { Loader2, Link2, Search, UsersRound, X } from "lucide-react";
import employeeApi from "../lib/employeeApi";
import type { ActiveMeeting, AvailableEmployee, Colleague } from "../types/Employee";

const DURATIONS = [15, 30, 45, 60, 90, 120];

// A manager picks from the whole company via /team/available; an employee only
// gets their own team and manager via /colleagues.
export type MeetingScope = "manager" | "employee";

type Person = AvailableEmployee | Colleague;

// datetime-local needs a local-time string; toISOString() would shift the clock.
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function describeError(err: any, fallback: string) {
  const status = err?.response?.status;
  if (status && !err?.response?.data?.message) {
    return `${fallback} (HTTP ${status} ${err?.response?.statusText ?? ""})`;
  }
  return err?.response?.data?.message || fallback;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const MeetingDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  scope?: MeetingScope;
}> = ({ open, onClose, onCreated, scope = "manager" }) => {
  const isManagerScope = scope === "manager";
  const [people, setPeople] = React.useState<Person[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [ending, setEnding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [title, setTitle] = React.useState("");
  const [meetingLink, setMeetingLink] = React.useState("");
  const [startTime, setStartTime] = React.useState(() => toLocalInputValue(new Date()));
  const [durationMin, setDurationMin] = React.useState(30);

  // Active meeting state
  const [activeMeeting, setActiveMeeting] = React.useState<ActiveMeeting | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const loadPeople = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isManagerScope) {
        const res = await employeeApi.get<{ employees: AvailableEmployee[] }>("/team/available");
        setPeople(res.data.employees ?? []);
      } else {
        const res = await employeeApi.get<{ colleagues: Colleague[] }>("/colleagues");
        setPeople(res.data.colleagues ?? []);
      }
    } catch (err: any) {
      setPeople([]);
      setError(describeError(err, isManagerScope ? "Could not load employees." : "Could not load your team."));
    } finally {
      setLoading(false);
    }
  }, [isManagerScope]);

  const loadActiveMeeting = React.useCallback(async () => {
    try {
      const res = await employeeApi.get<{ meeting: ActiveMeeting | null }>("/meetings/active");
      setActiveMeeting(res.data.meeting ?? null);
    } catch {
      setActiveMeeting(null);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSearch("");
    setTitle("");
    setMeetingLink("");
    setSelected([]);
    setStartTime(toLocalInputValue(new Date()));
    setDurationMin(30);
    loadPeople();
    loadActiveMeeting();
  }, [open, loadPeople, loadActiveMeeting]);

  // Tick every second while a meeting is active so the timer stays live.
  React.useEffect(() => {
    if (!activeMeeting) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeMeeting]);

  // Lock background scroll while the modal is open. Save the current overflow
  // and paddingRight so they can be restored on close/unmount. Compensate for
  // the disappearing page scrollbar to avoid layout shift.
  React.useEffect(() => {
    if (!open) return;

    const body = document.body;
    const documentEl = document.documentElement;

    const prevBodyOverflow = body.style.overflow;
    const prevDocumentOverflow = documentEl.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - documentEl.clientWidth;

    body.style.overflow = "hidden";
    documentEl.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = prevBodyOverflow;
      documentEl.style.overflow = prevDocumentOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [open]);

  if (!open) return null;

  const filtered = people.filter((person) => {
    const name = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
    const text = `${name} ${person.department ?? ""} ${person.designation ?? ""} ${person.employeeCode ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const handleStartMeeting = async () => {
    setError(null);

    if (!title.trim()) {
      setError("Give the meeting a title.");
      return;
    }
    if (isManagerScope && selected.length === 0) {
      setError("Pick at least one participant.");
      return;
    }

    const start = new Date(startTime);
    if (Number.isNaN(start.getTime())) {
      setError("That start time is not valid.");
      return;
    }

    const link = meetingLink.trim();
    if (link) {
      let parsed: URL;
      try {
        parsed = new URL(link);
      } catch {
        setError("That meeting link is not a valid URL.");
        return;
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        setError("The meeting link must start with http or https.");
        return;
      }
    }

    setSubmitting(true);
    try {
      // Check if there is already a scheduled meeting to start (avoid duplicates).
      const existingRes = await employeeApi.get<{ meetings: ActiveMeeting[] }>("/meetings?upcoming=true");
      const existing = existingRes.data.meetings?.find(
        (m: ActiveMeeting) => m.status === "scheduled" && m.title === title.trim(),
      );

      let meetingId: string;
      if (existing) {
        meetingId = existing._id;
      } else {
        const createRes = await employeeApi.post<{ meeting: ActiveMeeting }>("/meetings", {
          title: title.trim(),
          meetingLink: link || undefined,
          participants: selected,
          startTime: start.toISOString(),
          endTime: new Date(start.getTime() + durationMin * 60000).toISOString(),
          durationMin,
        });
        meetingId = createRes.data.meeting._id;
      }

      const startRes = await employeeApi.post<{ meeting: ActiveMeeting }>(`/meetings/${meetingId}/start`);
      setActiveMeeting(startRes.data.meeting);
      onCreated();
    } catch (err: any) {
      setError(describeError(err, "Could not start the meeting."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEndMeeting = async () => {
    if (!activeMeeting) return;
    setError(null);
    setEnding(true);
    try {
      await employeeApi.post(`/meetings/${activeMeeting._id}/end`);
      setActiveMeeting(null);
      onCreated();
    } catch (err: any) {
      setError(describeError(err, "Could not end the meeting."));
    } finally {
      setEnding(false);
    }
  };

  const isMeetingActive = activeMeeting?.status === "active";
  const isMeetingEnded = activeMeeting?.status === "ended";
  const elapsedSeconds = isMeetingActive && activeMeeting?.actualStartedAt
    ? Math.max(0, Math.floor((now - new Date(activeMeeting.actualStartedAt).getTime()) / 1000))
    : 0;
  const expectedSeconds = activeMeeting?.expectedDuration
    ? activeMeeting.expectedDuration * 60
    : 0;
  const isOverrunning = isMeetingActive && expectedSeconds > 0 && elapsedSeconds > expectedSeconds;

  // Managers tag anyone already on their team; an employee's whole list is
  // their team, so only the manager of that team is flagged.
  const badgeFor = (person: Person) => {
    if (isManagerScope) {
      const inTeam = (person as AvailableEmployee).inTeam;
      if (inTeam) {
        return <span className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">Your team</span>;
      }
      if (person.role === "manager") {
        return <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">Manager</span>;
      }
      return null;
    }
    return (person as Colleague).isManager ? (
      <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
        Manager
      </span>
    ) : null;
  };

  const availabilityBadge = (person: Person) => {
    const avail = person.availability;
    if (!avail || avail.status !== "unavailable") return null;
    const endTime = avail.expectedEndAt
      ? ` until ~${formatTime(new Date(avail.expectedEndAt))}`
      : "";
    return (
      <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
        Unavailable{endTime}
      </span>
    );
  };

  const formReadOnly = isMeetingActive || isMeetingEnded;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm overscroll-contain">
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">New meeting</p>
            <h4 className="mt-1 text-xl font-bold text-[#10284A]">Start Meeting</h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close meeting dialog"
            className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Banners — always visible, never scroll */}
        <div className="shrink-0">
          {isMeetingEnded && activeMeeting && (
            <div className="mt-4 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
              <span className="font-semibold">Meeting ended</span>
              <span className="mx-1.5">·</span>
              Actual duration: {formatDuration(activeMeeting.actualDuration ?? 0)}
            </div>
          )}

          {isMeetingActive && activeMeeting && (
            <div className="mt-4 rounded-xl bg-purple-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-purple-700">
                  Meeting in progress
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-purple-700">
                  {formatDuration(elapsedSeconds)}
                </span>
              </div>
              {isOverrunning && (
                <p className="mt-1 text-xs font-medium text-rose-600">
                  Overrunning — expected duration was {formatDuration(expectedSeconds)}
                </p>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isMeetingActive) handleStartMeeting();
          }}
          className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-y-auto pl-6 pr-4 [scrollbar-gutter:stable] [scrollbar-width:thin] overscroll-contain">
          <label className="block text-sm text-gray-600">
            Meeting title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly standup"
              readOnly={formReadOnly}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#2459A6] read-only:bg-gray-50 read-only:text-gray-500"
            />
          </label>

          <label className="mt-3 block text-sm text-gray-600">
            <span className="flex items-center gap-1.5">
              <Link2 size={14} className="text-gray-400" /> Meet link
            </span>
            <span className="ml-1 text-xs text-gray-400">optional — a Google Meet link is added if left empty</span>
            <input
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              readOnly={formReadOnly}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#2459A6] read-only:bg-gray-50 read-only:text-gray-500"
            />
          </label>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-gray-600">
              Start time
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                readOnly={formReadOnly}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#2459A6] read-only:bg-gray-50 read-only:text-gray-500"
              />
            </label>

            <label className="text-sm text-gray-600">
              Expected duration
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                disabled={formReadOnly}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-[#2459A6] disabled:bg-gray-50 disabled:text-gray-500"
              >
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60 ? `${minutes} min` : `${minutes / 60} hr${minutes > 60 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Expected / Actual duration summary */}
          {activeMeeting && (isMeetingActive || isMeetingEnded) && (
            <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Expected duration</span>
                <span className="font-semibold text-[#10284A]">
                  {activeMeeting.expectedDuration
                    ? `${activeMeeting.expectedDuration} min`
                    : "—"}
                </span>
              </div>
              {activeMeeting.expectedEndAt && (
                <div className="mt-1 flex justify-between">
                  <span className="text-gray-500">Expected window</span>
                  <span className="font-semibold text-[#10284A]">
                    {formatTime(new Date(activeMeeting.actualStartedAt ?? activeMeeting.startTime))}
                    {" → "}
                    {formatTime(new Date(activeMeeting.expectedEndAt))}
                  </span>
                </div>
              )}
              {isMeetingEnded && (
                <div className="mt-1 flex justify-between">
                  <span className="text-gray-500">Actual duration</span>
                  <span className="font-semibold text-[#10284A]">
                    {formatDuration(activeMeeting.actualDuration ?? 0)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {isManagerScope ? "Participants" : "Invite"}
              <span className="ml-2 text-xs text-gray-500">
                {selected.length} selected
              </span>
            </p>
            {selected.length > 0 && !formReadOnly && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-xs font-semibold text-[#2459A6] hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isManagerScope ? "Search employees and managers..." : "Search your team..."}
              className="w-full bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200">
            {loading ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin" />
                Loading {isManagerScope ? "employees" : "your team"}...
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400">
                {people.length === 0
                  ? isManagerScope
                    ? "No employees available."
                    : "No colleagues to invite yet."
                  : isManagerScope
                    ? "No employees match your search."
                    : "Nobody matches your search."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((person) => {
                  const name = `${person.firstName} ${person.lastName}`.trim();
                  const initials = `${person.firstName?.[0] ?? ""}${person.lastName?.[0] ?? ""}`.toUpperCase();
                  const isSelected = selected.includes(person._id);
                  const isUnavailable = person.availability?.status === "unavailable";

                  return (
                    <li key={person._id}>
                      <label
                        className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-gray-50 ${
                          formReadOnly || isUnavailable ? "cursor-not-allowed opacity-60" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => !formReadOnly && !isUnavailable && toggle(person._id)}
                          disabled={formReadOnly || isUnavailable}
                          aria-label={`Select ${name}`}
                          className="h-4 w-4 shrink-0 accent-[#2459A6]"
                        />

                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-[#2459A6]">
                          {initials}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[#10284A]">{name}</p>
                            {isManagerScope && person.role === "manager" && (
                              <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                                Manager
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-gray-500">
                            {person.employeeCode ?? "-"}
                            {person.designation
                              ? ` · ${person.designation}`
                              : person.department
                                ? ` · ${person.department}`
                                : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {availabilityBadge(person)}
                          {badgeFor(person)}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4 shadow-[0_-6px_12px_-6px_rgba(0,0,0,0.10)] -mx-6 -mb-6">
            <div className="flex justify-center gap-3">
              {!isMeetingEnded && (
                <>
                  <button
                    type="button"
                    onClick={handleStartMeeting}
                    disabled={submitting || isMeetingActive}
                    className="flex items-center gap-2 rounded-xl bg-[#10284A] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a3a66] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <UsersRound size={15} />}
                    {submitting ? "Starting..." : "Start Meeting"}
                  </button>
                  <button
                    type="button"
                    onClick={handleEndMeeting}
                    disabled={!isMeetingActive || ending}
                    className="flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ending ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                    {ending ? "Ending..." : "End Meeting"}
                  </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MeetingDialog;
