import { Schema, model, type InferSchemaType } from "mongoose";

export const QUERY_STATUSES = ["open", "in_review", "resolved", "raised_again"] as const;
export type QueryStatus = (typeof QUERY_STATUSES)[number];

const QuerySchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },

    message: { type: String, required: [true, "Message is required."], trim: true, maxlength: 4000 },

    // POST /queries/:id/review carries `status` alongside the review text, so
    // status transitions happen through review writes rather than a PATCH.
    status: { type: String, enum: QUERY_STATUSES, default: "open", index: true },
    review: { type: String, default: "", trim: true, maxlength: 4000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    reviewedAt: { type: Date, default: null },

    // Set when status goes back to raised_again, so the UI can flag repeats.
    raisedAgainCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

QuerySchema.index({ employee: 1, createdAt: -1 });

export type QueryAttrs = InferSchemaType<typeof QuerySchema>;

export const Query = model("Query", QuerySchema);
export default Query;