import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * `admin` is the platform-realm role: it is the only one that can sign in at
 * /admin/login and reach /api/admin. It is deliberately NOT a superset of
 * `manager` — the two are separate realms, so a manager running the team
 * dashboards cannot approve accounts or reach the admin console. The employee
 * realm treats an admin as an ordinary employee: every elevation there is an
 * explicit `role === "manager"` check, never "not an employee".
 */
export const EMPLOYEE_ROLES = ["employee", "manager", "admin"] as const;
export const LEAVE_TYPES = ["casual", "sick", "earned", "unpaid"] as const;
export const JOB_STATUSES = ["active", "on_leave", "terminated", "inactive"] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
export type LeaveType = (typeof LEAVE_TYPES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];

const LeaveBalanceSchema = new Schema(
  {
    total: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const JobSchema = new Schema(
  {
    joinDate: { type: Date, default: null },
    status: { type: String, enum: JOB_STATUSES, default: "active" },
    isActive: { type: Boolean, default: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
  },
  { _id: false },
);

const ProfileSchema = new Schema(
  {
    bio: { type: String, default: "", trim: true, maxlength: 1000 },
    imageUrl: { type: String, default: "", trim: true },
    skills: { type: [String], default: [] },
  },
  { _id: false },
);

const EmployeeSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required."],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    firstName: { type: String, required: [true, "First name is required."], trim: true },
    lastName: { type: String, required: [true, "Last name is required."], trim: true },
    employeeCode: { type: String, required: true, unique: true, trim: true, uppercase: true },
    role: { type: String, enum: EMPLOYEE_ROLES, default: "employee", index: true },
    phone: { type: String, default: "", trim: true },
    department: { type: String, default: "", trim: true },
    designation: { type: String, default: "", trim: true },
    manager: { type: Schema.Types.ObjectId, ref: "Employee", default: null, index: true },
    job: { type: JobSchema, default: () => ({}) },
    profile: { type: ProfileSchema, default: () => ({}) },
    personal: {
      dateOfBirth: { type: Date, default: null },
      gender: { type: String, default: "" },
      address: { type: String, default: "" },
      emergencyContact: { type: String, default: "" },
    },
    /**
     * P5 — server-side session invalidation. Tokens embed the tokenVersion
     * they were minted with; bumping this number rejects every older token
     * (logout, logout-all, password change, suspension).
     */
    tokenVersion: { type: Number, default: 0, select: false },
    leaveBalances: {
      type: Map,
      of: LeaveBalanceSchema,
      default: () => ({
        casual: { total: 12, used: 0 },
        sick: { total: 10, used: 0 },
        earned: { total: 15, used: 0 },
        unpaid: { total: 0, used: 0 },
      }),
    },
  },
  { timestamps: true },
);

EmployeeSchema.index({ firstName: "text", lastName: "text", employeeCode: "text", email: "text" });

EmployeeSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

EmployeeSchema.methods.comparePassword = function comparePassword(candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

EmployeeSchema.virtual("fullName").get(function fullName(): string {
  return `${this.firstName} ${this.lastName}`.trim();
});

EmployeeSchema.set("toJSON", { virtuals: true });

export type EmployeeAttrs = InferSchemaType<typeof EmployeeSchema>;
export type EmployeeDoc = HydratedDocument<EmployeeAttrs> & {
  comparePassword(candidate: string): Promise<boolean>;
  fullName: string;
};

export const Employee = model("Employee", EmployeeSchema);
export default Employee;

/**
 * `findById(...).select("+password")` returns an inferred document type that
 * omits the schema's instance methods, so these wrappers narrow to
 * `EmployeeDoc` to keep `comparePassword` typed at call sites.
 */
export async function findByIdWithPassword(id: string): Promise<EmployeeDoc | null> {
  return (await Employee.findById(id).select("+password")) as unknown as EmployeeDoc | null;
}

/** Loads an employee with password AND tokenVersion for auth paths. */
export async function findByIdForAuth(id: string): Promise<(EmployeeDoc & { tokenVersion: number }) | null> {
  return (await Employee.findById(id).select("+password +tokenVersion")) as unknown as (
    EmployeeDoc & { tokenVersion: number }
  ) | null;
}

/** Atomically bumps tokenVersion; returns the new value (or null if no user). */
export async function bumpTokenVersion(id: string): Promise<number | null> {
  const doc = await Employee.findByIdAndUpdate(
    id,
    { $inc: { tokenVersion: 1 } },
    { new: true, select: "+tokenVersion" },
  );
  return doc ? ((doc as unknown as { tokenVersion: number }).tokenVersion ?? 0) : null;
}

export async function findByEmailWithPassword(email: string): Promise<EmployeeDoc | null> {
  return (await Employee.findOne({ email: email.toLowerCase() }).select(
    "+password",
  )) as unknown as EmployeeDoc | null;
}

/**
 * Code prefix per role, so an account's identifier states what it is.
 *
 * Each prefix has its own sequence: promoting the only two managers to
 * employee does not renumber anybody's `EMP-` code, and the seeded
 * `ADM-001` admin means the first promoted admin becomes `ADM-002`.
 *
 * The seeded platform admin already uses a fixed `ADM-001` rather than an
 * allocated code, which is what made a per-role sequence the natural reading.
 */
export const ROLE_CODE_PREFIX: Record<EmployeeRole, string> = {
  employee: "EMP-",
  manager: "MGR-",
  admin: "ADM-",
};

/**
 * Next sequential employee code for a role, e.g. `EMP-0007`, `MGR-0001`.
 *
 * The maximum is computed NUMERICALLY in the database, not by sorting the code
 * strings: seeded rows use 3-digit codes (`EMP-004`) while generated ones are
 * 4-digit (`EMP-0005`), and a lexicographic sort ranks "EMP-005" above
 * "EMP-0005". That would make the probe keep returning an already-taken code
 * forever. `$toInt` yields null for a non-numeric tail, which `$max` ignores,
 * so hand-entered codes like `MANAGER-1` are skipped rather than breaking it.
 *
 * Only codes carrying this role's own prefix are considered, so the sequences
 * are independent.
 *
 * `employeeCode` carries a unique index, so two concurrent inserts can still
 * pick the same candidate; callers retry on 11000.
 */
export async function nextEmployeeCode(role: EmployeeRole = "employee"): Promise<string> {
  const prefix = ROLE_CODE_PREFIX[role] ?? ROLE_CODE_PREFIX.employee;
  const rows = await Employee.aggregate<{ max: number | null }>([
    { $match: { employeeCode: new RegExp(`^${prefix}\\d+$`) } },
    {
      $project: {
        n: { $toInt: { $substrBytes: [{ $ifNull: ["$employeeCode", ""] }, prefix.length, 20] } },
      },
    },
    { $group: { _id: null, max: { $max: "$n" } } },
  ]);

  const highest = rows[0]?.max ?? 0;
  return `${prefix}${String((typeof highest === "number" ? highest : 0) + 1).padStart(4, "0")}`;
}