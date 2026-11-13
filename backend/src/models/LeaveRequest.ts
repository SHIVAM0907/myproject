import { Schema, model, type InferSchemaType } from "mongoose";
import { LEAVE_TYPES } from "./Employee.js";

export const LEAVE_STATUSES = ["draft", "pending", "approved", "rejected", "cancelled"] as const;
export const DAY_TYPES = ["full_day", "first_half", "second_half"] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export type DayType = (typeof DAY_TYPES)[number];

const LeaveRequestSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },

    leaveType: { type: String, enum: LEAVE_TYPES, required: true },
    dayType: { type: String, enum: DAY_TYPES, default: "full_day" },

    // Stored as local-midnight Date, matching the "YYYY-MM-DD" the form posts.
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },

    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, default: "", trim: true, maxlength: 2000 },
    contactWhileOnLeave: { type: String, default: "", trim: true },

    /**
     * `NewLeaveRequestForm` sends `[fileName]` (a raw filename), while task
     * attachments send real R2 keys. Both are accepted so the inconsistent
     * client payloads both survive a round trip.
     */
    attachments: { type: [String], default: [] },

    status: { type: String, enum: LEAVE_STATUSES, default: "pending", index: true },

    reviewedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    reviewNote: { type: String, default: "" },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

LeaveRequestSchema.index({ employee: 1, status: 1 });
LeaveRequestSchema.index({ fromDate: 1, toDate: 1 });

export type LeaveRequestAttrs = InferSchemaType<typeof LeaveRequestSchema>;

export const LeaveRequest = model("LeaveRequest", LeaveRequestSchema);
export default LeaveRequest;