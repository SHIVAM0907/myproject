/**
 * P3 tests — upload security.
 *
 * Covers: metadata persistence, ownership (get-file-url, delete-file, serving),
 * MIME allowlists (SVG/HTML/exe rejection), oversized uploads, actual-content
 * validation (magic bytes vs claimed type), safe response headers and the
 * malware-scan integration point staying honest ("unscanned" by default).
 */
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV = "test";
process.env.SEED_ON_START = "false";

let memoryServer: MongoMemoryServer | undefined;
let httpServer: import("node:http").Server | undefined;
let base = "";

const passed: string[] = [];
const failed: Array<{ name: string; error: string }> = [];

async function check(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failed.push({ name, error: err instanceof Error ? err.message : String(err) });
  }
}

async function json(res: globalThis.Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { raw: text };
  }
}

async function main(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri("upload_test");

  const { createApp } = await import("../src/app.js");
  const { connectDatabase } = await import("../src/config/db.js");
  const { seedIfEmpty } = await import("../src/seed/seed.js");
  const { Upload } = await import("../src/models/Upload.js");
  const { Employee } = await import("../src/models/Employee.js");

  await connectDatabase();
  await seedIfEmpty();

  const app = createApp();
  httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer!.once("listening", resolve));
  base = `http://127.0.0.1:${httpServer.address() && typeof httpServer.address() === "object" ? (httpServer.address() as { port: number }).port : 0}`;
  // The local-storage upload URL is built from the configured base URL, so
  // point it at this test server (same fix as smoke.ts).
  const { setLocalBaseUrl } = await import("../src/services/storage.service.js");
  setLocalBaseUrl(base);

  async function login(email: string, password: string): Promise<string> {
    const res = await fetch(`${base}/api/employee/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await json(res);
    if (res.status !== 200 || typeof body.token !== "string") throw new Error(`login failed: ${res.status}`);
    return body.token;
  }

  const managerToken = await login("manager@learnilm.test", "Manager@123");
  const employee = await Employee.findOne({ email: "employee@learnilm.test" });
  const employeeToken = await login("employee@learnilm.test", "Employee@123");
  
  const kabirToken = await login("kabir@learnilm.test", "Employee@123");

  async function requestUploadUrl(token: string, fileName: string, fileType: string, folderMain?: string) {
    const res = await fetch(`${base}/api/upload/get-upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fileName, fileType, ...(folderMain ? { folderMain } : {}) }),
    });
    return { status: res.status, body: await json(res) };
  }

  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

  await check("upload metadata is persisted (key, owner, purpose, type, size, provider)", async () => {
    const { body } = await requestUploadUrl(employeeToken, "avatar.png", "image/png");
    assert.ok(body.key, "no key returned");
    const record = await Upload.findOne({ key: body.key });
    assert.ok(record, "metadata record missing");
    assert.equal(String(record.ownerId), String(employee!._id));
    assert.equal(record.purpose, "profile");
    assert.equal(record.contentType, "image/png");
    assert.equal(record.provider, "local");
    assert.equal(["unscanned", "pending", "clean", "infected"].includes(record.scanStatus), true);
  });

  await check("invalid MIME is rejected (SVG, HTML, executables)", async () => {
    for (const [name, type] of [
      ["evil.svg", "image/svg+xml"],
      ["page.html", "text/html"],
      ["payload.exe", "application/x-msdownload"],
      ["run.sh", "application/x-sh"],
      ["notes.pdf", "application/pdf"], // profile purpose only allows images
    ]) {
      const { status } = await requestUploadUrl(employeeToken, name, type);
      assert.equal(status, 422, `${name} (${type}) should be rejected, got ${status}`);
    }
  });

  await check("oversized uploads are rejected on the backend", async () => {
    const { body } = await requestUploadUrl(employeeToken, "big.png", "image/png");
    const big = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]); // > 2MB profile cap
    const res = await fetch(String(body.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeToken}` },
      body: big,
    });
    assert.ok(res.status >= 400, `expected rejection, got ${res.status}`);
  });

  await check("content must match its declared type (magic bytes, not the claim)", async () => {
    const { body } = await requestUploadUrl(employeeToken, "fake.png", "image/png");
    // A polyglot: text that claims to be a PNG. The bytes say otherwise.
    const imposter = Buffer.from("<script>alert(1)</script>", "utf8");
    const res = await fetch(String(body.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeToken}` },
      body: imposter,
    });
    assert.equal(res.status, 422, `imposter content must be rejected, got ${res.status}`);
  });

  await check("a genuine PNG round-trips and is served with safe headers", async () => {
    const { body } = await requestUploadUrl(employeeToken, "real.png", "image/png");
    const res = await fetch(String(body.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeToken}` },
      body: PNG,
    });
    assert.equal(res.status, 200);
    const record = await Upload.findOne({ key: body.key });
    assert.ok(record, "record must exist");
    assert.equal(record!.contentType, "image/png", "stored type must come from the bytes/rule");
    assert.ok(record!.sha256, "checksum recorded");

    const url = await fetch(`${base}/api/upload/get-file-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ fileKey: body.key }),
    });
    const urlBody = await json(url);
    const served = await fetch(String(urlBody.url), {
      headers: { Authorization: `Bearer ${employeeToken}` },
    });
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.match(served.headers.get("content-type") ?? "", /^image\/png/);
    assert.match(served.headers.get("content-disposition") ?? "", /^inline/);
  });

  await check("get-file-url refuses another user's file", async () => {
    const { body } = await requestUploadUrl(employeeToken, "mine.png", "image/png");
    await fetch(String(body.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeToken}` },
      body: PNG,
    });
    const res = await fetch(`${base}/api/upload/get-file-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${kabirToken}` },
      body: JSON.stringify({ fileKey: body.key }),
    });
    assert.equal(res.status, 404, `cross-user read must fail like a missing file, got ${res.status}`);
  });

  await check("unauthorized deletion is denied (owner-only)", async () => {
    const { body } = await requestUploadUrl(employeeToken, "deleteme.png", "image/png");
    await fetch(String(body.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeToken}` },
      body: PNG,
    });
    const res = await fetch(`${base}/api/upload/delete-file`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${kabirToken}` },
      body: JSON.stringify({ fileKey: body.key }),
    });
    assert.ok([403, 404].includes(res.status), `expected denial, got ${res.status}`);
    // The file survives.
    const record = await Upload.findOne({ key: body.key });
    assert.ok(record, "file must survive someone else's delete attempt");
  });

  await check("the owner can delete their own upload (metadata removed too)", async () => {
    const { body } = await requestUploadUrl(employeeToken, "mine2.png", "image/png");
    const del = await fetch(`${base}/api/upload/delete-file`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${employeeToken}` },
      body: JSON.stringify({ fileKey: body.key }),
    });
    assert.equal(del.status, 200);
    assert.equal(await Upload.exists({ key: body.key }), null, "metadata must be cleaned up");
  });

  await check("manager can access attachments belonging to their reports", async () => {
    // Employee uploads a task attachment.
    const { body } = await requestUploadUrl(employeeToken, "spec.png", "image/png", "tasks");
    await fetch(String(body.uploadUrl), {
      method: "PUT",
      headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeToken}` },
      body: PNG,
    });
    const managerView = await fetch(`${base}/api/upload/get-file-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${managerToken}` },
      body: JSON.stringify({ fileKey: body.key }),
    });
    assert.equal(managerView.status, 200, `manager delegated access expected, got ${managerView.status}`);
    // An unrelated employee still cannot.
    const stranger = await Employee.findOne({ email: "meera@learnilm.test" });
    if (stranger && employee!.manager) {
      assert.notEqual(String(stranger._id), String(employee!.manager));
    }
    const strangerView = await fetch(`${base}/api/upload/get-file-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${kabirToken}` },
      body: JSON.stringify({ fileKey: body.key }),
    });
    assert.equal(strangerView.status, 404);
  });

  await check("malware scanning stays honest: unscanned until a scanner is configured", async () => {
    const { configureMalwareScanner, scanUpload } = await import("../src/services/uploadSecurity.js");
    assert.equal(await scanUpload(PNG, "a.png"), "unscanned", "no scanner configured by default");
    configureMalwareScanner(async () => "clean");
    assert.equal(await scanUpload(PNG, "a.png"), "clean");
    configureMalwareScanner(async () => {
      throw new Error("scanner crashed");
    });
    assert.equal(await scanUpload(PNG, "a.png"), "infected", "a failing scanner must never say clean");
    configureMalwareScanner(null);
  });

  await check("do not trust the client fileType: a mislabeled PNG is corrected", async () => {
    // Client claims image/gif with a .png name; the rule resolves to PNG and
    // the recorded type is the server's decision.
    const { status, body } = await requestUploadUrl(employeeToken, "truth.png", "image/gif");
    assert.equal(status, 200, "extension-consistent name should be accepted despite odd claim");
    const record = await Upload.findOne({ key: body.key });
    assert.ok(record, "record must exist");
    assert.equal(record!.contentType, "image/png", "stored type must come from the rule, not the claim");
  });

  console.log(`\n[upload-security] ${passed.length} passed, ${failed.length} failed`);
  for (const f of failed) console.error(`  FAIL: ${f.name}\n    ${f.error}`);
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("[test] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (httpServer) {
      httpServer.closeAllConnections?.();
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
    const { disconnectDatabase } = await import("../src/config/db.js");
    await disconnectDatabase().catch(() => undefined);
    await memoryServer?.stop().catch(() => undefined);
  });
