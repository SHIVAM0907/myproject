import { Router, type Response } from "express";
import { body } from "express-validator";
import { Employee, findByEmailWithPassword } from "../models/Employee.js";
import { validate } from "../middleware/validate.js";
import { requirePlatform, type AuthenticatedRequest } from "../middleware/auth.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signPlatformTokenVersioned } from "../utils/jwt.js";
import { findByIdForAuth, bumpTokenVersion } from "../models/Employee.js";
import {
  ensureIpLimiter,
  recordAuthFailure,
  recordAuthSuccess,
  accountThrottling,
  normalizeEmail,
} from "../middleware/rateLimit.js";
import { MANAGER_FIELDS, serializeEmployee } from "../utils/serialize.js";

const router = Router();

/**
 * The platform/admin realm — the third independent token, stored under the
 * `token` localStorage key by AuthContext. These are the routes
 * `AuthContext.tsx` flags as "not present in this repo" (see its lines 12-16).
 * They are implemented here so the context has something real to talk to.
 *
 * Entry is restricted to the `admin` role. The team `manager` runs the
 * /manager dashboards and is refused here; see the login handler.
 */

/** POST /api/auth/login -> `{ token }` */
router.post(
  "/login",
  ensureIpLimiter,
  validate([
    body("email").isEmail().withMessage("Enter a valid email address."),
    body("password").isString().notEmpty().withMessage("Password is required."),
  ]),
  asyncHandler(async (req, res: Response) => {
    const { email, password } = req.body as { email: string; password: string };
    const normalized = normalizeEmail(email);
    if (accountThrottling.check(normalized).blocked) {
      throw ApiError.tooManyRequests("Too many attempts. Please try again later.");
    }
    const user = await findByEmailWithPassword(email);
    if (!user || !(await user.comparePassword(password))) {
      // One generic message for both branches so the response can't be used to
      // enumerate which emails exist. Failures also arm the account throttle.
      recordAuthFailure(normalized);
      throw ApiError.unauthorized("Incorrect email or password.");
    }
    // Only the admin role reaches the platform realm. A `manager` is explicitly
    // refused rather than treated as an admin: the team manager runs the
    // /manager dashboards and has no business approving accounts, so the two
    // realms stay separate identities with separate credentials.
    if (user.role !== "admin") {
      throw ApiError.forbidden(
        user.role === "manager"
          ? "The admin console is for administrators. Sign in to the manager dashboard instead."
          : "Only administrators can sign in to the admin area.",
      );
    }
    // A suspended admin must not get a fresh token even with the right password.
    if (user.job?.status === "terminated") {
      throw ApiError.forbidden("This account has been terminated.");
    }
    if (user.job?.isActive === false) {
      throw ApiError.forbidden("This account is inactive.");
    }

    // Successful authentication resets the failure counters (P2).
    recordAuthSuccess(normalized);
    // P5: embed the account's tokenVersion for server-side revocation.
    const authRecord = await findByIdForAuth(String(user._id));
    const token = signPlatformTokenVersioned(
      { sub: String(user._id), email: user.email, role: user.role },
      authRecord?.tokenVersion ?? 0,
    );

    res.json({ token, user: serializeEmployee(user as never) });
  }),
);

/**
 * GET /api/auth/me -> `{ user }`
 *
 * AuthContext reads `data?.user ?? data ?? null` and tolerates any failure by
 * clearing the token and returning null, so no error shape is required here.
 */
router.get(
  "/me",
  requirePlatform,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await Employee.findById(req.auth!.userId).populate("manager", MANAGER_FIELDS);
    if (!user) throw ApiError.notFound("Your account could not be found.");
    res.json({ user: serializeEmployee(user as never) });
  }),
);

/**
 * POST /api/auth/logout-all — invalidate every platform session (P5).
 */
router.post(
  "/logout-all",
  requirePlatform,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await bumpTokenVersion(req.auth!.userId);
    res.json({ message: "Signed out everywhere." });
  }),
);

/**
 * PATCH /api/user/profile -> updates the signed-in platform user.
 * Accepts an arbitrary partial payload, and tolerates the nested
 * `{ profile: { bio } }` shape AuthContext documents.
 */
router.patch(
  "/profile",
  requirePlatform,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = await Employee.findById(req.auth!.userId).populate("manager", MANAGER_FIELDS);
    if (!user) throw ApiError.notFound("Your account could not be found.");

    const payload = (req.body ?? {}) as Record<string, unknown>;
    // AuthContext documents that a nested `{ profile: {...} }` payload is valid.
    const flat: Record<string, unknown> = { ...payload };
    if (payload.profile && typeof payload.profile === "object") {
      Object.assign(flat, payload.profile as Record<string, unknown>);
    }

    const { firstName, lastName, phone, bio, imageUrl, department, designation } = flat;

    if (typeof firstName === "string" && firstName.trim()) user.firstName = firstName.trim();
    if (typeof lastName === "string" && lastName.trim()) user.lastName = lastName.trim();
    if (typeof phone === "string") user.phone = phone.trim();
    if (typeof bio === "string") user.profile.bio = bio.trim();
    if (typeof imageUrl === "string") user.profile.imageUrl = imageUrl.trim();
    if (typeof department === "string") user.department = department.trim();
    if (typeof designation === "string") user.designation = designation.trim();

    await user.save();

    const fresh = await Employee.findById(user._id).populate(
      "manager",
      MANAGER_FIELDS,
    );
    res.json({ message: "Profile updated.", user: serializeEmployee(fresh as never) });
  }),
);

export default router;