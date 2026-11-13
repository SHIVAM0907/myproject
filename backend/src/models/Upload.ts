import { Schema, model } from "mongoose";

/**
 * P3 — persisted upload metadata.
 *
 * Before this collection existed the API trusted whatever key the client sent
 * to get-file-url / delete-file, so any authenticated employee could read or
 * destroy every other user's files. Every upload now lands here with an owner,
 * a purpose and a validated content type, and all file operations resolve the
 * key through this record first.
 */
const UploadSchema = new Schema(
  {
    // Storage key ("managers/<uuid>.png", "tasks/attachments/...", ...).
    key: { type: String, required: true, unique: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    // Why the file was uploaded: "profile" | "task_attachment".
    purpose: { type: String, required: true, enum: ["profile", "task_attachment"] },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    // "r2" | "local" — which backend actually holds the bytes.
    provider: { type: String, required: true, enum: ["r2", "local"] },
    sha256: { type: String, default: "" },
    scanStatus: {
      // Malware-scan integration point. "unscanned" is the DEFAULT and an
      // honest one: unless a scanner is explicitly configured and reports
      // clean, the file is never described as clean.
      type: String,
      enum: ["unscanned", "pending", "clean", "infected"],
      default: "unscanned",
    },
  },
  { timestamps: true },
);

UploadSchema.index({ ownerId: 1, purpose: 1 });

export interface UploadDoc {
  _id: unknown;
  key: string;
  ownerId: unknown;
  purpose: "profile" | "task_attachment";
  contentType: string;
  size: number;
  provider: "r2" | "local";
  sha256: string;
  scanStatus: "unscanned" | "pending" | "clean" | "infected";
  createdAt: Date;
}

export const Upload = model("Upload", UploadSchema);
export default Upload;
