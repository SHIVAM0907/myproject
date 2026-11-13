import { Router, type Response } from "express";
import { body } from "express-validator";
import { findByEmailWithPassword } from "../models/Employee.js";
import { requireEmployee, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signEmployeeTokenVersioned } from "../utils/jwt.js";
import { bumpTokenVersion } from "../models/Employee.js";
import {
  ensureIpLimiter,
  ensureRegisterLimiter,
  recordAuthFailure,
  recordAuthSuccess,
  accountThrottling,
  normalizeEmail,
} from "../middleware/rateLimit.js";
import { MANAGER_FIELDS, serializeEmployee } from "../utils/serialize.js";

import employeeRouter from "../controllers/employee.controller.js";
import attendanceRouter from "../controllers/attendance.controller.js";
import leaveRouter from "../controllers/leave.controller.js";
import taskRouter from "../controllers/task.controller.js";
import meetingRouter from "../controllers/meeting.controller.js";
import teamRouter from "../controllers/team.controller.js";
import reportRouter from "../controllers/report.controller.js";
import dashboardRouter from "../controllers/dashboard.controller.js";

const router = Router();

/**
 * Single entry point for /api/employee.
 *
 * Auth is applied ONCE here rather than inside each sub-router. A router
 * mounted at a prefix runs its own `router.use()` middleware for every request
 * on that prefix — including ones it doesn't own — so per-sub-router auth would
 * fire `requireEmployee` several times and lock out the public login route.
 */
router.post(
  "/login",
  ensureIpLimiter,
  validate([
    body("email").isEmail().withMessage("Enter a valid email address."),
    body("password").isString().notEmpty().withMessage("Password is required."),
  ]),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const normalized = normalizeEmail(email);
    // Account throttle (P2): short-lived lockout after repeated failures for
    // the SAME account, independent of source IP. Generic message so lockout
    // reads exactly like any other auth refusal to an attacker.
    if (accountThrottling.check(normalized).blocked) {
      throw ApiError.tooManyRequests("Too many attempts. Please try again later.");
    }
    const employee = await findByEmailWithPassword(email);
    // One generic message either way, so the response can't enumerate accounts.
    if (!employee || !(await employee.comparePassword(password))) {
      recordAuthFailure(normalized);
      throw ApiError.unauthorized("Incorrect email or password.");
    }
    if (employee.job?.status === "inactive") {
      // A self-registered account lands here: the password is right, but the
      // account is deliberately unusable until an administrator approves it.
      // Without this distinct message it reads as a wrong password, and the
      // user just retries the same one forever.
      throw ApiError.forbidden(
        "Your account is awaiting administrator approval. You will be able to sign in once it is approved.",
      );
    }
    if (employee.job?.status === "terminated" || employee.job?.isActive === false) {
      throw ApiError.forbidden("This account is not active. Contact your administrator.");
    }

    // A successful sign-in clears the failure counters (P2).
    recordAuthSuccess(normalized);
    // P5: the token embeds the account's tokenVersion so server-side session
    // invalidation works.
    const authRecord = await import("../models/Employee.js").then((m) =>
      m.findByIdForAuth(String(employee._id)),
    );
    const token = signEmployeeTokenVersioned(
      {
        sub: String(employee._id),
        email: employee.email,
        role: employee.role as "employee" | "manager",
      },
      authRecord?.tokenVersion ?? 0,
    );

    res.json({
      token,
      isManager: employee.role === "manager",
      // Populated for the same reason as GET /api/employee/me: the frontend
      // renders a manager name only when `manager` arrives as an object, and
      // the login response seeds the same store.
      employee: serializeEmployee(await employee.populate("manager", MANAGER_FIELDS)),
    });
  }),
);

// Everything below this line requires a valid employee-realm JWT.
router.use(requireEmployee);

/**
 * POST /api/employee/logout — revoke the CURRENT session (P5).
 *
 * With tokenVersion-based sessions there is no per-session table, so "this
 * device" invalidation is expressed by the client discarding the token plus a
 * short grace period. The destructive variants live in logout-all.
 */
router.post(
  "/logout",
  asyncHandler(async (_req: unknown, res: Response) => {
    // Stateless JWT: the client drops the token; server responds ack.
    res.json({ message: "Signed out." });
  }),
);

/**
 * POST /api/employee/logout-all — revoke EVERY session for this account (P5).
 *
 * Bumps tokenVersion, which instantly invalidates all outstanding tokens.
 */
router.post(
  "/logout-all",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await bumpTokenVersion(String(currentUserIdSafe(req)));
    res.json({ message: "Signed out everywhere." });
  }),
);

function currentUserIdSafe(req: AuthenticatedRequest): string {
  return req.auth?.userId ?? "";
}

router.use(dashboardRouter);
router.use(teamRouter);
router.use(reportRouter);
router.use(meetingRouter);
router.use(taskRouter);
router.use(leaveRouter);
router.use(attendanceRouter);
router.use(employeeRouter);

export default router;