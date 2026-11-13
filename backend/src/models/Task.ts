import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Note the deliberate casing: the frontend's TaskStatus is Title Case
 * ("Not Started"), unlike every other status union in the codebase which is
 * snake_case. AssignTaskForm hardcodes `status: "Not Started"`, so these exact
 * strings are the wire contract.
 */
export const TASK_STATUSES = ["Not Started", "In Progress", "On Hold", "Pending", "Completed"] as const;
export const PRIORITIES = ["High", "Medium", "Low"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

const TaskSchema = new Schema(
  {
    taskId: { type: String, required: true, unique: true, trim: true },

    title: { type: String, required: [true, "Title is required."], trim: true },
    description: { type: String, default: "", trim: true, maxlength: 4000 },

    assignedTo: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "Employee", default: null },

    dueDate: { type: Date, default: null, index: true },

    priority: { type: String, enum: PRIORITIES, default: "Medium" },
    status: { type: String, enum: TASK_STATUSES, default: "Not Started", index: true },

    // Real R2 keys from AssignTaskForm (unlike leave attachments).
    attachments: { type: [String], default: [] },

    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ assignedTo: 1, dueDate: 1 });

export type TaskAttrs = InferSchemaType<typeof TaskSchema>;

const TASK_ID_PREFIX = "TASK-";

/**
 * Next sequential task code, e.g. `TASK-0007`.
 *
 * This used to be `TASK-${Date.now().toString(36).toUpperCase()}`, which was
 * wrong in three ways:
 *
 * - **Base36 covers the whole alphabet**, so it emits `I`, `L`, `O`, `S`, `B` and
 *   `Z` alongside `1`, `0`, `5`, `8`, `2`. `TASK-MUTIBLPE` is genuinely
 *   ambiguous to read aloud or transcribe, which is the whole point of an id
 *   that appears in a UI, a URL and a support ticket.
 * - **It leaked the creation timestamp** (base36 of epoch milliseconds decodes
 *   straight back to a date) and did not sort as a sequence.
 * - **Two tasks created in the same millisecond collided** on the unique index,
 *   and unlike the employee-code path there was no retry, so it surfaced as a
 *   500 rather than a second attempt.
 *
 * The maximum is computed NUMERICALLY in the database, not by sorting the code
 * strings, so mixed-width codes cannot make the probe stall. Legacy base36 ids
 * survive this: `$toInt` of a non-numeric tail such as `MUTIBLPE` is null, and
 * `$max` ignores nulls, so they are skipped instead of breaking the sequence.
 *
 * `taskId` is uniquely indexed, so two concurrent creates can still pick the
 * same candidate; the caller retries on 11000.
 */
export async function nextTaskId(): Promise<string> {
  const rows = await Task.aggregate<{ max: number | null }>([
    { $match: { taskId: new RegExp(`^${TASK_ID_PREFIX}\\d+$`) } },
    {
      $project: {
        n: {
          $toInt: {
            $substrBytes: [{ $ifNull: ["$taskId", ""] }, TASK_ID_PREFIX.length, 20],
          },
        },
      },
    },
    { $group: { _id: null, max: { $max: "$n" } } },
  ]);

  const highest = rows[0]?.max ?? 0;
  return `${TASK_ID_PREFIX}${String((typeof highest === "number" ? highest : 0) + 1).padStart(4, "0")}`;
}

export const Task = model("Task", TaskSchema);
export default Task;