import { Router, type Response } from "express";
import { body } from "express-validator";
import {
  Employee,
  findByEmailWithPassword,
  findByIdWithPassword,
} from "../models/Employee.js";
import { bumpTokenVersion } from "../models/Employee.js";
import { requireEmployee, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { signEmployeeToken } from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";
import { MANAGER_FIELDS, serializeEmployee } from "../utils/serialize.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

/**
 * `/me` is read by EmployeeAuthContext, both profile screens, and
 * NewLeaveRequestForm — all four unwrap `{ employee }`.
 */
router.get(
  "/me",
  requireEmployee,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // `requireEmployee` loads the account with `Employee.findById`, so `manager`
    // is still an unpopulated ObjectId here. `serializeEmployee` passes an
    // unpopulated ref through as a bare id string, and both EmployeeProfile and
    // ApplyForLeave guard with `typeof manager === "object"` — so the profile
    // silently rendered no manager. Repopulate here.
    const employee = await Employee.findById(currentUserId(req)).populate("manager", MANAGER_FIELDS);
    if (!employee) throw ApiError.notFound("Your account could not be found.");

    res.json({ employee: serializeEmployee(employee as never) });
  }),
);

/**
 * Accepts only the fields both profile forms actually send: `phone`, `bio`, and
 * `imageUrl`. Name, email and employee code are server-managed; department and
 * designation are admin-only (both forms document this at the call site).
 */
router.put(
  "/me",
  requireEmployee,
  validate([
    body("phone").optional({ values: "falsy" }).isString().trim().isLength({ max: 32 }),
    body("bio").optional({ values: "falsy" }).isString().trim().isLength({ max: 1000 }),
    body("imageUrl").optional({ values: "falsy" }).isString().trim().isLength({ max: 1024 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employee = await Employee.findById(currentUserId(req));
    if (!employee) throw ApiError.notFound("Your account could not be found.");

    const { phone, bio, imageUrl } = req.body as {
      phone?: string;
      bio?: string;
      imageUrl?: string;
    };

    if (phone !== undefined) employee.phone = phone;
    if (bio !== undefined) employee.profile.bio = bio;

    // An empty string is meaningful: ManagerProfile calls `persistPicture("")`
    // to remove a photo, so it must not be treated as "field omitted".
    if (imageUrl !== undefined) employee.profile.imageUrl = imageUrl;

    await employee.save();

    const fresh = await Employee.findById(employee._id).populate(
      "manager",
      MANAGER_FIELDS,
    );
    res.json({ employee: serializeEmployee(fresh as never) });
  }),
);

/**
 * `useChangePassword` resolves both "employee" and "manager" scopes to this one
 * path (its `_scope` parameter is deliberately unused), so this handler serves
 * both dashboard password screens.
 */
router.put(
  "/password",
  requireEmployee,
  validate([
    body("currentPassword").isString().notEmpty().withMessage("Current password is required."),
    body("newPassword")
      .isString()
      .isLength({ min: 8 })
      .withMessage("New password must be at least 8 characters.")
      .matches(/[A-Za-z]/)
      .withMessage("New password must contain a letter.")
      .matches(/\d/)
      .withMessage("New password must contain a number."),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    // `password` is select:false on the schema, so ask for it explicitly.
    const employee = await findByIdWithPassword(String(currentUserId(req)));
    if (!employee) throw ApiError.notFound("Your account could not be found.");

    if (!(await employee.comparePassword(currentPassword))) {
      throw ApiError.badRequest("Your current password is incorrect.");
    }

    if (await employee.comparePassword(newPassword)) {
      throw ApiError.badRequest("Choose a password you have not used before.");
    }

    employee.password = newPassword; // hashed by the schema pre-save hook
    // P5: a password change invalidates EVERY outstanding session for the
    // account, including the token this request was made with.
    await bumpTokenVersion(String(currentUserId(req)));
    await employee.save();

    res.json({ message: "Password updated. Please sign in again." });
  }),
);

export default router;