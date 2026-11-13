import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
  "on_break",
  "on_call",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const AttendanceSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },

    // Local calendar day this record describes, "YYYY-MM-DD".
    dayKey: { type: String, required: true },

    status: { type: String, enum: ATTENDANCE_STATUSES, default: "present", index: true },

    checkIn: { type: Date, default: null },
    checkOut: { type: Date, default: null },
    breakStart: { type: Date, default: null },

    breakMinutes: { type: Number, default: 0, min: 0 },
    workingMinutes: { type: Number, default: 0, min: 0 },
    overtimeMinutes: { type: Number, default: 0, min: 0 },

    // Minutes the employee was late by, relative to the configured shift start.
    lateMinutes: { type: Number, default: 0, min: 0 },

    // Set when the day's absence is explained by approved leave.
    leaveType: { type: String, default: null },
    leaveRequest: { type: Schema.Types.ObjectId, ref: "LeaveRequest", default: null },

    // Minutes to bill as work time for a half day.
    halfDayMinutes: { type: Number, default: null },

    notes: { type: String, default: "" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
  },
  { timestamps: true },
);

// One record per employee per day: check-in must upsert, not duplicate.
AttendanceSchema.index({ employee: 1, dayKey: 1 }, { unique: true });
AttendanceSchema.index({ dayKey: 1, status: 1 });

export type AttendanceAttrs = InferSchemaType<typeof AttendanceSchema>;
export type AttendanceDoc = HydratedDocument<AttendanceAttrs>;

export const Attendance = model("Attendance", AttendanceSchema);
export default Attendance;