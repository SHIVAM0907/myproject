import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

export type TokenRealm = "employee" | "platform";

export interface EmployeeTokenPayload {
  sub: string;
  email: string;
  // `admin` can sign in to the employee realm like anyone else, but the
  // employee side grants elevation only on an explicit "manager" check, so an
  // admin token carries no extra authority there.
  role: "employee" | "manager" | "admin";
  realm: "employee";
}

export interface PlatformTokenPayload {
  sub: string;
  email: string;
  // Always "admin" in practice. `requirePlatform` re-reads the live role from
  // the database on every request, so this claim is informational only.
  role: "admin";
  realm: "platform";
}

export type TokenPayload = EmployeeTokenPayload | PlatformTokenPayload;

/** P5: tokens carry the tokenVersion (tv) they were minted against. */
export interface AnyVersionedPayload {
  sub: string;
  realm: "employee" | "platform";
  tv?: number;
}
export type VersionedTokenPayload = TokenPayload & AnyVersionedPayload;

export function signEmployeeTokenVersioned(
  payload: Omit<EmployeeTokenPayload, "realm">,
  tokenVersion: number,
): string {
  return jwt.sign({ ...payload, realm: "employee", tv: tokenVersion }, secretFor("employee"), {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
}

export function signPlatformTokenVersioned(
  payload: Omit<PlatformTokenPayload, "realm">,
  tokenVersion: number,
): string {
  return jwt.sign({ ...payload, realm: "platform", tv: tokenVersion }, secretFor("platform"), {
    expiresIn: env.jwt.platformExpiresIn,
  } as jwt.SignOptions);
}

/**
 * Verifies AND enforces the server-side session version. A token whose `tv`
 * lags the account's current tokenVersion is revoked (logout / password
 * change / suspension happened after it was minted).
 */
export async function verifyTokenVersioned(
  token: string,
  realm: TokenRealm,
  currentVersion: number,
): Promise<AnyVersionedPayload> {
  const payload = verifyToken(token, realm) as AnyVersionedPayload;
  const mintedAt = typeof payload.tv === "number" ? payload.tv : 0;
  if (mintedAt < currentVersion) {
    throw ApiError.unauthorized("This session was signed out. Please sign in again.");
  }
  return payload;
}

function secretFor(realm: TokenRealm): string {
  return realm === "employee" ? env.jwt.employeeSecret : env.jwt.platformSecret;
}

export function signEmployeeToken(payload: Omit<EmployeeTokenPayload, "realm">): string {
  return jwt.sign({ ...payload, realm: "employee" }, secretFor("employee"), {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
}

export function signPlatformToken(payload: Omit<PlatformTokenPayload, "realm">): string {
  return jwt.sign({ ...payload, realm: "platform" }, secretFor("platform"), {
    expiresIn: env.jwt.platformExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string, realm: TokenRealm): TokenPayload {
  try {
    const decoded = jwt.verify(token, secretFor(realm)) as TokenPayload;
    // A platform token signed with the platform secret must not be accepted on
    // employee routes even if it somehow reaches this middleware.
    if (decoded.realm !== realm) {
      throw ApiError.unauthorized("Invalid token for this session.");
    }
    return decoded;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized("Your session has expired. Please sign in again.");
    }
    throw ApiError.unauthorized("Invalid authentication token.");
  }
}

/**
 * Decodes `sub` WITHOUT verifying the signature. Used only to look up the
 * account's current tokenVersion before the full verification in
 * verifyTokenVersioned; a forged token still fails that check.
 */
export function decodeTokenSub(token: string): string | null {
  try {
    const decoded = jwt.decode(token) as { sub?: string } | null;
    return typeof decoded?.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

/** Reads the bearer token without verifying it — used by optional auth. */
export function readBearerToken(req: { headers: Record<string, unknown> }): string | null {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (typeof header !== "string") return null;
  const [scheme, value] = header.split(" ");
  if (!value || scheme?.toLowerCase() !== "bearer") return null;
  return value.trim() || null;
}