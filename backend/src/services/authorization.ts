import { Types } from "mongoose";
import { ApiError } from "../utils/ApiError.js";

/**
 * P4 — centralized object-level authorization.
 *
 * Every task/query decision routes through here so "manager" never silently
 * means "global access". Scope rules:
 *
 *  - employee:  only their own records.
 *  - manager:   records belonging to their DIRECT REPORTS (Employee.manager),
 *               plus records they created themselves.
 *  - admin:     not part of the employee realm's team scopes; admins act as
 *               ordinary employees there (matching the realm boundary in
 *               middleware/auth.ts).
 */

export type ActorRole = "employee" | "manager" | "admin";

/** Ids of the actor's direct reports (their permitted team). */
export async function permittedTeamIds(
  actorId: string,
  model: { find: (filter: Record<string, unknown>) => { select: (s: string) => { lean: <T>() => Promise<T> } } },
): Promise<Types.ObjectId[]> {
  const rows = await model
    .find({ manager: actorId })
    .select("_id")
    .lean<Array<{ _id: Types.ObjectId }>>();
  return rows.map((r) => r._id);
}

/**
 * Whether the actor may VIEW a record owned by `ownerId`.
 * Task attachments/queries are owned by the assigned employee.
 */
export function mayView(ownerId: string, actorId: string): boolean {
  return ownerId === actorId;
}

/**
 * Whether the actor may MANAGE (update status / review) a record owned by
 * `ownerId` that was created by `creatorId`.
 */
export function mayManage(
  ownerId: string,
  creatorId: string | null,
  actorId: string,
  isManager: boolean,
  teamIds: Types.ObjectId[],
): boolean {
  if (ownerId === actorId) return true;
  if (!isManager) return false;
  if (creatorId && creatorId === actorId) return true;
  return teamIds.some((id) => String(id) === ownerId);
}

/** Throws 403 when the actor may not manage; shared message, no scope detail. */
export function assertCanManage(
  allowed: boolean,
  message = "You do not have access to this resource.",
): void {
  if (!allowed) throw ApiError.forbidden(message);
}

/** Filter for list endpoints: the actor's own records + their team's. */
export function scopeFilter(
  actorId: string,
  isManager: boolean,
  teamIds: Types.ObjectId[],
  ownerField = "assignedTo",
  creatorField = "assignedBy",
): Record<string, unknown> {
  if (!isManager) return { [ownerField]: actorId };
  return {
    $or: [
      { [ownerField]: { $in: teamIds } },
      { [creatorField]: actorId },
    ],
  };
}
