import { Types, type HydratedDocument } from "mongoose";
import type { EmployeeDoc } from "../models/Employee.js";

/**
 * The frontend is inconsistent about collection keys (`members` on /team,
 * `employees` on /team/available, `member` on /team/member/:id), so every
 * route deliberately returns the key its own caller reads. These helpers
 * centralise the *field* shape to avoid repeating it across ~20 routes.
 */

/**
 * Projection for a populated `manager` reference.
 *
 * `serializeEmployee` can only emit a manager *object* if the caller populated
 * it; an unpopulated ref serialises as a bare id string instead, and the
 * frontend tests `typeof manager === "object"` before rendering a name. Every
 * call site therefore populates with this one list.
 */
export const MANAGER_FIELDS = "firstName lastName employeeCode";

export function employeeId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Types.ObjectId) return String(value);
  const maybe = value as { _id?: unknown };
  return maybe._id ? String(maybe._id) : undefined;
}

export function nameOf(person: unknown): string {
  if (!person || typeof person !== "object") return "";
  const p = person as { firstName?: string; lastName?: string };
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}

/** The shape returned inside `{ employee }` by GET/PUT /api/employee/me. */
export function serializeEmployee(
  doc: EmployeeDoc | (HydratedDocument<Record<string, unknown>> & { _id: unknown }),
) {
  const e = doc as unknown as {
    _id: unknown;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    phone?: string;
    department?: string;
    designation?: string;
    employeeCode: string;
    manager?: unknown;
    job?: { joinDate?: Date | null; status?: string; isActive?: boolean };
    profile?: { bio?: string; imageUrl?: string; skills?: string[] };
    leaveBalances?: Map<string, { total: number; used: number }>;
    createdAt?: Date;
  };

  const manager = e.manager as
    | { _id: unknown; firstName?: string; lastName?: string; employeeCode?: string }
    | string
    | null
    | undefined;

  // `NewLeaveRequestForm` only renders a manager name when `manager` is an
  // object (it checks `typeof manager === "object"`), so always populate it.
  const managerValue =
    manager && typeof manager === "object"
      ? {
          _id: String(manager._id),
          firstName: manager.firstName ?? "",
          lastName: manager.lastName ?? "",
          ...(manager.employeeCode ? { employeeCode: manager.employeeCode } : {}),
        }
      : typeof manager === "string" && manager
        ? manager
        : null;

  // `/me` exposes `{ total, used }` with NO `remaining`, unlike
  // `/leave/balance` which adds `remaining`. Both shapes are intentional.
  const balances: Record<string, { total: number; used: number }> = {};
  if (e.leaveBalances instanceof Map) {
    for (const [key, value] of e.leaveBalances) {
      balances[key] = { total: value?.total ?? 0, used: value?.used ?? 0 };
    }
  }

  return {
    _id: String(e._id),
    email: e.email,
    role: e.role,
    firstName: e.firstName,
    lastName: e.lastName,
    employeeCode: e.employeeCode,
    phone: e.phone ?? "",
    department: e.department ?? "",
    designation: e.designation ?? "",
    manager: managerValue,
    job: {
      joinDate: e.job?.joinDate ? new Date(e.job.joinDate).toISOString() : null,
      status: e.job?.status ?? "active",
      isActive: e.job?.isActive ?? true,
    },
    profile: {
      bio: e.profile?.bio ?? "",
      imageUrl: e.profile?.imageUrl ?? "",
      skills: e.profile?.skills ?? [],
    },
    leaveBalances: balances,
    createdAt: e.createdAt ? new Date(e.createdAt).toISOString() : undefined,
  };
}

/** The narrow directory projection used by /team/available and /colleagues. */
export function serializeDirectoryEntry(doc: unknown, inTeam = false) {
  const e = doc as {
    _id: unknown;
    firstName: string;
    lastName: string;
    email?: string;
    employeeCode?: string;
    department?: string;
    designation?: string;
    role: string;
    manager?: unknown;
    job?: { joinDate?: Date | null };
    profile?: { imageUrl?: string };
  };

  return {
    _id: String(e._id),
    firstName: e.firstName,
    lastName: e.lastName,
    email: e.email,
    employeeCode: e.employeeCode,
    department: e.department ?? "",
    designation: e.designation ?? "",
    role: e.role,
    manager: employeeId(e.manager) ?? null,
    job: { joinDate: e.job?.joinDate ? new Date(e.job.joinDate).toISOString() : null },
    isManager: e.role === "manager",
    ...(inTeam === undefined ? {} : { inTeam }),
    availability: { status: "available", expectedEndAt: null },
  };
}