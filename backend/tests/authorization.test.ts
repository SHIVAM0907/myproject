/**
 * P4 tests — object-level authorization (cross-team denial).
 *
 * Two managers with disjoint teams; every affected endpoint must refuse
 * cross-team access for each of them, and accept the in-team path.
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

interface Res {
  status: number;
  body: Record<string, unknown>;
}
const H = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

async function req(method: string, path: string, token: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: H(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await json(res) };
}

async function main(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = memoryServer.getUri("authz_test");

  const { createApp } = await import("../src/app.js");
  const { connectDatabase } = await import("../src/config/db.js");
  const { seedIfEmpty } = await import("../src/seed/seed.js");
  const { Employee } = await import("../src/models/Employee.js");
  const { Task } = await import("../src/models/Task.js");
  const { Query } = await import("../src/models/Query.js");

  await connectDatabase();
  await seedIfEmpty();

  const app = createApp();
  httpServer = app.listen(0);
  await new Promise<void>((resolve) => httpServer!.once("listening", resolve));
  base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;

  async function login(email: string, password: string): Promise<string> {
    const r = await req("POST", "/api/employee/login", "", { email, password }).then((r) => r.body);
    if (typeof r.token !== "string") throw new Error(`login failed for ${email}`);
    return r.token;
  }

  const managerToken = await login("manager@learnilm.test", "Manager@123");
  const manager = await Employee.findOne({ email: "manager@learnilm.test" });
  const employeeToken = await login("employee@learnilm.test", "Employee@123");
  const employee = await Employee.findOne({ email: "employee@learnilm.test" });

  // --- build a SECOND, disjoint team ---
  const managerB = await Employee.create({
    firstName: "Belen",
    lastName: "Ortega",
    email: "manager-b@learnilm.test",
    password: "Manager@123",
    employeeCode: "MGR-0100",
    role: "manager",
  });
  const employeeB = await Employee.create({
    firstName: "Boris",
    lastName: "Vance",
    email: "employee-b@learnilm.test",
    password: "Employee@123",
    employeeCode: "EMP-0100",
    role: "employee",
    manager: managerB._id,
  });
  const managerBToken = await login("manager-b@learnilm.test", "Manager@123");

  // Task owned by manager A's report.
  const taskA = await Task.create({
    taskId: "T-A-1",
    title: "Team A task",
    assignedTo: employee!._id,
    assignedBy: manager!._id,
  });
  // Task owned by manager B's report.
  const taskB = await Task.create({
    taskId: "T-B-1",
    title: "Team B task",
    assignedTo: employeeB._id,
    assignedBy: managerB._id,
  });
  // Query raised by each team's employee.
  const queryA = await Query.create({ employee: employee!._id, task: taskA._id, message: "A?" });
  const queryB = await Query.create({ employee: employeeB._id, task: taskB._id, message: "B?" });

  // ---------- task creation ----------
  await check("task creation: manager cannot assign outside their team", async () => {
    const res = await req("POST", "/api/employee/tasks", managerToken, {
      title: "Cross-team",
      assignedTo: String(employeeB._id),
    });
    assert.equal(res.status, 403, `expected 403 cross-team assignment, got ${res.status}`);
  });

  await check("task creation: manager CAN assign within their team", async () => {
    const res = await req("POST", "/api/employee/tasks", managerToken, {
      title: "In-team",
      assignedTo: String(employee!._id),
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });

  // ---------- task status update ----------
  await check("manager must not update another team's task", async () => {
    const res = await req("PATCH", `/api/employee/tasks/${taskB._id}/status`, managerToken, {
      status: "In Progress",
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  await check("manager CAN update their own team's task", async () => {
    const res = await req("PATCH", `/api/employee/tasks/${taskA._id}/status`, managerToken, {
      status: "In Progress",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  await check("an unrelated employee cannot update someone else's task", async () => {
    const res = await req("PATCH", `/api/employee/tasks/${taskA._id}/status`, employeeB._id ? await login("employee-b@learnilm.test", "Employee@123") : "", {
      status: "Completed",
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  // ---------- query review ----------
  await check("manager must not review another team's query", async () => {
    const res = await req("POST", `/api/employee/queries/${queryB._id}/review`, managerToken, {
      status: "in_review",
      review: "nope",
    });
    assert.equal(res.status, 403, `expected 403, got ${res.status}`);
  });

  await check("manager CAN review their own team's query", async () => {
    const res = await req("POST", `/api/employee/queries/${queryA._id}/review`, managerToken, {
      status: "in_review",
      review: "ok",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  await check("manager B is likewise denied manager A's team query", async () => {
    const res = await req("POST", `/api/employee/queries/${queryA._id}/review`, managerBToken, {
      status: "in_review",
    });
    assert.equal(res.status, 403);
  });

  // ---------- list scoping ----------
  await check("GET /team/tasks lists only own-team records", async () => {
    const res = await req("GET", "/api/employee/team/tasks", managerToken);
    assert.equal(res.status, 200);
    const tasks = (res.body.tasks as Array<Record<string, unknown>>) ?? [];
    const ids = tasks.map((t) => String(t._id));
    assert.ok(ids.includes(String(taskA._id)), "own team's task should be listed");
    assert.ok(!ids.includes(String(taskB._id)), "other team's task must NOT be listed");
  });

  console.log(`\n[authorization] ${passed.length} passed, ${failed.length} failed`);
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
