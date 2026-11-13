import React from "react";
import { CalendarDays, ExternalLink, UsersRound } from "lucide-react";

type MeetingPerson = { _id: string; firstName: string; lastName: string };
type MeetingEntry = {
  _id: string;
  title: string;
  startTime: string;
  endTime?: string | null;
  durationMin?: number;
  meetingLink?: string;
  status: string;
  organizer?: MeetingPerson;
  participants?: MeetingPerson[];
  expectedDuration?: number;
  expectedEndAt?: string | null;
  actualDuration?: number;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
};

function formatRange(start: string, end?: string | null) {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  const startStr = new Date(start).toLocaleTimeString([], opts);
  if (!end) return startStr;
  return `${startStr} - ${new Date(end).toLocaleTimeString([], opts)}`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

const DISPLAY = "font-['Bricolage_Grotesque',sans-serif]";

function statusStyle(status: string) {
  switch (status) {
    case "ended":
      return "bg-[#E6F5F2] text-[#0E9F8B]";
    case "active":
      return "bg-[#EEEBFA] text-[#6A55D6]";
    case "cancelled":
      return "bg-[#FCE8E8] text-[#E4484D]";
    default:
      return "bg-amber-50 text-amber-600";
  }
}

const MeetingSummary: React.FC<{ meetings?: MeetingEntry[]; loading?: boolean }> = ({
  meetings,
  loading,
}) => {
  const items = meetings ?? [];

  return (
    <section aria-label="Meeting summary" className="flex h-[520px] flex-col rounded-[18px] border border-[#DCE2E8] bg-white px-5 pb-6 pt-5">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <UsersRound size={18} className="text-[#6A55D6]" />

          <h3 className={`${DISPLAY} text-[17px] font-bold`}>Meeting summary</h3>
        </div>
      </div>

      {/* Meetings */}
      {/* flex-1 + min-h-0: the list takes only the space left under the header,
          so it scrolls inside the card instead of spilling past it */}
      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pr-5 [scrollbar-gutter:stable]">
        {loading ? (
          <p className="text-sm text-[#667385]">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[#667385]">No meetings scheduled.</p>
        ) : (
          items.map((meeting) => {
            const names = (meeting.participants ?? [])
              .map((p) => `${p.firstName} ${p.lastName}`)
              .join(", ");
            return (
              <div
                key={meeting._id}
                className="flex gap-4 border-b border-[#E9EEF3] pb-4 last:border-b-0 last:pb-0"
              >
                {/* Calendar Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEEBFA] text-[#6A55D6]">
                  <CalendarDays size={18} />
                </div>

                {/* Meeting Information */}
                <div className="min-w-0 flex-1">
                  {/* Status + Time */}
                  <div className="flex items-center gap-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyle(meeting.status)}`}>
                      {meeting.status}
                    </span>

                    <span className="text-xs text-[#667385]">
                      {formatRange(meeting.startTime, meeting.endTime)}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="mt-2 text-sm font-semibold">
                    {meeting.title}
                  </p>

                  {/* Participants */}
                  {names && (
                    <p className="mt-1 text-xs text-[#667385]">
                      With {names}
                    </p>
                  )}

                  {/* Expected duration + window */}
                  {meeting.expectedDuration ? (
                    <p className="mt-1 text-sm font-medium text-[#667385]">
                      Expected duration: {meeting.expectedDuration} min
                      {meeting.expectedEndAt && meeting.actualStartedAt
                        ? ` (${formatRange(meeting.actualStartedAt, meeting.expectedEndAt)})`
                        : ""}
                    </p>
                  ) : meeting.durationMin ? (
                    <p className="mt-1 text-sm font-medium text-[#667385]">
                      Duration: {meeting.durationMin} min
                    </p>
                  ) : null}

                  {/* Actual duration (after meeting ends) */}
                  {meeting.status === "ended" && meeting.actualDuration != null && (
                    <p className="mt-1 text-sm font-medium text-[#0E9F8B]">
                      Actual duration: {formatDuration(meeting.actualDuration)}
                    </p>
                  )}

                  {/* Join link */}
                  {meeting.meetingLink ? (
                    <a
                      href={meeting.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#6A55D6] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-[#5a47bd]"
                    >
                      <ExternalLink size={13} />
                      Join meeting
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

export default MeetingSummary;
