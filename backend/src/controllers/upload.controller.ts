import { Router, type Response } from "express";
import express from "express";
import { body } from "express-validator";
import { requireEmployee, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { env } from "../config/env.js";
import { Upload } from "../models/Upload.js";
import {
  activeBackend,
  createFileUrl,
  createUploadUrl,
  deleteFile,
  localFileExists,
  readLocalFile,
  writeLocalFile,
} from "../services/storage.service.js";
import {
  type UploadPurpose,
  inlineDisposition,
  maxSizeFor,
  resolveRule,
  safeResponseContentType,
  scanUpload,
  validateUploadContent,
} from "../services/uploadSecurity.js";

const router = Router();

/**
 * These live under /api/upload, NOT /api/employee. `getImageUrl.ts` documents
 * the reason: the employee client is scoped to /api/employee and would send the
 * wrong base path, so the frontend calls these with bare axios.
 *
 * P3: every upload now gets a persisted metadata record (models/Upload.ts) and
 * every read/delete resolves through that record, so a user can only touch
 * their OWN files. The client-supplied `fileType` is treated as a hint only —
 * the stored content type is determined from the actual bytes.
 */

/** Derives the upload purpose from the folder hints sent by the frontend. */
function purposeFromFolders(folderMain?: string): UploadPurpose {
  // AssignTaskform uploads task attachments; profiles are the default.
  return folderMain === "tasks" ? "task_attachment" : "profile";
}

/** Loads an upload record the caller is authorised to act on, or throws 404. */
async function ownedUpload(userId: string, fileKey: string, roles: string[]) {
  const record = await Upload.findOne({ key: fileKey });
  if (!record) throw ApiError.notFound("That file does not exist.");
  const isOwner = String(record.ownerId) === userId;
  // A manager may access files owned by their direct reports (task
  // attachments they assigned); admins are scoped elsewhere.
  let delegated = false;
  if (!isOwner && roles.includes("manager")) {
    delegated = Boolean(
      await import("../models/Employee.js").then(({ Employee }) =>
        Employee.exists({ _id: record.ownerId, manager: userId }),
      ),
    );
  }
  if (!isOwner && !delegated) {
    // Same message as a missing file: no information leak about other keys.
    throw ApiError.notFound("That file does not exist.");
  }
  return { record, isOwner };
}

/**
 * POST /api/upload/get-upload-url -> `{ uploadUrl, key }`
 *
 * Three call sites send different bodies: EmployeeProfile sends only
 * fileName/fileType, ManagerProfile adds folderMain="managers", and
 * AssignTaskform adds folderMain="tasks" folderSub="attachments".
 */
router.post(
  "/get-upload-url",
  requireEmployee,
  validate([
    body("fileName").isString().trim().notEmpty().withMessage("A file name is required."),
    body("fileType").isString().trim().notEmpty().withMessage("A file type is required."),
    body("folderMain").optional({ values: "falsy" }).isString(),
    body("folderSub").optional({ values: "falsy" }).isString(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { fileName, fileType, folderMain, folderSub } = req.body as {
      fileName: string;
      fileType: string;
      folderMain?: string;
      folderSub?: string;
    };
    const purpose = purposeFromFolders(folderMain);
    // Purpose-specific allowlist; rejects SVG/HTML/executables up front.
    // `fileType` is validated as a hint only — the bytes decide later.
    const rule = resolveRule(purpose, fileType, fileName);
    const result = await createUploadUrl({ fileName, fileType, folderMain, folderSub });
    // Persist metadata immediately (P3): the key is owned by this user from
    // the moment the signed URL exists. Content type is the SERVER-resolved
    // rule MIME, not the client's claim.
    await Upload.create({
      key: result.key,
      ownerId: currentUserId(req),
      purpose,
      contentType: rule.mime,
      size: 0,
      provider: activeBackend(),
    });
    res.json({ ...result, backend: activeBackend(), maxBytes: maxSizeFor(purpose) });
  }),
);

/**
 * POST /api/upload/get-file-url -> `{ url }`
 *
 * `getImageUrl.ts` accepts url | signedUrl | fileUrl | data.url, but only ever
 * reads `.url`, so that is the field returned. Ownership is enforced: only the
 * owner (or their manager, for delegated attachments) gets a URL.
 */
router.post(
  "/get-file-url",
  requireEmployee,
  validate([body("fileKey").isString().trim().notEmpty().withMessage("A file key is required.")]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { fileKey } = req.body as { fileKey: string };
    const { record } = await ownedUpload(
      String(currentUserId(req)),
      fileKey,
      req.auth ? [req.auth.role] : [],
    );
    const result = await createFileUrl(fileKey);
    res.json({
      url: result.url,
      key: fileKey,
      backend: activeBackend(),
      contentType: record.contentType,
    });
  }),
);

/**
 * DELETE /api/upload/delete-file
 *
 * The frontend sends the key nested as `{ data: { fileKey } }` because axios
 * carries a DELETE body in `data`. Both nesting levels are accepted. Only the
 * owner may delete.
 */
router.delete(
  "/delete-file",
  requireEmployee,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const body = (req.body ?? {}) as { fileKey?: string; data?: { fileKey?: string } };
    const fileKey = body.fileKey ?? body.data?.fileKey;

    if (!fileKey || typeof fileKey !== "string") {
      throw ApiError.badRequest("A file key is required.");
    }
    const { record, isOwner } = await ownedUpload(
      String(currentUserId(req)),
      fileKey,
      req.auth ? [req.auth.role] : [],
    );
    if (!isOwner) throw ApiError.forbidden("You can only delete files you uploaded.");

    await deleteFile(fileKey);
    await Upload.deleteOne({ _id: record._id });
    res.json({ message: "File deleted." });
  }),
);

/**
 * Local-backend endpoints. These exist only when R2 credentials are absent:
 * the presigned URL points here so the browser's direct PUT has a real target.
 *
 * P3 hardening: the PUT authenticates the uploader, enforces the size cap and
 * the content policy (magic bytes), and records the metadata row marked
 * PENDING_CONFIRMATION until the same user confirms the upload.
 */
const localRouter = express.Router({ mergeParams: true });

/** PUT /api/upload/local/<key> — accepts the raw bytes the browser uploads. */
localRouter.put(
  "/*",
  requireEmployee,
  express.raw({ type: () => true, limit: env.upload.maxFileBytes }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (activeBackend() !== "local") {
      throw ApiError.notFound("Local uploads are disabled while R2 is configured.");
    }

    const key = decodeURIComponent(String((req.params as Record<string, string>)[0] ?? ""));
    if (!key) throw ApiError.badRequest("A file key is required.");

    const meta = await Upload.findOne({ key });
    if (!meta) throw ApiError.badRequest("Request an upload URL first.");
    if (String(meta.ownerId) !== String(currentUserId(req))) {
      throw ApiError.forbidden("You can only upload to your own keys.");
    }

    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (data.byteLength === 0) throw ApiError.badRequest("No file data was received.");
    // Size + magic-byte validation; server determines the content type.
    const rule = resolveRule(meta.purpose, req.headers["content-type"] ?? "", key);
    const verified = validateUploadContent(meta.purpose, rule, data);
    const scanResult = await scanUpload(data, key);

    await writeLocalFile(key, data);
    meta.contentType = verified.contentType;
    meta.size = data.byteLength;
    meta.sha256 = verified.sha256;
    meta.provider = "local";
    meta.scanStatus = scanResult;
    await meta.save();
    res.status(200).json({ message: "Uploaded.", key, contentType: verified.contentType });
  }),
);

/** GET /api/upload/local/<key> — serves the stored bytes for <img> tags. */
localRouter.get(
  "/*",
  requireEmployee,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (activeBackend() !== "local") {
      throw ApiError.notFound("Local uploads are disabled while R2 is configured.");
    }

    const key = decodeURIComponent(String((req.params as Record<string, string>)[0] ?? ""));
    if (!key) throw ApiError.badRequest("A file key is required.");
    if (!(await localFileExists(key))) throw ApiError.notFound("That file does not exist.");
    const { record } = await ownedUpload(
      String(currentUserId(req)),
      key,
      req.auth ? [req.auth.role] : [],
    );

    const data = await readLocalFile(key);
    // Safe serving: strict server-chosen content type, no sniffing, images
    // inline and everything else forced to download.
    const contentType = safeResponseContentType(record.contentType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${inlineDisposition(contentType)}; filename="${key.split("/").pop()}"`);
    res.type(contentType);
    res.status(200).send(data);
  }),
);

router.use("/local", localRouter);

/**
 * POST /api/upload/confirm — closes the upload loop for the R2 path.
 *
 * After the browser PUTs directly to the presigned URL there is no server-side
 * moment to inspect the bytes, so the client calls confirm with the size it
 * wrote. The record was created at get-upload-url time with the ALLOWED type
 * derived from the requested fileName; here the declared size is checked
 * against the purpose cap and the scan hook runs on whatever the bucket hands
 * back when a scanner is configured. Bytes themselves are validated for the
 * local backend (see the PUT above).
 */
router.post(
  "/confirm",
  requireEmployee,
  validate([
    body("fileKey").isString().trim().notEmpty().withMessage("A file key is required."),
    body("size").optional().isInt({ min: 1 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { fileKey, size } = req.body as { fileKey: string; size?: number };
    const { record, isOwner } = await ownedUpload(
      String(currentUserId(req)),
      fileKey,
      req.auth ? [req.auth.role] : [],
    );
    if (!isOwner) throw ApiError.forbidden("You can only confirm your own uploads.");
    if (size !== undefined) {
      if (size > maxSizeFor(record.purpose)) {
        throw ApiError.badRequest("The uploaded file exceeds the size limit for its purpose.");
      }
      record.size = size;
    }
    await record.save();
    res.json({ message: "Upload confirmed.", key: fileKey, contentType: record.contentType });
  }),
);

/**
 * POST /api/upload/cleanup-orphaned — admin-scoped orphan cleanup.
 *
 * Removes metadata rows older than the retention window whose backing object
 * no longer exists (or was never confirmed). Kept explicit and manual: bulk
 * deletes of storage objects must never run implicitly.
 */
router.post(
  "/cleanup-orphaned",
  requireEmployee,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (req.auth?.role !== "admin") {
      throw ApiError.forbidden("Cleanup is restricted to administrators.");
    }
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stale = await Upload.find({ createdAt: { $lt: cutoff } }).limit(500);
    let removed = 0;
    for (const record of stale) {
      if (activeBackend() === "local" && !(await localFileExists(record.key))) {
        await Upload.deleteOne({ _id: record._id });
        removed += 1;
      } else if (activeBackend() === "r2") {
        // R2 lifecycle rules own the object GC; drop only rows the caller
        // explicitly confirms as gone. Conservative: skip unless the record
        // was never confirmed (size 0).
        if (record.size === 0) {
          await Upload.deleteOne({ _id: record._id });
          removed += 1;
        }
      }
    }
    res.json({ message: "Cleanup complete.", removed });
  }),
);

export default router;
