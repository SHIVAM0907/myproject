import { Router } from "express";
import { body } from "express-validator";
import { Employee, nextEmployeeCode } from "../models/Employee.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ensureRegisterLimiter } from "../middleware/rateLimit.js";

const router = Router();

/**
 * Public signup. Mounted at /api/auth, so POST /api/auth/register.
 *
 * Deliberately restrictive, because this route is unauthenticated:
 *
 *  - `role` is hardcoded to "employee" and is never read from the body, so a
 *    self-registering user cannot promote themselves to manager.
 *  - `employeeCode` is generated server-side.
 *  - The account is created `job.status: "inactive"` / `job.isActive: false`,
 *    which `POST /api/employee/login` refuses, so an administrator has to
 *    approve it first.
 *  - No token is returned, because the account cannot sign in yet.
 *
 * Approval is done with `npm run employees -- list` / `npm run employees --
 * approve <id>` in backend/, or the platform-realm endpoints in
 * admin.controller.ts once an admin UI exists.
 */
router.post(
  "/register",
  ensureRegisterLimiter,
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
    body("password")
      .isString()
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters.")
      .matches(/[A-Za-z]/)
      .withMessage("Password must contain a letter.")
      .matches(/\d/)
      .withMessage("Password must contain a number."),
    body("phone").optional({ values: "falsy" }).isString().trim().isLength({ max: 32 }),
    body("department").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
    body("designation").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
  ]),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, phone, department, designation } =
      req.body as {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        phone?: string;
        department?: string;
        designation?: string;
      };

    const normalizedEmail = email.toLowerCase();
    if (await Employee.exists({ email: normalizedEmail })) {
      throw ApiError.conflict("An account with that email already exists.");
    }

    // `nextEmployeeCode` probes for the highest code, so two signups landing at
    // once can pick the same one; the unique index then rejects the second.
    // Re-probe and retry rather than surfacing a raw 11000 to the user.
    // `Employee.create` returns an array type; take the element. This is a plain
    // hydrated doc — no need for `EmployeeDoc`, which adds the `comparePassword`
    // and `fullName` instance members that `create` does not attach.
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
          role: "employee",
          // Signups are always employees; admins assign the real role on approval,
          // which re-issues the code with that role's prefix.
          employeeCode: await nextEmployeeCode("employee"),
          job: { status: "inactive", isActive: false, joinDate: null },
        });
      } catch (err) {
        const isDuplicateCode =
          typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
        if (!isDuplicateCode || attempt === 4) throw err;
      }
    }
    if (!employee) throw ApiError.internal("Could not create the account. Please try again.");

    res.status(201).json({
      message: "Your account has been created and is awaiting administrator approval.",
      pendingApproval: true,
      email: employee.email,
      employee: {
        _id: String(employee._id),
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        employeeCode: employee.employeeCode,
        role: employee.role,
        job: { status: employee.job?.status, isActive: employee.job?.isActive },
      },
    });
  }),
);

export default router;