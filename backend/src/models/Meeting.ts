import { Schema, model, type InferSchemaType } from "mongoose";

export const MEETING_STATUSES = ["scheduled", "active", "ended", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

const MeetingSchema = new Schema(
  {
    title: { type: String, required: [true, "Title is required."], trim: true },
    meetingLink: { type: String, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    participants: [{ type: Schema.Types.ObjectId, ref: "Employee" }],

    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, default: null },

    durationMin: { type: Number, default: null, min: 0 },

    status: { type: String, enum: MEETING_STATUSES, default: "scheduled", index: true },

    actualStartedAt: { type: Date, default: null },
    actualEndedAt: { type: Date, default: null },
    actualDuration: { type: Number, default: null },
  },
  { timestamps: true },
);

MeetingSchema.index({ status: 1, startTime: 1 });

export type MeetingAttrs = InferSchemaType<typeof MeetingSchema>;

export const Meeting = model("Meeting", MeetingSchema);
export default Meeting;