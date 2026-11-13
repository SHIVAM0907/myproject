import React from "react";
import {
  CheckCheck,
  CircleDashed,
  Clock3,
  Hourglass,
  ListChecks,
  Loader2,
  MessageSquareText,
  RotateCcw,
  Search,
  Star,
} from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

type QueryStatus = "open" | "in_review" | "resolved" | "raised_again";

type MyQuery = {
  _id: string;
  message: string;
  status: QueryStatus;
  review?: string;
  reviewedAt?: string | null;
  createdAt?: string;
  task?: { title?: string; taskId?: string } | null;
};

const STATUS_META: Record<QueryStatus, { label: string; pill: string; box: string; icon: typeof Star }> = {
  open: { label: "Open", pill: "bg-[#FDF3DC] text-[#9C6F00]", box: "border-[#E2A100]/25 bg-[#FDF3DC]", icon: Star },
  in_review: { label: "In review", pill: "bg-[#EEEBFA] text-[#6A55D6]", box: "border-[#6A55D6]/20 bg-[#EEEBFA]", icon: CircleDashed },
  resolved: { label: "Resolved", pill: "bg-[#E6F5F2] text-[#0E9F8B]", box: "border-[#0E9F8B]/20 bg-[#E6F5F2]", icon: CheckCheck },
  raised_again: { label: "Raised again", pill: "bg-[#FCE8E8] text-[#E4484D]", box: "border-[#E4484D]/20 bg-[#FCE8E8]", icon: RotateCcw },
};

const STATUS_ORDER: QueryStatus[] = ["open", "in_review", "raised_again", "resolved"];

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// A mismatched route answers with an HTML page, so there is no message to read -
// surface the status instead of hiding behind the generic fallback.
function describeError(err: any, fallback: string) {
  const status = err?.response?.status;
  if (status && !err?.response?.data?.message) {
    return `${fallback} (HTTP ${status} ${err?.response?.statusText ?? ""}`.trim() + ")";
  }
  return err?.response?.data?.message || fallback;
}

const AllQueries: React.FC = () => {
  const [queries, setQueries] = React.useState<MyQuery[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const loadQueries = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await employeeApi.get<{ queries: MyQuery[] }>("/queries");
      setQueries(res.data?.queries ?? []);
    } catch (err: any) {
      setQueries([]);
      setError(describeError(err, "Could not load your queries."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadQueries();
  }, [loadQueries]);

  const filtered = queries.filter((query) => {
    const text = `${query.message} ${query.task?.title ?? ""} ${query.review ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const active = queries.find((query) => query._id === activeId) ?? filtered[0] ?? queries[0] ?? null;

  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, status) => {
    acc[status] = queries.filter((query) => query.status === status).length;
    return acc;
  }, {});

  const awaiting = queries.filter((query) => !query.review?.trim()).length;

  return (
    <section aria-label="All queries" className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
      <div className="flex items-center gap-2">
        <MessageSquareText size={22} className="text-[#6A55D6]" />
        <h3 className={`${DISPLAY} text-[17px] font-bold`}>All queries</h3>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="flex flex-col items-center rounded-xl border border-[#6A55D6]/20 bg-[#EEEBFA] px-3 py-3.5 text-center">
          <p className="py-0.5 text-sm font-semibold text-[#6A55D6]">Total</p>
          <p className={`${DISPLAY} mt-2 text-2xl font-bold`}>{queries.length}</p>
        </div>
        {STATUS_ORDER.map((status) => {
          const { label, pill, box, icon: Icon } = STATUS_META[status];
          return (
            <div key={status} className={`flex flex-col items-center rounded-xl border px-3 py-3.5 text-center ${box}`}>
              <div className={`flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold ${pill.split(" ")[1]}`}>
                <Icon size={13} />
                {label}
              </div>
              <p className={`${DISPLAY} mt-2 text-2xl font-bold`}>{counts[status] ?? 0}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#DCE2E8] px-4 py-2.5">
        <Search size={16} className="shrink-0 text-[#B6C0CC]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your queries..."
          className="w-full bg-transparent text-sm text-[#121C2B] outline-none placeholder:text-[#B6C0CC]"
        />
      </div>

      {error && <p className="mt-3 text-sm text-[#E4484D]">{error}</p>}

      <div className="mt-3 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-[#DCE2E8]">
          {loading ? (
            <p className="flex items-center gap-2 px-4 py-6 text-sm text-[#667385]">
              <Loader2 size={16} className="animate-spin" />
              Loading queries…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#667385]">
              {queries.length === 0
                ? "You have not raised any queries yet."
                : "No queries match your search."}
            </p>
          ) : (
            <ul className="divide-y divide-[#E9EEF3]">
              {filtered.map((query) => {
                const { label, pill } = STATUS_META[query.status] ?? STATUS_META.open;
                const isActive = query._id === active?._id;
                const hasReview = Boolean(query.review?.trim());

                return (
                  <li key={query._id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(query._id)}
                      className={`w-full px-4 py-3 text-left transition ${
                        isActive ? "bg-[#EEEBFA]" : "hover:bg-[#F8FAFC]"
                      }`}
                    >
                      <p className="line-clamp-2 text-sm font-medium">{query.message}</p>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pill}`}>
                          {label}
                        </span>
                        {hasReview ? (
                          <span className="rounded-full bg-[#E6F5F2] px-2 py-0.5 text-[10px] font-semibold text-[#0E9F8B]">
                            Reviewed
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#F4F6F8] px-2 py-0.5 text-[10px] font-semibold text-[#667385]">
                            Awaiting review
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!active ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-[#DCE2E8] text-sm text-[#667385]">
            Nothing to show yet.
          </div>
        ) : (
          <div className="min-w-0">
            <div className="rounded-xl border border-[#DCE2E8] bg-[#F8FAFC] p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-[#667385]">Your query</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    (STATUS_META[active.status] ?? STATUS_META.open).pill
                  }`}
                >
                  {(STATUS_META[active.status] ?? STATUS_META.open).label}
                </span>
              </div>

              <p className="mt-2 text-sm font-medium">{active.message}</p>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#667385]">
                <span className="flex items-center gap-1">
                  <ListChecks size={12} />
                  Task: <span className="font-medium">{active.task?.title ?? "General"}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock3 size={12} />
                  Raised: {formatDate(active.createdAt)}
                </span>
              </div>
            </div>

            <div
              className={`mt-4 rounded-xl border p-4 ${
                active.review?.trim()
                  ? "border-[#6A55D6]/20 bg-[#EEEBFA]"
                  : "border-dashed border-[#DCE2E8] bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                {active.review?.trim() ? (
                  <CheckCheck size={16} className="text-[#6A55D6]" />
                ) : (
                  <Hourglass size={16} className="text-[#B6C0CC]" />
                )}
                <p className="text-sm font-semibold">Manager review</p>
              </div>

              {active.review?.trim() ? (
                <>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#667385]">
                    {active.review}
                  </p>
                  {active.reviewedAt && (
                    <p className="mt-3 text-xs text-[#667385]">Reviewed on {formatDateTime(active.reviewedAt)}</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-[#667385]">
                  Your manager has not reviewed this query yet. You will see their response here.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {awaiting > 0 && !loading && (
        <p className="mt-3 text-xs text-[#667385]">
          {awaiting} {awaiting === 1 ? "query is" : "queries are"} still waiting for a manager review.
        </p>
      )}
    </section>
  );
};

export default AllQueries;