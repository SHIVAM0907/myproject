import { Router, type Response } from "express";
import { body, param, query } from "express-validator";
import { Types } from "mongoose";
import { Employee, nextEmployeeCode } from "../models/Employee.js";
import { Attendance } from "../models/Attendance.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { Task } from "../models/Task.js";
import { Query } from "../models/Query.js";
import { Meeting } from "../models/Meeting.js";
import { env } from "../config/env.js";
import { requirePlatform, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { MANAGER_FIELDS, serializeEmployee } from "../utils/serialize.js";
import { JOB_STATUSES, EMPLOYEE_ROLES, type JobStatus, type EmployeeRole } from "../models/Employee.js";

const router = Router();

/**
 * Admin/HR endpoints in the platform realm, mounted at /api/admin.
 *
 * These exist because signup creates accounts that cannot sign in until someone
 * with platform access approves them, and `frontend/src/types/Employee.ts`
 * already documents `AdminEmployeeListResponse` / `AdminEmployeeDetail` for
 * exactly these routes.
 *
 * There is no admin UI in the frontend yet, so day-to-day approval is also
 * possible from the terminal: `npm run employees -- list|approve|status`.
 */
router.use(requirePlatform);

/**
 * Resolves a `manager` value from a request body to a storable ObjectId.
 *
 * Returns `undefined` when the field was not supplied, so callers can tell
 * "leave the reports-to alone" apart from "clear it". It enforces that the
 * target is genuinely an active manager: `/api/employee/team` builds the team
 * from the accounts whose `manager` points at a role-"manager" record, so
 * pointing at anyone else would file the employee under a manager who never
 * sees them.
 */
async function resolveManager(
  value: unknown,
  selfId: string,
): Promise<Types.ObjectId | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const id = String(value);
  if (id === selfId) throw ApiError.badRequest("An account cannot report to themselves.");

  const manager = await Employee.findById(id).select("role job");
  if (!manager) throw ApiError.badRequest("The selected manager no longer exists.");
  if (manager.role !== "manager") {
    throw ApiError.badRequest("Reports-to must be someone with the manager role.");
  }
  if (manager.job?.status === "terminated" || manager.job?.isActive === false) {
    throw ApiError.badRequest("The selected manager is not an active account.");
  }
  return new Types.ObjectId(id);
}

/**
 * GET /api/admin/managers -> the accounts that can be assigned as reports-to.
 *
 * A dedicated endpoint rather than a client-side filter over the directory: the
 * directory is paginated and filtered, so a manager on page 3 would be missing
 * from a dropdown built from whatever the table happens to be showing.
 */
router.get(
  "/managers",
  asyncHandler(async (_req, res: Response) => {
    const managers = await Employee.find({ role: "manager", "job.isActive": { $ne: false } })
      .select("firstName lastName employeeCode department job")
      .sort({ firstName: 1, lastName: 1 })
      .limit(500);

    res.json({
      managers: managers.map((m) => ({
        _id: String(m._id),
        firstName: m.firstName,
        lastName: m.lastName,
        employeeCode: m.employeeCode,
        department: m.department ?? "",
        job: { status: m.job?.status ?? "active", isActive: m.job?.isActive ?? true },
      })),
      total: managers.length,
    });
  }),
);

/**
 * GET /api/admin/employees?search=&status=&department=&role=&page=&limit=
 *   -> { employees, total, page, limit, totalPages }
 */
router.get(
  "/employees",
  validate([
    query("search").optional({ values: "falsy" }).isString().trim().isLength({ max: 120 }),
    query("status").optional({ values: "falsy" }).isString().trim(),
    query("department").optional({ values: "falsy" }).isString().trim(),
    query("role").optional({ values: "falsy" }).isString().trim(),
    query("page").optional({ values: "falsy" }).isInt({ min: 1 }),
    query("limit").optional({ values: "falsy" }).isInt({ min: 1, max: 100 }),
  ]),
  asyncHandler(async (req, res: Response) => {
    const { search, status, department, role } = req.query as Record<string, string | undefined>;
    const page = Number.parseInt(String(req.query.page ?? "1"), 10) || 1;
    const limit = Number.parseInt(String(req.query.limit ?? "20"), 10) || 20;

    if (status && !JOB_STATUSES.includes(status as JobStatus)) {
      throw ApiError.badRequest(`status must be one of: ${JOB_STATUSES.join(", ")}.`);
    }

    const filter: Record<string, unknown> = {};
    if (status) filter["job.status"] = status;
    if (department) filter.department = department;
    if (role) filter.role = role;
    if (search) {
      // `email` is a plain string field here, not a text index member that
      // $text can reach, so match the fields individually to keep the search
      // predictable rather than relying on Atlas search.
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }, { employeeCode: rx }];
    }

    const [total, employees] = await Promise.all([
      Employee.countDocuments(filter),
      Employee.find(filter)
        .populate("manager", MANAGER_FIELDS)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      employees: employees.map((e) => serializeEmployee(e as never)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/** GET /api/admin/employees/pending -> the self-registered, not-yet-approved accounts. */
router.get(
  "/employees/pending",
  asyncHandler(async (_req, res: Response) => {
    const pending = await Employee.find({ "job.status": "inactive" })
      .populate("manager", MANAGER_FIELDS)
      .sort({ createdAt: 1 })
      .limit(200);
    res.json({
      employees: pending.map((e) => serializeEmployee(e as never)),
      total: pending.length,
    });
  }),
);

/**
 * POST /api/admin/employees -> create an employee, manager or admin outright.
 *
 * Unlike /api/auth/register, which forces role "employee" and status "inactive"
 * because it is unauthenticated, this is behind `requirePlatform`, so the
 * caller chooses the role and whether the account starts usable. Default is
 * active: someone an administrator created by hand is meant to sign in.
 */
/**
 * Allocate a fresh code for a role, skipping any code the target row already
 * holds.
 *
 * `nextEmployeeCode` hands back the highest code in the sequence plus one. After
 * a manager is demoted, their own retired `EMP-0007` is still the highest in
 * the EMP- sequence, so the naive call would propose the very code being
 * replaced. Excluding this row keeps the re-issue from colliding with itself.
 */
async function reissueCode(role: EmployeeRole, currentId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await nextEmployeeCode(role);
    const takenElsewhere = await Employee.exists({
      employeeCode: candidate,
      _id: { $ne: currentId },
    });
    if (!takenElsewhere) return candidate;
  }
  throw ApiError.conflict("Could not allocate a new employee code. Please try again.");
}

router.post(
  "/employees",
  validate([
    body("firstName")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("First name is required.")
      .isLength({ max: 80 }),
    body("lastName")
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Last name is required.")
      .isLength({ max: 80 }),
    body("email").isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
    // Same rules as signup, so an account created here and one created through
    // the public form are never differently constrained.
    body("password")
      .isString()
      .withMessage("Password is required.")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters.")
      .matches(/[A-Za-z]/)
      .withMessage("Password must contain a letter.")
      .matches(/\d/)
      .withMessage("Password must contain a number."),
    body("role").optional({ values: "falsy" }).isString().trim(),
    body("status").optional({ values: "falsy" }).isString().trim(),
    body("phone").optional({ values: "falsy" }).isString().trim().isLength({ max: 32 }),
    body("department").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
    body("designation").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
    body("manager").optional({ values: "null" }).isMongoId().withMessage("Select a valid manager."),
    body("jobStatus").optional({ values: "falsy" }).isISO8601(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      department,
      designation,
      jobStatus,
    } = req.body as {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      role?: string;
      status?: string;
      phone?: string;
      department?: string;
      designation?: string;
      manager?: string | null;
      jobStatus?: string;
    };

    const role = req.body.role ?? "employee";
    const status = req.body.status ?? "active";

    if (!EMPLOYEE_ROLES.includes(role as EmployeeRole)) {
      throw ApiError.badRequest(`role must be one of: ${EMPLOYEE_ROLES.join(", ")}.`);
    }
    if (!JOB_STATUSES.includes(status as JobStatus)) {
      throw ApiError.badRequest(`status must be one of: ${JOB_STATUSES.join(", ")}.`);
    }

    const normalizedEmail = email.toLowerCase();
    if (await Employee.exists({ email: normalizedEmail })) {
      throw ApiError.conflict("An account with that email already exists.");
    }

    const managerId = await resolveManager(req.body.manager, "");
    const joinDate = jobStatus ? new Date(jobStatus) : new Date();

    // `nextEmployeeCode` probes for the highest code, so two creates landing at
    // once can pick the same one and the unique index rejects the loser.
    let employee: (Awaited<ReturnType<typeof Employee.create>>)[number] | null = null;
    for (let attempt = 0; attempt < 5 && !employee; attempt += 1) {
      try {
        employee = await Employee.create({
          firstName,
          lastName,
          email: normalizedEmail,
          password,
          phone: phone ?? "",
          department: department ?? "",
          designation: designation ?? "",
          role: role as EmployeeRole,
          employeeCode: await nextEmployeeCode(role as EmployeeRole),
          manager: managerId ?? null,
          job: { joinDate, status: status as JobStatus, isActive: status === "active" },
          profile: { bio: "", skills: [] },
        });
      } catch (err) {
        const isDuplicate =
          typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
        // 11000 is also raised by a racing insert on `email`, which a retry
        // cannot fix — only the employeeCode collision is worth retrying.
        if (!isDuplicate || attempt === 4) {
          if (isDuplicate) throw ApiError.conflict("An account with that email already exists.");
          throw err;
        }
      }
    }
    if (!employee) throw ApiError.internal("Could not create the account. Please try again.");

    const fresh = await Employee.findById(employee._id).populate(
      "manager",
      MANAGER_FIELDS,
    );

    res.status(201).json({
      message: `${firstName} ${lastName} was added as ${role === "admin" ? "an administrator" : `a${role === "employee" ? "n" : ""} ${role}`}.`,
      employee: serializeEmployee(fresh as never),
    });
  }),
);

/** PATCH /api/admin/employees/:id -> edit the descriptive fields. */
router.patch(
  "/employees/:id",
  validate([
    param("id").isMongoId().withMessage("Invalid employee id."),
    body("firstName")
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage("First name cannot be empty.")
      .isLength({ max: 80 }),
    body("lastName")
      .optional()
      .isString()
      .trim()
      .notEmpty()
      .withMessage("Last name cannot be empty.")
      .isLength({ max: 80 }),
    body("email").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
    body("phone").optional().isString().trim().isLength({ max: 32 }),
    body("department").optional().isString().trim().isLength({ max: 80 }),
    body("designation").optional().isString().trim().isLength({ max: 80 }),
    // `null` clears the reports-to, which `isMongoId` alone would reject, so this
    // accepts either a real id or an explicit null — but never a bad string.
    body("manager")
      .optional()
      .custom((value) => value === null || Types.ObjectId.isValid(String(value)))
      .withMessage("Select a valid manager."),
    body("bio").optional({ values: "falsy" }).isString().trim().isLength({ max: 1000 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw ApiError.notFound("Employee not found.");

    const { firstName, lastName, email, phone, department, designation, bio } = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      department?: string;
      designation?: string;
      manager?: string | null;
      bio?: string;
    };

    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase();
      // Exclude this record so re-saving an unchanged email is not a self-collision.
      const clash = await Employee.exists({
        email: normalizedEmail,
        _id: { $ne: employee._id },
      });
      if (clash) throw ApiError.conflict("Another account already uses that email.");
      employee.email = normalizedEmail;
    }

    // `undefined` leaves reports-to untouched; `null` clears it.
    const managerId = await resolveManager(req.body.manager, String(employee._id));
    if (managerId !== undefined) employee.manager = managerId;

    if (firstName !== undefined) employee.firstName = firstName;
    if (lastName !== undefined) employee.lastName = lastName;
    if (phone !== undefined) employee.phone = phone;
    if (department !== undefined) employee.department = department;
    if (designation !== undefined) employee.designation = designation;
    if (bio !== undefined) employee.profile.bio = bio;

    await employee.save();

    const fresh = await Employee.findById(employee._id).populate(
      "manager",
      MANAGER_FIELDS,
    );
    res.json({
      message: "Employee updated.",
      employee: serializeEmployee(fresh as never),
    });
  }),
);

/** GET /api/admin/employees/:id */
router.get(
  "/employees/:id",
  validate([param("id").isMongoId().withMessage("Invalid employee id.")]),
  asyncHandler(async (req, res: Response) => {
    const employee = await Employee.findById(req.params.id).populate(
      "manager",
      MANAGER_FIELDS,
    );
    if (!employee) throw ApiError.notFound("Employee not found.");
    res.json({ employee: serializeEmployee(employee as never) });
  }),
);

/**
 * DELETE /api/admin/employees/:id -> remove an account and everything it owns.
 *
 * A hard delete, not a soft one: `PATCH /job` already covers suspension via
 * `status: "terminated"`, so this is for actually removing someone — a test
 * account, or a signup that should never have existed.
 *
 * Employee references are cleaned up rather than left dangling. A dangling
 * `assignedTo` or `employee` ref would still populate as a bare id in reports
 * and team tables, so attendance, leave, tasks, queries and meeting membership
 * are all removed with the account.
 */
router.delete(
  "/employees/:id",
  validate([param("id").isMongoId().withMessage("Invalid employee id.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = String(req.params.id);
    if (id === req.auth!.userId) {
      throw ApiError.badRequest("You cannot delete your own account.");
    }

    const employee = await Employee.findById(id);
    if (!employee) throw ApiError.notFound("Employee not found.");

    const objectId = new Types.ObjectId(id);

    // Direct reports would otherwise end up pointing at an account that no
    // longer exists, so clear them rather than leaving them orphaned.
    await Promise.all([
      Employee.deleteOne({ _id: objectId }),
      Employee.updateMany({ manager: objectId }, { $set: { manager: null } }),
      Attendance.deleteMany({ employee: objectId }),
      LeaveRequest.deleteMany({ employee: objectId }),
      Task.deleteMany({ assignedTo: objectId }),
      Query.deleteMany({ employee: objectId }),
      Meeting.deleteMany({ participants: objectId }),
    ]);

    res.json({
      message: `${employee.firstName} ${employee.lastName} was deleted.`,
      deleted: { _id: id, email: employee.email },
    });
  }),
);

/**
 * PATCH /api/admin/employees/:id/job -> approve, suspend or terminate an
 * account, and optionally set its manager and role in the same call.
 *
 * Approving a self-registered account is what lets it sign in: `job.status`
 * becomes "active" and `job.isActive` true. The console sends `{ status, manager }`
 * together so a new starter is filed under the right manager the moment they are
 * approved, rather than being left unassigned until someone remembers.
 *
 * `role` is admin-editable here (unlike signup, where it is server-forced), but
 * an administrator cannot demote themselves — that would lock the last platform
 * user out of this very endpoint. The same applies to suspending yourself.
 */
router.patch(
  "/employees/:id/job",
  validate([
    param("id").isMongoId().withMessage("Invalid employee id."),
    body("status").optional({ values: "falsy" }).isString().trim(),
    body("isActive").optional({ values: "falsy" }).isBoolean(),
    body("role").optional({ values: "falsy" }).isString().trim(),
    body("manager").optional({ values: "null" }).isMongoId(),
    body("department").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
    body("designation").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
    body("joinDate").optional({ values: "falsy" }).isISO8601(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employee = await Employee.findById(req.params.id);
    if (!employee) throw ApiError.notFound("Employee not found.");

    const { status, isActive, role, manager, department, designation, joinDate } = req.body as {
      status?: string;
      isActive?: unknown;
      role?: string;
      manager?: string | null;
      department?: string;
      designation?: string;
      joinDate?: string;
    };

    if (status !== undefined && !JOB_STATUSES.includes(status as JobStatus)) {
      throw ApiError.badRequest(`status must be one of: ${JOB_STATUSES.join(", ")}.`);
    }
    if (role !== undefined && !EMPLOYEE_ROLES.includes(role as EmployeeRole)) {
      throw ApiError.badRequest(`role must be one of: ${EMPLOYEE_ROLES.join(", ")}.`);
    }

    // Guard the role that actually grants platform access. Removing your own
    // admin role would lock you out of the very endpoint performing the edit,
    // and it would not take effect until your token expired even if it did.
    const demotingSelf = role !== undefined && role !== "admin" && String(employee._id) === req.auth!.userId;
    if (demotingSelf) {
      throw ApiError.badRequest("You cannot remove your own admin role.");
    }

    // Same lockout, reached through status rather than role. Suspending or
    // terminating yourself signs you out of the console with no way back.
    const suspendingSelf =
      String(employee._id) === req.auth!.userId &&
      (status === "terminated" || isActive === false || isActive === "false");
    if (suspendingSelf) {
      throw ApiError.badRequest("You cannot suspend or terminate your own account.");
    }

    // `undefined` leaves reports-to alone; this is what lets approval set the
    // manager and status in a single call.
    const managerId = await resolveManager(manager, String(employee._id));

    if (status !== undefined) employee.job.status = status as JobStatus;
    if (isActive !== undefined) employee.job.isActive = isActive === true || isActive === "true";
    // A role change re-issues the employee code, so the identifier matches the
    // account's new role (`EMP-0007` -> `MGR-0001`). Approval is where this
    // usually happens: a signup is created as an employee and promoted here.
    //
    // Only on an actual change — re-sending the same role must not burn a code,
    // or an idempotent retry would leave a gap in the sequence.
    const roleChanged = role !== undefined && role !== employee.role;
    if (role !== undefined) employee.role = role as EmployeeRole;
    if (managerId !== undefined) employee.manager = managerId;
    if (department !== undefined) employee.department = department;
    if (designation !== undefined) employee.designation = designation;
    if (joinDate !== undefined) employee.job.joinDate = new Date(joinDate);

    // Activating implies the join date is known; default it to today so the
    // approved account doesn't sit in reports with no start date.
    if (employee.job.status === "active" && !employee.job.joinDate) {
      employee.job.joinDate = new Date();
    }
    if (employee.job.status === "active") employee.job.isActive = true;

    if (roleChanged) {
      employee.employeeCode = await reissueCode(employee.role as EmployeeRole, String(employee._id));
    }

    await employee.save();

    const fresh = await Employee.findById(employee._id).populate("manager", MANAGER_FIELDS);
    res.json({
      message: "Employee updated.",
      employee: serializeEmployee(fresh as never),
    });
  }),
);

/** GET /api/admin/stats -> counts by role, department and status. */
router.get(
  "/stats",
  asyncHandler(async (_req, res: Response) => {
    const [byRole, byDepartment, byStatus, total] = await Promise.all([
      Employee.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]),
      Employee.aggregate<{ _id: string; count: number }>([
        { $group: { _id: { $ifNull: ["$department", ""] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Employee.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$job.status", count: { $sum: 1 } } },
      ]),
      Employee.countDocuments(),
    ]);

    const toRecord = (rows: { _id: string; count: number }[]) =>
      Object.fromEntries(rows.map((r) => [r._id || "unspecified", r.count]));

    res.json({
      total,
      byRole: toRecord(byRole),
      byDepartment: byDepartment.map((r) => ({ department: r._id || "Unassigned", count: r.count })),
      byStatus: toRecord(byStatus),
    });
  }),
);

export default router;