import React from "react";
import {
  CheckCheck,
  CircleDashed,
  Clock,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Search,
  Star,
} from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

export type ReviewStatus = "open" | "in_review" | "resolved" | "raised_again";

export type ReviewableQuery = {
  _id: string;
  message: string;
  status: ReviewStatus;
  review?: string;
  createdAt?: string;
  reviewedAt?: string;
  employee?: { firstName?: string; lastName?: string; department?: string; employeeCode?: string };
  task?: { title?: string; taskId?: string };
};

const STATUS_OPTIONS: { value: ReviewStatus; label: string; icon: typeof Star; active: string }[] = [
  { value: "in_review", label: "In review", icon: CircleDashed, active: "border-blue-500 bg-blue-50 text-blue-600" },
  { value: "resolved", label: "Resolved", icon: CheckCheck, active: "border-green-500 bg-green-50 text-green-600" },
  { value: "raised_again", label: "Raised again", icon: RotateCcw, active: "border-rose-500 bg-rose-50 text-rose-500" },
  { value: "open", label: "Open", icon: Star, active: "border-amber-500 bg-amber-50 text-amber-600" },
];

const STATUS_LABEL: Record<ReviewStatus, string> = {
  open: "Open",
  in_review: "In review",
  resolved: "Resolved",
  raised_again: "Raised again",
};

function formatDate(value?: string) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// A mismatched route answers with an HTML 404 page, so there is no message to
// read - surface the status instead of hiding behind the generic fallback.
function describeError(err: any, fallback: string) {
  const status = err?.response?.status;
  if (status && !err?.response?.data?.message) {
    return `${fallback} (HTTP ${status} ${err?.response?.statusText ?? ""}`.trim() + ")";
  }
  return err?.response?.data?.message || fallback;
}

// Keyed by query id at the call site, so switching queries remounts this and
// re-seeds the form from the server values.
const ReviewEditor: React.FC<{
  query: ReviewableQuery;
  onReviewed: () => void;
}> = ({ query, onReviewed }) => {
  const [review, setReview] = React.useState(query.review ?? "");
  const [status, setStatus] = React.useState<ReviewStatus>(query.status);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!review.trim()) {
      setError("Write your review before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await employeeApi.post(`/queries/${query._id}/review`, {
        review: review.trim(),
        status,
      });
      setSuccess("Review saved.");
      onReviewed();
    } catch (err: any) {
      setError(describeError(err, "Could not save the review."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="min-w-0">
      <div className="rounded-xl border border-gray-100 bg-[#F8FAFD] p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Query</p>
        <p className="mt-2 text-sm font-medium text-[#10284A]">{query.message}</p>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            From:{" "}
            <span className="font-medium text-[#10284A]">
              {`${query.employee?.firstName ?? ""} ${query.employee?.lastName ?? ""}`.trim() || "Unknown"}
            </span>
          </span>
          <span>
            Task: <span className="font-medium text-[#10284A]">{query.task?.title ?? "General"}</span>
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatDate(query.createdAt)}
          </span>
        </div>
      </div>

      <label className="mt-4 block text-sm text-gray-600">
        Your review
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={5}
          placeholder="Explain what needs to change, or how the query was handled…"
          className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
        />
      </label>

      <p className="mt-4 text-sm text-gray-600">Set status</p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_OPTIONS.map(({ value, label, icon: Icon, active }) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
              status === value ? active : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-xl bg-[#2459A6] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1e4a8c] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
          {submitting ? "Saving…" : "Submit review"}
        </button>
      </div>
    </form>
  );
};

const WriteReview: React.FC<{
  queries: ReviewableQuery[];
  loading?: boolean;
  activeId?: string | null;
  onActiveIdChange?: (id: string) => void;
  onReviewed: () => void;
}> = ({ queries, loading = false, activeId, onActiveIdChange, onReviewed }) => {
  // Fall back to the newest query still awaiting a decision so the form is never empty.
  const fallbackId = queries.find((q) => q.status !== "resolved")?._id ?? queries[0]?._id ?? null;
  const selectedId = activeId ?? fallbackId;

  const selected = queries.find((query) => query._id === selectedId) ?? null;

  const [search, setSearch] = React.useState("");

  const filtered = queries.filter((query) => {
    const who = `${query.employee?.firstName ?? ""} ${query.employee?.lastName ?? ""}`.trim();
    const text = `${query.message} ${who} ${query.task?.title ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const select = (id: string) => {
    if (onActiveIdChange) onActiveIdChange(id);
    setSearch("");
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <MessageSquarePlus size={20} className="text-[#10284A]" />
        <h3 className="text-lg font-semibold text-[#10284A]">Write Review</h3>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5">
            <Search size={16} className="shrink-0 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search queries..."
              className="w-full bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-400"
            />
          </div>

          <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-100">
            {loading ? (
              <p className="px-4 py-6 text-sm text-gray-400">Loading queries…</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400">
                {queries.length === 0 ? "No queries to review." : "No queries match your search."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((query) => {
                  const who = `${query.employee?.firstName ?? ""} ${query.employee?.lastName ?? ""}`.trim();
                  const isActive = query._id === selectedId;

                  return (
                    <li key={query._id}>
                      <button
                        type="button"
                        onClick={() => select(query._id)}
                        className={`w-full px-4 py-3 text-left transition ${
                          isActive ? "bg-blue-50/70" : "hover:bg-gray-50"
                        }`}
                      >
                        <p className="line-clamp-2 text-sm font-medium text-[#10284A]">{query.message}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">
                          {who || "Unknown"} · {formatDate(query.createdAt)}
                        </p>
                        <span className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500 ring-1 ring-gray-200">
                          {STATUS_LABEL[query.status]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {selected ? (
          <ReviewEditor key={selected._id} query={selected} onReviewed={onReviewed} />
        ) : (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400">
            Pick a query to write a review.
          </div>
        )}
      </div>
    </section>
  );
};

export default WriteReview;
