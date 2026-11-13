import React from "react";
import {
  MessageSquareText,
  CircleDashed,
  CheckCheck,
  RotateCcw,
  PenLine,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import SimpleCalendar from "../components/Simplecalendar";
import WriteReview from "../components/WriteReview";
import type { ReviewableQuery } from "../components/WriteReview";
import employeeApi from "../../../lib/employeeApi";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";
const CARD = "rounded-[18px] border border-[#DCE2E8] bg-white p-5";
const ALERT = "rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  raised_again: "Raised again",
};

const STATUS_COLOR: Record<string, string> = {
  open: "#6A55D6",
  in_review: "#E2A100",
  resolved: "#0E9F8B",
  raised_again: "#E4484D",
};

type QueryRow = {
  _id: string;
  message: string;
  status: "open" | "in_review" | "resolved" | "raised_again";
  createdAt?: string;
  employee?: { firstName?: string; lastName?: string; department?: string; employeeCode?: string };
  task?: { title?: string; taskId?: string };
};

type CalendarEvent = {
  id: string;
  title: string;
  type: "task" | "meeting" | "query";
  date: string;
  status?: string;
};

const nameOf = (q: QueryRow) =>
  `${q.employee?.firstName ?? ""} ${q.employee?.lastName ?? ""}`.trim() || "Unknown";

const ManagerQueries: React.FC = () => {
  const [queries, setQueries] = React.useState<QueryRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, number>>({ total: 0, open: 0, inReview: 0, resolved: 0, raisedAgain: 0 });
  const [events, setEvents] = React.useState<CalendarEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reviewingId, setReviewingId] = React.useState<string | null>(null);

  const loadCalendarEvents = React.useCallback(async (month?: string) => {
    const res = await employeeApi.get<{ events: CalendarEvent[] }>('/calendar/events', {
      params: month ? { month } : {},
    });
    setEvents(res.data.events ?? []);
  }, []);

  const loadQueries = React.useCallback(async () => {
    try {
      const [teamRes, statRes] = await Promise.all([
        employeeApi.get<{ queries: QueryRow[] }>("/queries/team"),
        employeeApi.get<{ total: number; open: number; inReview: number; resolved: number; raisedAgain: number }>("/queries/stats"),
      ]);
      setQueries(teamRes.data.queries ?? []);
      setStats({
        total: statRes.data.total ?? 0,
        open: statRes.data.open ?? 0,
        inReview: statRes.data.inReview ?? 0,
        resolved: statRes.data.resolved ?? 0,
        raisedAgain: statRes.data.raisedAgain ?? 0,
      });
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not load queries.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadQueries();
    loadCalendarEvents().catch(() => {
      /* the calendar is a secondary panel; queries still render */
    });
  }, [loadQueries, loadCalendarEvents]);

  const openReview = (queryId: string) => {
    setReviewingId(queryId);
    document
      .getElementById("write-review-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const summary = [
    { label: "Total queries", value: stats.total, color: "#121C2B", icon: MessageSquareText },
    { label: "Waiting on you", value: stats.inReview, color: "#E2A100", icon: CircleDashed },
    { label: "Resolved", value: stats.resolved, color: "#0E9F8B", icon: CheckCheck },
    { label: "Raised again", value: stats.raisedAgain, color: "#E4484D", icon: RotateCcw },
  ];

  return (
    <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
      <div className="mx-auto max-w-[1240px] px-5 pb-10 pt-5">
        <Sidebar active="query" />
        <Header />

        {/* Summary strip */}
        <section aria-label="Query summary" className="rounded-[22px] border border-[#DCE2E8] bg-white p-6 sm:px-8">
          <div className="flex items-start gap-3">
            <MessageSquareText size={22} className="mt-1 shrink-0 text-[#6A55D6]" />
            <h1 className={`${DISPLAY} text-[clamp(24px,3.4vw,36px)] font-bold leading-[1.1] tracking-tight`}>
              {stats.inReview === 1 ? "1 query is waiting on you." : `${stats.inReview} queries are waiting on you.`}
            </h1>
          </div>

          <p className="mb-4 mt-2 text-[#667385]">
            {stats.total === 0
              ? "No queries have been raised yet."
              : `${stats.total} ${stats.total === 1 ? "query" : "queries"} from your team, ${stats.resolved} resolved.`}
          </p>

          <div className="flex flex-wrap gap-2">
            {summary.map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2 rounded-xl bg-[#F4F6F8] px-3 py-2">
                <Icon size={14} style={{ color }} />
                <b className={`${DISPLAY} text-xl`}>{value}</b>
                <span className="text-[13px] text-[#667385]">{label.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Calendar + latest queries */}
        <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_1.2fr]">
          <SimpleCalendar events={events} onMonthChange={loadCalendarEvents} />

          <section aria-label="Latest queries" className={CARD}>
            <h3 className={`${DISPLAY} text-[17px] font-bold`}>Latest queries</h3>

            <div className="mt-3">
              {loading ? (
                <p className="text-sm text-[#667385]">Loading queries…</p>
              ) : error ? (
                <p className={ALERT}>{error}</p>
              ) : queries.length === 0 ? (
                <p className="text-sm text-[#667385]">No team queries yet.</p>
              ) : (
                queries.slice(0, 5).map((query) => (
                  <div key={query._id} className="flex items-center justify-between gap-3 border-t border-[#DCE2E8] py-2.5">
                    <div className="min-w-0">
                      <b className="block truncate text-sm">{query.message}</b>
                      <small className="block truncate text-xs text-[#667385]">
                        {nameOf(query)} · {query.task?.title ?? "General"}
                      </small>
                    </div>

                    <span
                      className="shrink-0 rounded-full bg-[#F4F6F8] px-2.5 py-1 text-xs font-semibold"
                      style={{ color: STATUS_COLOR[query.status] ?? "#667385" }}
                    >
                      {STATUS_LABEL[query.status] || query.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* All queries */}
        <section aria-label="All queries" className={`${CARD} mt-4`}>
          <h3 className={`${DISPLAY} text-[17px] font-bold`}>All queries</h3>

          {queries.length === 0 ? (
            <p className="border-t border-[#DCE2E8] py-6 text-center text-sm text-[#667385]">
              {loading ? "Loading queries…" : "No queries to review yet."}
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.6fr_1fr_1fr_120px_130px] gap-3 pb-2 text-xs text-[#667385]">
                  <span>Query</span><span>Task</span><span>From</span><span>Status</span><span>Review</span>
                </div>

                {queries.map((query) => (
                  <div key={query._id} className="grid grid-cols-[1.6fr_1fr_1fr_120px_130px] items-center gap-3 border-t border-[#DCE2E8] py-2.5 text-sm">
                    <span className="truncate">{query.message}</span>
                    <span className="truncate text-[#667385]">{query.task?.title ?? "General"}</span>
                    <span className="truncate text-[#667385]">{nameOf(query)}</span>

                    <span
                      className="w-fit rounded-full bg-[#F4F6F8] px-2.5 py-1 text-xs font-semibold"
                      style={{ color: STATUS_COLOR[query.status] ?? "#667385" }}
                    >
                      {STATUS_LABEL[query.status] || query.status}
                    </span>

                    <button
                      type="button"
                      onClick={() => openReview(query._id)}
                      className="flex w-fit items-center gap-1.5 rounded-lg bg-[#F4F6F8] px-3 py-1.5 text-xs font-semibold text-[#6A55D6] transition hover:bg-[#e9edf1]"
                    >
                      <PenLine size={13} />
                      Write review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div id="write-review-section" className="mt-4">
          <WriteReview
            queries={queries as ReviewableQuery[]}
            loading={loading}
            activeId={reviewingId}
            onActiveIdChange={setReviewingId}
            onReviewed={loadQueries}
          />
        </div>
      </div>
    </div>
  );
};

export default ManagerQueries;