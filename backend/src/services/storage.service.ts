import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, hasR2Credentials } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Two storage backends behind one interface.
 *
 * R2 is the production store. Without credentials the service falls back to
 * `backend/uploads` and hands back URLs pointing at this API, so profile
 * pictures work in local dev instead of 404ing.
 */
export type StorageBackend = "r2" | "local";

let client: S3Client | null = null;

function r2Client(): S3Client {
  if (!hasR2Credentials()) throw new Error("R2 credentials are not configured.");
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint:
        env.upload.r2.endpoint ||
        `https://${env.upload.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.upload.r2.accessKeyId,
        secretAccessKey: env.upload.r2.secretAccessKey,
      },
    });
  }
  return client;
}

export function activeBackend(): StorageBackend {
  return hasR2Credentials() ? "r2" : "local";
}

/**
 * Normalises a caller-supplied key to a safe, traversal-free path.
 * ManagerProfile prefixes "managers/" and AssignTaskform "tasks/attachments";
 * EmployeeProfile sends a bare filename, so a default folder is applied.
 */
export function sanitizeKey(raw: string, folderMain?: string, folderSub?: string): string {
  const segments: string[] = [];

  const push = (value: string) => {
    const cleaned = value
      .replace(/\\/g, "/")
      .split("/")
      .filter((part) => part && part !== "." && part !== "..")
      .map((part) => part.replace(/[^A-Za-z0-9._-]/g, "_"))
      .filter((part) => part !== "");
    segments.push(...cleaned);
  };

  if (folderMain) push(folderMain);
  if (folderSub) push(folderSub);
  push(raw);

  if (segments.length === 0) {
    throw ApiError.badRequest("A file name is required.");
  }

  // Prefix with a per-upload nonce so two employees uploading "photo.png" never
  // collide, and so the stored name is not fully attacker-controlled.
  const base = segments[segments.length - 1] as string;
  const unique = crypto.randomUUID().slice(0, 8);
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  segments[segments.length - 1] = `${stem}-${unique}${ext}`;

  return segments.join("/");
}

function localPathFor(key: string): string {
  const full = path.resolve(env.upload.localDir, key);
  const root = path.resolve(env.upload.localDir);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw ApiError.badRequest("Invalid file key.");
  }
  return full;
}

/**
 * Base URL for the local fallback store. Overridable at runtime because the
 * configured PORT is not always what the process is actually listening on
 * (ephemeral test ports, or a reverse proxy in front of the API).
 */
let localBaseOverride: string | null = null;

export function setLocalBaseUrl(url: string): void {
  localBaseOverride = url.replace(/\/$/, "");
}

function localBase(): string {
  return localBaseOverride || env.upload.localBaseUrl || `http://localhost:${env.port}`;
}

/** POST /api/upload/get-upload-url -> `{ uploadUrl, key }` */
export async function createUploadUrl(input: {
  fileName: string;
  fileType: string;
  folderMain?: string;
  folderSub?: string;
}): Promise<{ uploadUrl: string; key: string }> {
  const key = sanitizeKey(input.fileName, input.folderMain, input.folderSub);

  if (activeBackend() === "r2") {
    // The client PUTs the raw bytes to this URL with the same Content-Type.
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({
        Bucket: env.upload.r2.bucket,
        Key: key,
        ContentType: input.fileType,
      }),
      { expiresIn: env.upload.signedUrlTtlSeconds },
    );
    return { uploadUrl, key };
  }

  await fs.mkdir(path.dirname(localPathFor(key)), { recursive: true });
  return { uploadUrl: `${localBase()}/api/upload/local/${key}`, key };
}

/** POST /api/upload/get-file-url -> `{ url }` */
export async function createFileUrl(key: string): Promise<{ url: string }> {
  if (/^https?:\/\//i.test(key)) return { url: key };

  if (activeBackend() === "r2") {
    const url = await getSignedUrl(
      r2Client(),
      new GetObjectCommand({ Bucket: env.upload.r2.bucket, Key: key }),
      { expiresIn: 60 * 60 },
    );
    return { url };
  }

  return { url: `${localBase()}/api/upload/local/${key}` };
}

/** DELETE /api/upload/delete-file */
export async function deleteFile(key: string): Promise<void> {
  if (!key) return;

  if (activeBackend() === "r2") {
    await r2Client().send(
      new DeleteObjectCommand({ Bucket: env.upload.r2.bucket, Key: key }),
    );
    return;
  }

  await fs.rm(localPathFor(key), { force: true });
}

/** Reads a locally-stored object; only used by the local PUT/GET routes. */
export async function writeLocalFile(key: string, data: Buffer): Promise<void> {
  if (data.byteLength > env.upload.maxFileBytes) {
    throw new ApiError(413, "That file is larger than the 2 MB limit.");
  }
  const full = localPathFor(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
}

export async function readLocalFile(key: string): Promise<Buffer> {
  return fs.readFile(localPathFor(key));
}

export async function localFileExists(key: string): Promise<boolean> {
  try {
    await fs.access(localPathFor(key));
    return true;
  } catch {
    return false;
  }
}