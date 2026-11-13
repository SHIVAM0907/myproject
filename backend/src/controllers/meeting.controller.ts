import { Router, type Response } from "express";
import { body, param, query } from "express-validator";
import { Types } from "mongoose";
import { Meeting } from "../models/Meeting.js";
import { Employee } from "../models/Employee.js";
import { Attendance } from "../models/Attendance.js";
import { requireEmployee, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayKey, minutesBetween } from "../utils/date.js";
import { MANAGER_FIELDS, serializeDirectoryEntry } from "../utils/serialize.js";
import { PERSON_FIELDS, isObjectId } from "./task.controller.js";

const router = Router();

const PARTICIPANT_FIELDS = MANAGER_FIELDS;

function serializeMeeting(doc: unknown) {
  const m = doc as {
    _id: unknown;
    title: string;
    meetingLink?: string | null;
    participants?: unknown[];
    startTime: Date;
    endTime?: Date | null;
    durationMin?: number | null;
    status: string;
    actualStartedAt?: Date | null;
    actualEndedAt?: Date | null;
    actualDuration?: number | null;
  };

  const start = m.startTime ? new Date(m.startTime) : null;
  const end = m.endTime ? new Date(m.endTime) : null;
  const duration = m.durationMin ?? (start && end ? minutesBetween(start, end) : null);

  return {
    _id: String(m._id),
    title: m.title,
    meetingLink: m.meetingLink ?? null,
    participants: (m.participants ?? []).map((p) => {
      const person = p as { _id?: unknown; firstName?: string; lastName?: string; employeeCode?: string };
      if (!person || typeof person !== "object" || !("firstName" in person)) {
        return { _id: String(p) };
      }
      return {
        _id: String(person._id),
        firstName: person.firstName ?? "",
        lastName: person.lastName ?? "",
        ...(person.employeeCode ? { employeeCode: person.employeeCode } : {}),
      };
    }),
    startTime: start ? start.toISOString() : null,
    endTime: end ? end.toISOString() : null,
    durationMin: duration,
    status: m.status,
    actualStartedAt: m.actualStartedAt ? new Date(m.actualStartedAt).toISOString() : null,
    actualEndedAt: m.actualEndedAt ? new Date(m.actualEndedAt).toISOString() : null,
    // The form sends neither `expectedDuration` nor `expectedEndAt`, so both are
    // derived from the planned start + duration.
    expectedDuration: duration,
    expectedEndAt: end ? end.toISOString() : start ? start.toISOString() : null,
    actualDuration: m.actualDuration ?? null,
  };
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObjectId).map(String);
}

/**
 * GET /team/available — shared projection used by both My-employee (assigning)
 * and MeetingDialog (inviting). `inTeam` marks people who already report to the
 * caller, and the key is `employees` here versus `members` on /team.
 */
router.get(
  "/team/available",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = currentUserId(req);
    const requester = await Employee.findById(requesterId).lean();
    if (!requester) throw ApiError.notFound("Your account could not be found.");

    const people = await Employee.find({
      "job.isActive": { $ne: false },
      "job.status": { $nin: ["terminated", "inactive"] },
    })
      .select(PERSON_FIELDS + " manager job.joinDate job.status job.isActive profile.imageUrl")
      .lean<Array<Record<string, unknown>>>();

    const visible = people.filter((p) => String(p._id) !== String(requesterId));

    res.json({
      employees: visible.map((p) =>
        serializeDirectoryEntry(p, String(p.manager ?? "") === String(requesterId)),
      ),
    });
  }),
);

/**
 * GET /colleagues — the people the current employee may invite: their own team
 * plus their own manager. Note the extra `isManager` flag and the absence of
 * `inTeam`.
 */
router.get(
  "/colleagues",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const requesterId = currentUserId(req);
    const requester = await Employee.findById(requesterId).lean();
    if (!requester) throw ApiError.notFound("Your account could not be found.");

    const filter =
      requester.role === "manager"
        ? { manager: requesterId, _id: { $ne: requesterId } }
        : {
            $or: [
              { manager: requesterId },
              { _id: requester.manager ?? null },
            ],
            _id: { $ne: requesterId },
          };

    const colleagues = await Employee.find(filter)
      .select(PERSON_FIELDS + " manager job.joinDate")
      .lean<Array<Record<string, unknown>>>();

    res.json({
      colleagues: colleagues.map((p) => serializeDirectoryEntry(p)),
    });
  }),
);

/**
 * GET /meetings/active — the caller's currently-running meeting, or null.
 * MeetingDialog calls `res.data?.meeting ?? null`.
 */
router.get(
  "/meetings/active",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = currentUserId(req);
    const now = new Date();

    const meeting = await Meeting.findOne({
      $or: [{ createdBy: userId }, { participants: userId }],
      status: { $in: ["active", "scheduled"] },
      startTime: { $lte: now },
    })
      .sort({ startTime: 1 })
      .populate("participants", PARTICIPANT_FIELDS);

    res.json({ meeting: meeting ? serializeMeeting(meeting) : null });
  }),
);

/**
 * GET /meetings?upcoming=true
 *
 * MeetingDialog pre-fetches with `upcoming=true` to dedupe by
 * `status === "scheduled" && title === <trimmed title>`. Note it indexes
 * `existingRes.data.meetings?.find(...)` without a null guard, so `meetings`
 * must always be an array.
 */
router.get(
  "/meetings",
  validate([query("upcoming").optional().isIn(["true", "false", "1", "0"])]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = currentUserId(req);
    const now = new Date();
    const upcoming = String(req.query.upcoming ?? "") === "true";

    const filter: Record<string, unknown> = {
      $or: [{ createdBy: userId }, { participants: userId }],
      status: { $ne: "cancelled" },
    };
    if (upcoming) filter.startTime = { $gte: now };

    const meetings = await Meeting.find(filter)
      .populate("participants", PARTICIPANT_FIELDS)
      .sort({ startTime: upcoming ? 1 : -1 })
      .limit(100);

    res.json({ meetings: meetings.map(serializeMeeting) });
  }),
);

/** POST /meetings — `participants` is an array of user id strings. */
router.post(
  "/meetings",
  validate([
    body("title").isString().trim().notEmpty().withMessage("Title is required.").isLength({ max: 300 }),
    body("meetingLink").optional({ values: "falsy" }).isString().trim().isURL().withMessage("Meeting link must be a valid URL."),
    body("participants").optional().isArray().withMessage("Participants must be an array."),
    body("startTime").isISO8601().withMessage("Start time must be a valid date."),
    body("durationMin").optional({ values: "falsy" }).isInt({ min: 1, max: 1440 }).withMessage("Duration must be between 1 and 1440 minutes."),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const creatorId = currentUserId(req);
    const payload = req.body as {
      title: string;
      meetingLink?: string;
      participants?: unknown[];
      startTime: string;
      durationMin?: number;
      endTime?: string;
    };

    const participantIds = normalizeIds(payload.participants);
    const invited = participantIds.filter((id) => id !== String(creatorId));

    const meeting = await Meeting.create({
      title: payload.title.trim(),
      meetingLink: payload.meetingLink ?? null,
      createdBy: creatorId,
      participants: invited,
      startTime: new Date(payload.startTime),
      endTime: payload.endTime
        ? new Date(payload.endTime)
        : payload.durationMin
          ? new Date(new Date(payload.startTime).getTime() + payload.durationMin * 60_000)
          : null,
      durationMin: payload.durationMin ?? null,
      status: "scheduled",
    });

    const populated = await Meeting.findById(meeting._id).populate(
      "participants",
      PARTICIPANT_FIELDS,
    );
    res.status(201).json({ meeting: serializeMeeting(populated) });
  }),
);

/** POST /meetings/:id/start — also flips the caller to `on_call`. */
router.post(
  "/meetings/:id/start",
  validate([param("id").isMongoId().withMessage("A valid meeting id is required.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = currentUserId(req);
    const meetingId = req.params.id as string;

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw ApiError.notFound("That meeting no longer exists.");

    const mayControl =
      String(meeting.createdBy) === String(userId) ||
      meeting.participants.some((p) => String(p) === String(userId)) ||
      req.auth?.role === "manager";
    if (!mayControl) throw ApiError.forbidden("You are not part of that meeting.");

    const now = new Date();
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      throw ApiError.conflict(`That meeting has already ${meeting.status}.`);
    }

    meeting.status = "active";
    meeting.actualStartedAt = meeting.actualStartedAt ?? now;
    meeting.startTime = meeting.startTime ?? now;
    if (!meeting.endTime) {
      meeting.endTime = new Date(
        now.getTime() + (meeting.durationMin ?? 60) * 60_000,
      );
    }
    await meeting.save();

    await setOnCall(meeting, true);

    const populated = await Meeting.findById(meeting._id).populate(
      "participants",
      PARTICIPANT_FIELDS,
    );
    res.json({ meeting: serializeMeeting(populated) });
  }),
);

/** POST /meetings/:id/end — clears on-call for every participant. */
router.post(
  "/meetings/:id/end",
  validate([param("id").isMongoId().withMessage("A valid meeting id is required.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const meetingId = req.params.id as string;
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) throw ApiError.notFound("That meeting no longer exists.");

    const now = new Date();
    meeting.status = "ended";
    meeting.actualEndedAt = now;
    meeting.actualDuration = meeting.actualStartedAt
      ? minutesBetween(meeting.actualStartedAt, now)
      : null;
    await meeting.save();

    await setOnCall(meeting, false);

    res.json({ message: "Meeting ended." });
  }),
);

/** Mirrors `on_call` onto today's attendance rows for each participant. */
async function setOnCall(meeting: InstanceType<typeof Meeting>, active: boolean): Promise<void> {
  const attendeeIds = [meeting.createdBy, ...meeting.participants].filter(Boolean);
  if (attendeeIds.length === 0) return;

  if (active) {
    await Attendance.updateMany(
      { employee: { $in: attendeeIds }, dayKey: dayKey(), checkOut: null },
      { $set: { status: "on_call" } },
    );
    return;
  }

  // Only revert rows we actually flipped: anything already punched out or on a
  // break, or late, keeps its own status.
  await Attendance.updateMany(
    { employee: { $in: attendeeIds }, dayKey: dayKey(), status: "on_call" },
    { $set: { status: "present" } },
  );
}

export { serializeMeeting };
export default router;