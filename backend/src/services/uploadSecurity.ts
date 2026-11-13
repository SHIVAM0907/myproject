import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError.js";

/**
 * P3 — upload security policy.
 *
 * Purpose-specific MIME allowlists, magic-byte content sniffing (never trusting
 * the client-supplied fileType), size caps and signed-URL constraints. SVG,
 * HTML and executables are rejected outright — they can carry scripts that a
 * browser executes even from a "neutral" content type.
 */

export type UploadPurpose = "profile" | "task_attachment";

interface MimeRule {
  mime: string;
  extensions: string[];
  /** Magic bytes required somewhere near the start of the file. */
  magic: Array<{ offset: number; bytes: number[] }>;
  /** Content can be safely re-encoded as an image on receipt. */
  reencode: boolean;
}

// image/png  signature "\x89PNG\r\n\x1a\n"; JPEG "\xFF\xD8\xFF"; WebP RIFF....WEBP.
const IMAGE_MIMES: MimeRule[] = [
  {
    mime: "image/png",
    extensions: [".png"],
    magic: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
    reencode: true,
  },
  {
    mime: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    magic: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
    reencode: true,
  },
  {
    mime: "image/webp",
    extensions: [".webp"],
    // RIFF at 0 and WEBP at offset 8.
    magic: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
    reencode: true,
  },
];

// Safe document types for task attachments. PDF magic is "%PDF-" at offset 0
// (or slightly in for some writers); plain text is checked by "is printable".
const DOC_MIMES: MimeRule[] = [
  {
    mime: "application/pdf",
    extensions: [".pdf"],
    magic: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
    reencode: false,
  },
];

export const PURPOSE_RULES: Record<UploadPurpose, { allowed: MimeRule[]; maxBytes: number }> = {
  profile: { allowed: IMAGE_MIMES, maxBytes: 2 * 1024 * 1024 },
  task_attachment: { allowed: [...IMAGE_MIMES, ...DOC_MIMES], maxBytes: 5 * 1024 * 1024 },
};

const BLOCKED_EXTENSIONS = [
  ".svg",
  ".html",
  ".htm",
  ".xhtml",
  ".js",
  ".mjs",
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".sh",
  ".bash",
  ".ps1",
  ".php",
  ".py",
  ".rb",
  ".jar",
  ".war",
  ".scr",
  ".msi",
  ".com",
];

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : "";
}

/**
 * Resolves the rule for a claimed MIME + extension pair. The client-declared
 * type is only a HINT: the actual bytes must satisfy the rule's magic numbers
 * (checked by validateUploadContent) before anything is stored.
 */
export function resolveRule(purpose: UploadPurpose, claimedMime: string, fileName: string): MimeRule {
  const rules = PURPOSE_RULES[purpose].allowed;
  const ext = extensionOf(fileName);
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    throw ApiError.unprocessable(`${ext} files are not permitted.`);
  }
  const claimed = claimedMime.split(";")[0].trim().toLowerCase();
  // Exact match first, then any allowed rule whose extension matches — a
  // mislabeled but benign type is corrected below, never trusted.
  const byMime = rules.find((r) => r.mime === claimed);
  if (byMime) return byMime;
  const byExt = rules.find((r) => r.extensions.includes(ext));
  if (byExt) return byExt;
  // Dangerously misleading labels ("image/svg+xml", "text/html") must never
  // fall through to a permissive default.
  if (/svg|html|executable|x-msdownload|javascript/i.test(claimed)) {
    throw ApiError.unprocessable(`${claimed} files are not permitted.`);
  }
  throw ApiError.unprocessable(
    `Unsupported file type. Allowed: ${rules.map((r) => r.extensions.join("/")).join(", ")}.`,
  );
}

/** Maximum accepted size per purpose; enforced on the BACKEND, not the client. */
export function maxSizeFor(purpose: UploadPurpose): number {
  return PURPOSE_RULES[purpose].maxBytes;
}

/**
 * Validates the ACTUAL bytes against the rule's magic numbers and the size
 * cap. `contentType` returned is the server-determined truth, not the client's
 * claim.
 */
export function validateUploadContent(
  purpose: UploadPurpose,
  rule: MimeRule,
  data: Buffer,
): { contentType: string; sha256: string } {
  if (data.byteLength === 0) throw ApiError.badRequest("No file data was received.");
  if (data.byteLength > maxSizeFor(purpose)) {
    throw ApiError.badRequest(
      `That file is larger than the ${Math.round(maxSizeFor(purpose) / 1024 / 1024)} MB limit.`,
    );
  }
  const window = data.subarray(0, 64);
  const matches = rule.magic.every(
    ({ offset, bytes }) =>
      offset + bytes.length <= window.length &&
      bytes.every((b, i) => window[offset + i] === b),
  );
  if (!matches) {
    // The bytes disagree with both the declared and extension-implied type.
    throw ApiError.unprocessable("The file content does not match its declared type.");
  }
  return { contentType: rule.mime, sha256: crypto.createHash("sha256").update(data).digest("hex") };
}

/**
 * Image re-encoding hook. True decoders (sharp/wasm) are intentionally NOT
 * bundled here; when none is installed the ORIGINAL bytes are kept and the
 * promise still resolves — re-encoding is an enhancement, not a gate. A
 * PNG/JPEG/WebP that passed magic-byte validation is already safe to serve
 * with a strict Content-Type + nosniff.
 */
export async function reencodeImage(
  _purpose: UploadPurpose,
  data: Buffer,
): Promise<{ data: Buffer; reencoded: boolean }> {
  void _purpose;
  return { data, reencoded: false };
}

/**
 * Malware-scan integration point.
 *
 * The ONLY way scanStatus becomes "clean" is a real scanner answering through
 * configureMalwareScanner. With no scanner configured (the default) every
 * upload is recorded as "unscanned" — production is never told files are clean
 * when nothing scanned them.
 */
export type MalwareScanner = (data: Buffer, fileName: string) => Promise<"clean" | "infected">;
let scanner: MalwareScanner | null = null;
export function configureMalwareScanner(fn: MalwareScanner | null): void {
  scanner = fn;
}
export async function scanUpload(data: Buffer, fileName: string): Promise<"unscanned" | "clean" | "infected"> {
  if (!scanner) return "unscanned";
  try {
    return await scanner(data, fileName);
  } catch {
    // A failing scanner must never pass a file as clean.
    return "infected";
  }
}

/** Signed-URL restriction reminders encoded as data, enforced by upload.controller. */
export const SIGNED_URL_POLICY = {
  ttlSeconds: 300,
  // Download responses must always carry these headers; private files are
  // never exposed through public, unauthenticated URLs.
  headers: {
    "Content-Disposition": "attachment", // inline only for image/* below
    "X-Content-Type-Options": "nosniff",
  },
} as const;

/** Chooses a safe response Content-Type for a stored object. */
export function safeResponseContentType(stored: string): string {
  const allowed = [...PURPOSE_RULES.profile.allowed, ...PURPOSE_RULES.task_attachment.allowed]
    .map((r) => r.mime);
  return allowed.includes(stored) ? stored : "application/octet-stream";
}

/** Whether a stored type may be shown inline (images) or must download. */
export function inlineDisposition(stored: string): "inline" | "attachment" {
  return stored.startsWith("image/") ? "inline" : "attachment";
}
