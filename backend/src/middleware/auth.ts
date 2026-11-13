import type { NextFunction, Request, Response } from "express";
import { Types } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { readBearerToken, verifyToken, verifyTokenVersioned } from "../utils/jwt.js";
import { Employee } from "../models/Employee.js";
import type { EmployeeRole } from "../models/Employee.js";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    email: string;
    role: EmployeeRole;
    realm: "employee" | "platform";
  };
  /** Populated by `requireEmployee`; avoids re-querying the same employee twice. */
  employeeDoc?: unknown;
}

function bearerOrThrow(req: Request): string {
  const token = readBearerToken(req as unknown as { headers: Record<string, unknown> });
  if (!token) throw ApiError.unauthorized("Sign in to continue.");
  return token;
}

/** Requires a valid employee-realm JWT and loads the live employee record. */
export async function requireEmployee(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const jwtUtils = await import("../utils/jwt.js");
    // Decode WITHOUT verifying just to find the account for the version
    // lookup; garbage tokens decode to null and fall straight through to the
    // verification failure below (still a 401).
    const sub = jwtUtils.decodeTokenSub(bearerOrThrow(req));
    const employeePre =
      sub && Types.ObjectId.isValid(sub) ? await Employee.findById(sub).select("+tokenVersion") : null;
    const currentVersion = employeePre
      ? ((employeePre as unknown as { tokenVersion?: number }).tokenVersion ?? 0)
      : 0;
    const payload = await verifyTokenVersioned(bearerOrThrow(req), "employee", currentVersion);
    if (payload.realm !== "employee") throw ApiError.unauthorized("Invalid token for this session.");

    const employee = await Employee.findById(payload.sub);
    if (!employee) throw ApiError.unauthorized("Your account could not be found.");

    if (employee.job?.status === "terminated") {
      throw ApiError.forbidden("This account has been terminated.");
    }
    if (employee.job?.isActive === false) {
      throw ApiError.forbidden("This account is inactive.");
    }

    req.auth = {
      userId: String(employee._id),
      email: employee.email,
      role: employee.role as EmployeeRole,
      realm: "employee",
    };
    req.employeeDoc = employee;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Requires a valid platform-realm JWT (the `token` localStorage key) belonging
 * to an account that is still an active administrator.
 *
 * The live role is re-read from the database rather than trusted from the
 * token's `role` claim. That claim is only as fresh as the token, so trusting it
 * would let a demoted or suspended admin keep full access until it expired, and
 * would let any platform token minted before the admin/manager split reach
 * /api/admin. This is the boundary between the realms, so it is checked on every
 * request rather than once at login.
 */
export async function requirePlatform(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const jwtUtils = await import("../utils/jwt.js");
    const sub = jwtUtils.decodeTokenSub(bearerOrThrow(req));
    const userPre =
      sub && Types.ObjectId.isValid(sub) ? await Employee.findById(sub).select("+tokenVersion") : null;
    const currentVersion = userPre
      ? ((userPre as unknown as { tokenVersion?: number }).tokenVersion ?? 0)
      : 0;
    const payload = await verifyTokenVersioned(bearerOrThrow(req), "platform", currentVersion);

    const user = await Employee.findById(payload.sub);
    if (!user) throw ApiError.unauthorized("Your account could not be found.");

    if (user.role !== "admin") {
      throw ApiError.forbidden("This account is no longer an administrator.");
    }
    if (user.job?.status === "terminated") {
      throw ApiError.forbidden("This account has been terminated.");
    }
    if (user.job?.isActive === false) {
      throw ApiError.forbidden("This account is inactive.");
    }

    req.auth = {
      userId: String(user._id),
      email: user.email,
      role: user.role,
      realm: "platform",
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: EmployeeRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden("This action is restricted to managers."));
    }
    return next();
  };
}

export function currentUserId(req: AuthenticatedRequest): Types.ObjectId {
  if (!req.auth) throw ApiError.unauthorized();
  return new Types.ObjectId(req.auth.userId);
}