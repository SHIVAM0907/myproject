// Turns a storage key stored on a document (e.g. "employees/abc123.png" or
// "tasks/attachments/spec-1.png") into a temporary signed URL that a browser
// can actually load. Despite the file name this is not picture-specific: task
// attachments are keys too, and they need signing for exactly the same reason.
//
// The backend owns the R2 credentials, so signing cannot happen here; it has to
// round-trip. `uploadApi` is scoped to /api/upload (employeeApi is scoped to
// /api/employee and would send the wrong base path) and carries the employee
// token. It used to be bare axios with no Authorization header, so every signing
// call 401'd and the catch below turned it into a silent blank picture.
//
// Contract relied on by every caller: this never rejects and never returns a
// non-string. Callers such as the dashboard headers attach a bare .then() with no
// .catch(), and they fall back to initials whenever the result is falsy.

import { uploadApi } from "../lib/uploadApi";

const SIGN_URL_ENDPOINT = "/get-file-url";

// Signed links expire, so keep each one only until it is worth re-requesting.
const CACHE_TTL_MS = 50 * 60 * 1000;

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

// The backend has used more than one field name for this across the upload
// routes, so accept any of them rather than rendering a broken image.
const pickUrl = (data: any): string => {
  const candidate = data?.url ?? data?.signedUrl ?? data?.fileUrl ?? data?.data?.url;
  return typeof candidate === "string" ? candidate : "";
};

export async function getSignedFileUrl(fileKey?: string | null): Promise<string> {
  if (!fileKey) return "";

  // Already a full link, e.g. a key that was signed by the backend earlier.
  if (isAbsoluteUrl(fileKey)) return fileKey;

  const cached = cache.get(fileKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  if (cached) cache.delete(fileKey);

  try {
    const { data } = await uploadApi.post(SIGN_URL_ENDPOINT, { fileKey });
    const url = pickUrl(data);

    if (url) cache.set(fileKey, { url, expiresAt: Date.now() + CACHE_TTL_MS });
    return url;
  } catch (error) {
    // A missing or expired picture is not an error worth surfacing to the user:
    // the caller has an initials fallback and would rather show that than throw.
    // It is still logged, because a silent catch is exactly what hid a 401 here
    // long enough for "my profile picture does not load" to go un diagnosed.
    console.warn("[getImageUrl] could not sign", fileKey, error);
    return "";
  }
}

/** Avatar-specific alias, kept so existing call sites read naturally. */
export const getProfileImageUrl = getSignedFileUrl;

/**
 * Signs several keys at once for a list row, so a table of tasks does not issue
 * one request per attachment per render. Keys that already fail simply come
 * back as "", which the caller renders as an inert label.
 */
export async function getSignedFileUrls(keys: Array<string | null | undefined>): Promise<string[]> {
  return Promise.all(keys.map((key) => getSignedFileUrl(key)));
}

// Called after a profile picture is replaced or deleted so the next render
// re-signs instead of replaying the stale (or deleted) key.
export function clearProfileImageUrlCache(fileKey?: string | null): void {
  if (fileKey) cache.delete(fileKey);
  else cache.clear();
}

export default getSignedFileUrl;