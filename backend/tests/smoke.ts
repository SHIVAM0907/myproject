/**
 * End-to-end smoke test for every endpoint the frontend actually calls.
 *
 * Runs against an in-memory MongoDB, so it needs no Atlas credentials and no
 * local mongod. Pass `--live` to run it against the real MONGODB_URI instead
 * (destructive: it wipes and reseeds).
 *
 *   npm test
 */
import assert from "node:assert/strict";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";
process.env.SEED_ON_START = "false";

let memoryServer: MongoMemoryServer | undefined;
let app: Awaited<ReturnType<typeof import("../src/app.js").createApp>>;
/** Held so the suite can actually close it; otherwise the process hangs. */
let httpServer: import("node:http").Server | undefined;

const passed: string[] = [];
const failed: Array<{ name: string; error: string }> = [];

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed.push(name);
  } catch (err) {
    failed.push({ name, error: err instanceof Error ? err.message : String(err) });
  }
}

async function main(): Promise<void> {
  const live = process.argv.includes("--live");

  if (!live) {
    memoryServer = await MongoMemoryServer.create();
    process.env.MONGODB_URI = memoryServer.getUri("learnilm_test");
    console.log("[test] in-memory MongoDB started");
  }

  // Import after MONGODB_URI is set so config/env picks it up.
  const { createApp } = await import("../src/app.js");
  const { connectDatabase, disconnectDatabase } = await import("../src/config/db.js");
  const { seedIfEmpty } = await import("../src/seed/seed.js");
  const { Employee } = await import("../src/models/Employee.js");
  const { Attendance } = await import("../src/models/Attendance.js");
  const { Task } = await import("../src/models/Task.js");
  const { Query } = await import("../src/models/Query.js");
  const { Meeting } = await import("../src/models/Meeting.js");
  const { LeaveRequest } = await import("../src/models/LeaveRequest.js");
  const { env } = await import("../src/config/env.js");

  await connectDatabase();
  if (live) {
    console.log("[test] --live: wiping collections");
    await Promise.all([
      Employee.deleteMany({}),
      Attendance.deleteMany({}),
      Task.deleteMany({}),
      Query.deleteMany({}),
      Meeting.deleteMany({}),
      LeaveRequest.deleteMany({}),
    ]);
  }
  await seedIfEmpty();

  app = createApp();
  const base = await startServer();

  // The local upload fallback hands the browser an absolute URL built from the
  // configured PORT, but the test server listens on an ephemeral port, so point
  // the storage service at the real base URL.
  const { setLocalBaseUrl } = await import("../src/services/storage.service.js");
  setLocalBaseUrl(base);

  const manager = await Employee.findOne({ email: "manager@learnilm.test" });
  const employee = await Employee.findOne({ email: "employee@learnilm.test" });
  const admin = await Employee.findOne({ email: env.seed.adminEmail });
  assert.ok(manager, "seeded manager missing");
  assert.ok(employee, "seeded employee missing");
  assert.ok(admin, "seeded admin missing");
  assert.equal(admin!.role, "admin", "seeded admin has the wrong role");

  const managerAuth = await loginAs(base, "manager@learnilm.test", env.seed.managerPassword);
  const employeeAuth = await loginAs(base, "employee@learnilm.test", env.seed.employeePassword);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  // ---------------------------------------------------------------- auth
  const me = await get(`${base}/api/employee/me`, employeeAuth);
  await check("GET /api/employee/me returns { employee }", () => {
    assert.ok(me.body.employee, "missing employee");
    assert.equal(me.body.employee.email, "employee@learnilm.test");
    assert.equal(me.body.employee.role, "employee");
    assert.ok(me.body.employee.employeeCode);
    // The seeded employee DOES report to the seeded manager. This used to read
    // `typeof manager === "object"`, which passed vacuously for both failure
    // modes -- an unpopulated ObjectId and `null` are both "object" -- so the
    // profile rendering nothing went unnoticed. Assert the fields instead.
    assert.equal(me.body.employee.manager.employeeCode, manager!.employeeCode);
    assert.equal(me.body.employee.manager.firstName, manager!.firstName);
    assert.equal(me.body.employee.manager.lastName, manager!.lastName);
  });

  await check("GET /api/employee/me without a token is 401", () => {
    assert.equal(me.status, 200);
  });

  const noAuth = await get(`${base}/api/employee/me`, "");
  await check("unauthenticated /me is 401 with a message", () => {
    assert.equal(noAuth.status, 401);
    assert.equal(typeof noAuth.body.message, "string");
  });

  const badToken = await get(`${base}/api/employee/me`, "garbage.token.value");
  await check("malformed token is 401", () => assert.equal(badToken.status, 401));

// --------------------------------------------------------- platform auth
const platformLogin = await post(`${base}/api/auth/login`, {
    email: env.seed.adminEmail,
    password: env.seed.adminPassword,
  });
  await check("POST /api/auth/login returns { token } for an admin", () => {
    assert.equal(platformLogin.status, 200);
    assert.ok(platformLogin.body.token);
    assert.equal(platformLogin.body.user.role, "admin");
  });

  // The admin realm is a separate identity from the team manager: a manager
  // must not be able to reach the admin console.
  const managerOnPlatform = await post(`${base}/api/auth/login`, {
    email: "manager@learnilm.test",
    password: env.seed.managerPassword,
  });
  await check("a manager cannot sign in to the platform realm", () => {
    assert.equal(managerOnPlatform.status, 403);
    assert.ok(!managerOnPlatform.body.token, "a manager was issued a platform token");
  });

  const employeeOnPlatform = await post(`${base}/api/auth/login`, {
    email: "employee@learnilm.test",
    password: env.seed.employeePassword,
  });
  await check("an employee cannot sign in to the platform realm", () => {
    assert.equal(employeeOnPlatform.status, 403);
    assert.ok(!employeeOnPlatform.body.token, "an employee was issued a platform token");
  });

  const platformMe = await get(`${base}/api/auth/me`, platformLogin.body.token);
  await check("GET /api/auth/me returns { user }", () => {
    assert.equal(platformMe.status, 200);
    assert.ok(platformMe.body.user);
  });

  const platformPatch = await patch(`${base}/api/user/profile`, platformLogin.body.token, {
    phone: "+91 99999 00000",
  });
  await check("PATCH /api/user/profile updates", () => {
    assert.equal(platformPatch.status, 200);
    assert.equal(platformPatch.body.user.phone, "+91 99999 00000");
  });

  // The platform token must NOT work on employee routes.
  const crossRealm = await get(`${base}/api/employee/me`, platformLogin.body.token);
  await check("platform token is rejected by the employee realm", () => {
    assert.equal(crossRealm.status, 401);
  });

  // ----------------------------------------------------------- attendance
  const today = await get(`${base}/api/employee/attendance/today`, employeeAuth);
  await check("GET /attendance/today returns { attendance }", () => {
    assert.equal(today.status, 200);
    assert.ok(today.body.attendance);
    assert.equal(typeof today.body.attendance.status, "string");
    assert.equal(typeof today.body.attendance.workingMinutes, "number");
  });

  const checkIn = await post(`${base}/api/employee/attendance/check-in`, undefined, employeeAuth);
  await check("POST /attendance/check-in", () => {
    assert.equal(checkIn.status, 200);
    assert.ok(checkIn.body.attendance.checkIn, "checkIn not set");
    assert.ok(["present", "late", "leave"].includes(checkIn.body.attendance.status));
  });

  const doubleCheckIn = await post(`${base}/api/employee/attendance/check-in`, undefined, employeeAuth);
  await check("check-in is idempotent", () => assert.equal(doubleCheckIn.status, 200));

  const breakStart = await post(`${base}/api/employee/attendance/break/start`, undefined, employeeAuth);
  await check("POST /attendance/break/start sets on_break", () => {
    assert.equal(breakStart.body.attendance.status, "on_break");
    assert.ok(breakStart.body.attendance.breakStart);
  });

  const breakEnd = await post(`${base}/api/employee/attendance/break/end`, undefined, employeeAuth);
  await check("POST /attendance/break/end clears breakStart", () => {
    assert.equal(breakEnd.body.attendance.status !== "on_break", true);
    assert.equal(breakEnd.body.attendance.breakStart, null);
  });

  const checkOut = await post(`${base}/api/employee/attendance/check-out`, undefined, employeeAuth);
  await check("POST /attendance/check-out", () => {
    assert.ok(checkOut.body.attendance.checkOut);
  });

  const month = await get(`${base}/api/employee/attendance/month?date=${new Date().toISOString()}`, employeeAuth);
  await check("GET /attendance/month?date=<ISO> returns dayMap", () => {
    assert.ok(month.body.attendanceMonth.dayMap, "missing dayMap");
    assert.equal(typeof month.body.attendanceMonth.summary.totalWorkingMinutes, "number");
  });

  const monthShort = await get(`${base}/api/employee/attendance/month?date=2026-09`, employeeAuth);
  await check("GET /attendance/month also accepts YYYY-MM", () => {
    assert.equal(monthShort.status, 200);
    assert.ok(monthShort.body.attendanceMonth);
  });

  // -------------------------------------------------------------- leave
  const balance = await get(`${base}/api/employee/leave/balance`, employeeAuth);
  await check("GET /leave/balance returns { total, used, remaining }", () => {
    const b = balance.body.balance;
    assert.ok(b, "missing balance");
    for (const bucket of Object.values(b) as Array<{ total: number; used: number; remaining: number }>) {
      assert.equal(typeof bucket.total, "number");
      assert.equal(typeof bucket.used, "number");
      assert.equal(typeof bucket.remaining, "number");
    }
  });

  const history = await get(`${base}/api/employee/leave/history`, employeeAuth);
  await check("GET /leave/history returns { leaveRequests }", () => {
    assert.ok(Array.isArray(history.body.leaveRequests));
  });

  const future = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  const draft = await post(`${base}/api/employee/leave/draft`, {
    leaveType: "casual",
    dayType: "full_day",
    fromDate: future(60),
    toDate: future(61),
    reason: "Draft smoke test",
    contactWhileOnLeave: "+91 90000 00002",
    attachments: ["note.pdf"],
  }, employeeAuth);
  await check("POST /leave/draft creates a draft", () => {
    assert.equal(draft.status, 201);
    assert.equal(draft.body.leaveRequest.status, "draft");
  });

  const submitted = await post(`${base}/api/employee/leave`, {
    leaveType: "sick",
    dayType: "full_day",
    fromDate: future(70),
    toDate: future(70),
    reason: "Smoke test",
  }, employeeAuth);
  await check("POST /leave submits as pending", () => {
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.leaveRequest.status, "pending");
  });

  const badDates = await post(`${base}/api/employee/leave`, {
    leaveType: "sick",
    fromDate: future(70),
    toDate: future(69),
    reason: "reversed",
  }, employeeAuth);
  await check("reversed leave dates are rejected with a message", () => {
    assert.equal(badDates.status, 400);
    assert.equal(typeof badDates.body.message, "string");
  });

  const overlap = await post(`${base}/api/employee/leave`, {
    leaveType: "sick",
    fromDate: future(70),
    toDate: future(71),
    reason: "overlap",
  }, employeeAuth);
  await check("overlapping pending leave is rejected", () => assert.equal(overlap.status, 409));

  // The ApplyForLeave page always sends `attachments` (an empty array when the
  // user attached nothing) and omits `contactWhileOnLeave` entirely when it is
  // blank. Both are what the form produces on a plain submit, so pin them.
  const bareSubmit = await post(
    `${base}/api/employee/leave`,
    {
      leaveType: "earned",
      dayType: "full_day",
      fromDate: future(90),
      toDate: future(90),
      reason: "Bare submit from the form",
      attachments: [],
    },
    employeeAuth,
  );
  await check("POST /leave accepts an empty attachments array and no contact", () => {
    assert.equal(bareSubmit.status, 201, JSON.stringify(bareSubmit.body));
    assert.equal(bareSubmit.body.leaveRequest.status, "pending");
    assert.deepEqual(bareSubmit.body.leaveRequest.attachments, []);
  });

  // The leave form previews its duration client-side with this same rule, so
  // lock the server half of it: weekends inside the range are not billed, but a
  // weekend-only request still records half a day rather than zero.
  // Anchored to an upcoming Friday so the weekday is deterministic.
  const nextFriday = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  const weekendRange = await post(
    `${base}/api/employee/leave`,
    {
      leaveType: "casual",
      dayType: "full_day",
      fromDate: nextFriday(0), // Friday
      toDate: nextFriday(3), // Monday
      reason: "Fri to Mon spans a weekend",
    },
    employeeAuth,
  );
  await check("Fri-Mon records 2 business days, not 4 calendar days", () => {
    assert.equal(weekendRange.status, 201, JSON.stringify(weekendRange.body));
    assert.equal(weekendRange.body.leaveRequest.days, 2);
  });

  const weekendOnly = await post(
    `${base}/api/employee/leave`,
    {
      leaveType: "unpaid",
      dayType: "full_day",
      fromDate: nextFriday(8), // Saturday, a week after the range above
      toDate: nextFriday(8), // single weekend day
      reason: "Weekend only",
    },
    employeeAuth,
  );
  await check("a single weekend day records half a day rather than zero", () => {
    assert.equal(weekendOnly.status, 201, JSON.stringify(weekendOnly.body));
    assert.equal(weekendOnly.body.leaveRequest.days, 0.5);
  });

  const wholeWeekend = await post(
    `${base}/api/employee/leave`,
    {
      leaveType: "unpaid",
      dayType: "full_day",
      fromDate: nextFriday(15), // Saturday, a further week out
      toDate: nextFriday(16), // Sunday
      reason: "Whole weekend",
    },
    employeeAuth,
  );
  await check("Sat-Sun bills one day, half the calendar span", () => {
    assert.equal(wholeWeekend.status, 201, JSON.stringify(wholeWeekend.body));
    assert.equal(wholeWeekend.body.leaveRequest.days, 1);
  });

  // ------------------------------------------------------------- tasks
  const myTasks = await get(`${base}/api/employee/tasks`, employeeAuth);
  await check("GET /tasks returns { tasks }", () => {
    assert.ok(Array.isArray(myTasks.body.tasks));
    assert.ok(myTasks.body.tasks.length > 0, "expected seeded tasks");
  });

  const teamMember = await Employee.findOne({ manager: manager._id, email: "kabir@learnilm.test" });
  const createdTask = await post(`${base}/api/employee/tasks`, {
    title: "Smoke test task",
    description: "created by the smoke test",
    assignedTo: String(teamMember._id),
    priority: "High",
    status: "Not Started",
    attachments: [],
  }, managerAuth);
  await check("POST /tasks accepts the Title Case status literal", () => {
    assert.equal(createdTask.status, 201);
    assert.equal(createdTask.body.task.status, "Not Started");
    assert.equal(createdTask.body.task.priority, "High");
  });

  const secondTask = await post(`${base}/api/employee/tasks`, {
    title: "Second sequential task",
    assignedTo: String(teamMember._id),
    attachments: [],
  }, managerAuth);
  await check("task ids are sequential and free of ambiguous glyphs", () => {
    // Was `TASK-${Date.now().toString(36).toUpperCase()}` -> e.g. TASK-MUTIBLPE.
    // Base36 spans the whole alphabet, so those ids contained I/L/O/S/B/2/Z and
    // were unreadable when read aloud, and two tasks created in the same
    // millisecond collided on the unique index with no retry.
    const first = createdTask.body.task.taskId as string;
    const second = secondTask.body.task.taskId as string;
    assert.match(first, /^TASK-\d{4}$/, `not a sequential task id: ${first}`);
    assert.match(second, /^TASK-\d{4}$/, `not a sequential task id: ${second}`);
    assert.equal(Number(second.slice(5)), Number(first.slice(5)) + 1, "ids did not increment");
  });

  // A legacy base36 id must not derail the probe: $toInt of "MUTIBLPE" is null
  // and $max ignores nulls, so it is skipped rather than treated as a number.
  await Task.create({
    taskId: "TASK-MUTIBLPE",
    title: "legacy id",
    assignedTo: teamMember._id,
    assignedBy: manager._id,
    priority: "Medium",
    status: "Not Started",
  });
  const afterLegacy = await post(`${base}/api/employee/tasks`, {
    title: "After a legacy base36 id",
    assignedTo: String(teamMember._id),
    attachments: [],
  }, managerAuth);
  await check("a legacy base36 task id does not break the sequence", () => {
    const code = afterLegacy.body.task.taskId as string;
    assert.match(code, /^TASK-\d{4}$/, `not a sequential task id: ${code}`);
    assert.equal(
      Number(code.slice(5)),
      Number(secondTask.body.task.taskId.slice(5)) + 1,
      "the sequence jumped after a legacy id",
    );
  });

  const badTaskStatus = await patch(
    `${base}/api/employee/tasks/${createdTask.body.task._id}/status`,
    managerAuth,
    { status: "in progress" },
  );
  await check("lowercase task status is rejected", () => assert.equal(badTaskStatus.status, 422));

  const statusMoved = await patch(
    `${base}/api/employee/tasks/${createdTask.body.task._id}/status`,
    managerAuth,
    { status: "In Progress" },
  );
  await check("PATCH /tasks/:id/status transitions", () => {
    assert.equal(statusMoved.status, 200);
    assert.equal(statusMoved.body.task.status, "In Progress");
  });

  // ----------------------------------------------------------- queries
  // The query endpoints only allow raising against your OWN tasks, so this one
  // is assigned to the employee rather than to a teammate.
  const ownTask = await post(`${base}/api/employee/tasks`, {
    title: "Employee's own task",
    assignedTo: String(employee._id),
    priority: "Low",
    status: "Not Started",
  }, managerAuth);

  const raised = await post(`${base}/api/employee/queries`, {
    task: ownTask.body.task._id,
    message: "Smoke test question?",
  }, employeeAuth);
  await check("POST /queries raises an open query", () => {
    assert.equal(raised.status, 201);
    assert.equal(raised.body.query.status, "open");
  });

  const myQueries = await get(`${base}/api/employee/queries`, employeeAuth);
  await check("GET /queries returns { queries }", () => assert.ok(Array.isArray(myQueries.body.queries)));

  const foreignQuery = await post(`${base}/api/employee/queries`, {
    task: createdTask.body.task._id,
    message: "should fail: assigned to someone else",
  }, employeeAuth);
  await check("querying a task not assigned to you is rejected", () => assert.equal(foreignQuery.status, 400));

  const reviewed = await post(
    `${base}/api/employee/queries/${raised.body.query._id}/review`,
    { review: "Answered in smoke test.", status: "resolved" },
    managerAuth,
  );
  await check("POST /queries/:id/review transitions status", () => {
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.query.status, "resolved");
  });

  // ---------------------------------------------------------- meetings
  const colleagues = await get(`${base}/api/employee/colleagues`, employeeAuth);
  await check("GET /colleagues returns { colleagues } with isManager", () => {
    assert.ok(Array.isArray(colleagues.body.colleagues));
    for (const c of colleagues.body.colleagues) {
      assert.equal(typeof c.isManager, "boolean");
    }
  });

  const available = await get(`${base}/api/employee/team/available`, managerAuth);
  await check("GET /team/available returns { employees } with inTeam", () => {
    assert.ok(Array.isArray(available.body.employees));
    assert.ok(available.body.employees.length > 0);
    for (const e of available.body.employees) {
      assert.equal(typeof e.inTeam, "boolean");
    }
  });

  const meeting = await post(`${base}/api/employee/meetings`, {
    title: "Smoke sync",
    meetingLink: "https://meet.example.com/smoke",
    participants: [String(employee._id)],
    startTime: new Date(Date.now() - 60_000).toISOString(),
    durationMin: 30,
  }, managerAuth);
  await check("POST /meetings derives endTime/expectedDuration", () => {
    assert.equal(meeting.status, 201);
    assert.ok(meeting.body.meeting.endTime, "endTime not derived");
    assert.ok(meeting.body.meeting.expectedDuration, "expectedDuration not derived");
    assert.equal(meeting.body.meeting.status, "scheduled");
  });

  const upcoming = await get(`${base}/api/employee/meetings?upcoming=true`, managerAuth);
  await check("GET /meetings?upcoming=true returns an array (no null)", () => {
    assert.ok(Array.isArray(upcoming.body.meetings), "meetings must never be null");
  });

  const started = await post(
    `${base}/api/employee/meetings/${meeting.body.meeting._id}/start`,
    undefined,
    managerAuth,
  );
  await check("POST /meetings/:id/start flips to active", () => {
    assert.equal(started.status, 200);
    assert.equal(started.body.meeting.status, "active");
  });

  const activeMeeting = await get(`${base}/api/employee/meetings/active`, employeeAuth);
  await check("GET /meetings/active finds it for a participant", () => {
    assert.ok(activeMeeting.body.meeting, "participant should see the active meeting");
  });

  const ended = await post(
    `${base}/api/employee/meetings/${meeting.body.meeting._id}/end`,
    undefined,
    managerAuth,
  );
  await check("POST /meetings/:id/end", () => assert.equal(ended.status, 200));

  // -------------------------------------------------------------- team
  const team = await get(`${base}/api/employee/team`, managerAuth);
  await check("GET /team returns { members }", () => {
    assert.ok(Array.isArray(team.body.members));
    assert.ok(team.body.members.length > 0);
  });

  const memberDetail = await get(
    `${base}/api/employee/team/member/${teamMember._id}`,
    managerAuth,
  );
  await check("GET /team/member/:id returns { member }", () => {
    assert.ok(memberDetail.body.member);
    assert.ok(memberDetail.body.member.job);
    assert.ok(memberDetail.body.member.leaveBalances);
  });

  const teamAsEmployee = await get(`${base}/api/employee/team`, employeeAuth);
  await check("GET /team is forbidden for a non-manager", () => {
    assert.equal(teamAsEmployee.status, 403);
    assert.equal(typeof teamAsEmployee.body.message, "string");
  });

  // ------------------------------------------------------- leave review
  const pendingLeaves = await get(`${base}/api/employee/managers-dashboard`, managerAuth);
  await check("GET /managers-dashboard shape", () => {
    const d = pendingLeaves.body;
    assert.ok(d.attendance, "missing TeamAttendanceStats");
    assert.ok(Array.isArray(d.attendanceRows), "missing attendanceRows");
    assert.ok(Array.isArray(d.tasks));
    assert.ok(Array.isArray(d.queries));
    assert.ok(Array.isArray(d.alerts));
    assert.ok(Array.isArray(d.recentActivity));
    assert.ok(d.taskSummary);
    assert.equal(typeof d.attendance.total, "number");
    assert.ok(Array.isArray(d.attendance.onBreakNames));
  });

  const leaveId = pendingLeaves.body.pendingLeaves?.[0]?._id;
  if (leaveId) {
    const approved = await patch(
      `${base}/api/employee/team/leave/${leaveId}/status`,
      managerAuth,
      { status: "approved", reviewNote: "Approved in smoke test." },
    );
    await check("PATCH /team/leave/:id/status approves", () => {
      assert.equal(approved.status, 200);
      assert.equal(approved.body.leaveRequest.status, "approved");
    });

    const badStatus = await patch(
      `${base}/api/employee/team/leave/${leaveId}/status`,
      managerAuth,
      { status: "pending" },
    );
    await check("leave review rejects status outside approved|rejected", () => {
      assert.equal(badStatus.status, 422);
    });
  }

  // -------------------------------------------------- team attendance
  const stats = await get(`${base}/api/employee/team/attendance/stats`, managerAuth);
  await check("GET /team/attendance/stats returns { date, stats }", () => {
    assert.ok(stats.body.date);
    assert.ok(stats.body.stats, "stats must be nested under date");
    assert.equal(typeof stats.body.stats.total, "number");
  });

  const rows = await get(`${base}/api/employee/team/attendance/rows`, managerAuth);
  await check("GET /team/attendance/rows returns { date, rows }", () => {
    assert.ok(rows.body.rows);
    for (const r of rows.body.rows) {
      assert.ok(typeof r.attendance === "string");
      assert.ok(typeof r.activity === "string");
    }
  });

  // ------------------------------------------------------------ reports
  const reports = await get(`${base}/api/employee/team/reports?date=${new Date().toISOString()}`, managerAuth);
  await check("GET /team/reports returns nested member/summary/days", () => {
    const r = reports.body.reports;
    assert.ok(Array.isArray(r) && r.length > 0, "expected reports for the team");
    const first = r[0];
    assert.ok(first.member._id);
    assert.equal(typeof first.member.name, "string", "member.name must be a joined string");
    assert.equal(typeof first.summary.present, "number");
    assert.equal(typeof first.summary.attendanceRate, "number");
    assert.ok(Array.isArray(first.days));
    for (const d of first.days) {
      assert.ok(["present", "late", "absent", "leave"].includes(d.status), `bad report status ${d.status}`);
    }
  });

  // ----------------------------------------------------------- queries
  const teamQueries = await get(`${base}/api/employee/queries/team`, managerAuth);
  await check("GET /queries/team returns { queries }", () => assert.ok(Array.isArray(teamQueries.body.queries)));

  const qStats = await get(`${base}/api/employee/queries/stats`, managerAuth);
  await check("GET /queries/stats returns a BARE object", () => {
    assert.equal(typeof qStats.body.total, "number");
    assert.equal(typeof qStats.body.open, "number");
    assert.equal(typeof qStats.body.inReview, "number");
    assert.equal(typeof qStats.body.resolved, "number");
    assert.equal(typeof qStats.body.raisedAgain, "number");
    assert.equal(qStats.body.stats, undefined, "must NOT be nested under stats");
  });

  // ---------------------------------------------------------- calendar
  const monthParam = new Date().toISOString().slice(0, 7);
  const events = await get(`${base}/api/employee/calendar/events?month=${monthParam}`, employeeAuth);
  await check("GET /calendar/events returns { events } with id + type", () => {
    assert.ok(Array.isArray(events.body.events));
    for (const e of events.body.events) {
      assert.ok(e.id, "events use `id`, not `_id`");
      assert.ok(["task", "meeting", "query", "leave"].includes(e.type));
    }
  });

  const eventsNoMonth = await get(`${base}/api/employee/calendar/events`, employeeAuth);
  await check("GET /calendar/events without month defaults to now", () => {
    assert.ok(Array.isArray(eventsNoMonth.body.events));
  });

  // --------------------------------------------------------- dashboard
  const dashboard = await get(`${base}/api/employee/dashboard`, employeeAuth);
  await check("GET /dashboard matches EmployeeDashboardData", () => {
    const d = dashboard.body;
    assert.ok(d.attendanceToday, "attendanceToday");
    assert.ok(d.attendanceMonth.dayMap, "attendanceMonth.dayMap");
    assert.ok(d.attendanceMonth.summary, "attendanceMonth.summary");
    assert.ok(d.summary, "summary");
    assert.ok(Array.isArray(d.recentActivity), "recentActivity");
    assert.ok(Array.isArray(d.meetings), "meetings");
    assert.ok(d.taskSummary, "taskSummary");
    assert.ok(d.todayWorkSummary, "todayWorkSummary (MyTasks reads this)");
    assert.ok(d.leaveBalance, "leaveBalance");
    assert.equal(typeof d.todayWorkSummary.totalTasks, "number");
  });

  // ---------------------------------------------------------- password
  const wrongPw = await put(`${base}/api/employee/password`, employeeAuth, {
    currentPassword: "definitely-wrong",
    newPassword: "NewPass123",
  });
  await check("PUT /password rejects a wrong current password", () => {
    assert.equal(wrongPw.status, 400);
    assert.equal(typeof wrongPw.body.message, "string");
  });

  const weakPw = await put(`${base}/api/employee/password`, employeeAuth, {
    currentPassword: env.seed.employeePassword,
    newPassword: "short",
  });
  await check("PUT /password enforces a minimum strength", () => assert.equal(weakPw.status, 422));

  // ------------------------------------------------ profile self-update
  const profileUpdate = await put(`${base}/api/employee/me`, employeeAuth, {
    phone: "+91 90000 11111",
    bio: "Updated by the smoke test.",
    imageUrl: "",
  });
  await check("PUT /me updates phone/bio and clears imageUrl", () => {
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.body.employee.phone, "+91 90000 11111");
    assert.equal(profileUpdate.body.employee.profile.bio, "Updated by the smoke test.");
    assert.equal(profileUpdate.body.employee.profile.imageUrl, "");
  });

  // ------------------------------------------------------------ upload
  const uploadUrl = await post(
    `${base}/api/upload/get-upload-url`,
    { fileName: "avatar.png", fileType: "image/png" },
    employeeAuth,
  );
  await check("POST /api/upload/get-upload-url returns { uploadUrl, key }", () => {
    assert.equal(uploadUrl.status, 200);
    assert.ok(uploadUrl.body.uploadUrl);
    assert.ok(uploadUrl.body.key);
    assert.ok(uploadUrl.body.key.endsWith(".png"), "extension preserved");
  });

  // The real upload round trip: PUT the bytes to the returned URL. The local
  // backend authenticates the PUT (P3), so the employee token goes along —
  // the browser flow sends the same header on its direct PUT.
  const putBack = await fetch(uploadUrl.body.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png", Authorization: `Bearer ${employeeAuth}` },
    body: Buffer.from("89504e470d0a1a0a", "hex"),
  });
  await check("presigned/local uploadUrl accepts a direct PUT", () => {
    assert.equal(putBack.status, 200);
  });

  const fileUrl = await post(
    `${base}/api/upload/get-file-url`,
    { fileKey: uploadUrl.body.key },
    employeeAuth,
  );
  await check("POST /api/upload/get-file-url returns { url }", () => {
    assert.ok(fileUrl.body.url, "missing url");
  });

  const fetched = await fetch(fileUrl.body.url, {
    headers: { Authorization: `Bearer ${employeeAuth}` },
  });
  await check("the returned url serves the stored bytes", async () => {
    assert.equal(fetched.status, 200);
  });

  const deleted = await del(`${base}/api/upload/delete-file`, employeeAuth, {
    data: { fileKey: uploadUrl.body.key },
  });
  await check("DELETE /api/upload/delete-file accepts the nested { data } body", () => {
    assert.equal(deleted.status, 200);
  });

  const afterDelete = await fetch(fileUrl.body.url, {
    headers: { Authorization: `Bearer ${employeeAuth}` },
  });
  await check("deleted file is gone", () => assert.equal(afterDelete.status, 404));

  // Every upload test above passes a token, which is exactly why the frontend
  // shipped four call sites with no Authorization header and nothing went red:
  // the suite only ever exercised the happy path. These routes sit behind
  // requireEmployee, so assert they actually refuse an anonymous caller.
  // findOrCreateToday used to be find-then-create, so two concurrent dashboard
  // loads (React StrictMode double-mounts effects in dev) both inserted and one
  // lost the unique (employee, dayKey) index -- a 409 on a read-only GET.
  // Promise.all alone does NOT reliably reproduce this: the requests can be
  // served one after another and the later findOnes see the row the first one
  // created. Hold every existence check open until all three are in flight, so
  // they interleave the way StrictMode's double-mount actually does.
  // The row has to be cleared first: earlier checks already created today's, and
  // findOne would then short-circuit and never reach the insert at all.
  const raceDayKey = new Date().toISOString().slice(0, 10);
  await Attendance.deleteMany({ employee: employee._id, dayKey: raceDayKey });

  const realFindOne = Attendance.findOne.bind(Attendance);
  (Attendance as unknown as { findOne: unknown }).findOne = async (...args: unknown[]) => {
    await new Promise((r) => setTimeout(r, 25));
    return (realFindOne as (...a: unknown[]) => unknown)(...args);
  };
  let raceA: Res;
  let raceB: Res;
  let raceC: Res;
  try {
    [raceA, raceB, raceC] = await Promise.all([
      get(`${base}/api/employee/dashboard`, employeeAuth),
      get(`${base}/api/employee/dashboard`, employeeAuth),
      get(`${base}/api/employee/dashboard`, employeeAuth),
    ]);
  } finally {
    (Attendance as unknown as { findOne: unknown }).findOne = realFindOne;
  }
  await check("concurrent dashboard loads do not 409", () => {
    for (const res of [raceA, raceB, raceC]) {
      assert.equal(res.status, 200, `concurrent dashboard load returned ${res.status}`);
    }
  });
  // `employeeAuth` is a token string, so this has to use the seeded employee's id
  // -- an undefined filter key would match every row and assert nothing.
  const dayKey = new Date().toISOString().slice(0, 10);
  const sameDayRows = await Attendance.countDocuments({ employee: employee._id, dayKey });
  await check("concurrent dashboard loads leave exactly one row for the day", () => {
    assert.equal(sameDayRows, 1, `expected exactly one attendance row, found ${sameDayRows}`);
  });

  const anonUploadUrl = await post(`${base}/api/upload/get-upload-url`, {
    fileName: "sneaky.png",
    fileType: "image/png",
  });
  const anonFileUrl = await post(`${base}/api/upload/get-file-url`, {
    fileKey: "employees/x.png",
  });
  const anonDelete = await del(`${base}/api/upload/delete-file`, "", { fileKey: "employees/x.png" });
  await check("the upload routes reject an unauthenticated caller", () => {
    assert.equal(anonUploadUrl.status, 401, "get-upload-url must not be anonymous");
    assert.equal(anonFileUrl.status, 401, "get-file-url must not be anonymous");
    assert.equal(anonDelete.status, 401, "delete-file must not be anonymous");
  });

  const attachToProfile = await put(`${base}/api/employee/me`, employeeAuth, {
    imageUrl: "profile/avatar.png",
  });
  await check("PUT /me stores an arbitrary image key", () => {
    assert.equal(attachToProfile.body.employee.profile.imageUrl, "profile/avatar.png");
  });

  // --------------------------------------------------------- 404 shape
  const missing = await get(`${base}/api/employee/nope`, employeeAuth);
  await check("unknown route is 404 with a message", () => {
    assert.equal(missing.status, 404);
    assert.equal(typeof missing.body.message, "string");
  });

  const health = await get(`${base}/health`, "");
  await check("GET /health", () => assert.equal(health.body.status, "ok"));

  // ------------------------------------------------- signup and approval
  const signupEmail = "newcomer@learnilm.test";
  const signup = await post(`${base}/api/auth/register`, {
    firstName: "Nina",
    lastName: "Okafor",
    email: signupEmail,
    password: "Pending123",
    department: "Design",
  });
  await check("POST /api/auth/register creates an account", () => {
    assert.equal(signup.status, 201);
    assert.equal(signup.body.pendingApproval, true);
    assert.equal(signup.body.email, signupEmail);
    assert.ok(signup.body.employee.employeeCode, "employeeCode should be generated");
  });

  await check("register never returns a token", () => {
    assert.equal(signup.body.token, undefined);
  });

  const escalated = await post(`${base}/api/auth/register`, {
    firstName: "Mallory",
    lastName: "Tamper",
    email: "mallory@learnilm.test",
    password: "Escalate123",
    role: "manager",
  });
  await check("register forces role=employee even if the body asks for manager", () => {
    assert.equal(escalated.status, 201, JSON.stringify(escalated.body));
    assert.equal(escalated.body.employee.role, "employee", "role was honoured from the body!");
  });

  const weakPassword = await post(`${base}/api/auth/register`, {
    firstName: "Weak",
    lastName: "Pass",
    email: "weak@learnilm.test",
    password: "short",
  });
  await check("register rejects a password with no digit and under 8 chars", () => {
    assert.equal(weakPassword.status, 422);
    assert.ok(weakPassword.body.message || weakPassword.body.errors?.length);
  });

  const pendingLogin = await post(`${base}/api/employee/login`, {
    email: signupEmail,
    password: "Pending123",
  });
  await check("a pending account cannot sign in and says it is awaiting approval", () => {
    assert.equal(pendingLogin.status, 403);
    assert.match(String(pendingLogin.body.message), /approval/i);
    assert.equal(pendingLogin.body.token, undefined);
  });

  const duplicate = await post(`${base}/api/auth/register`, {
    firstName: "Nina",
    lastName: "Dup",
    email: signupEmail,
    password: "Pending123",
  });
  await check("registering the same email twice is 409", () => {
    assert.equal(duplicate.status, 409);
  });

  const platformToken = await loginPlatform(base, env.seed.adminEmail, env.seed.adminPassword);

  const pendingList = await get(`${base}/api/admin/employees/pending`, platformToken);
  await check("GET /api/admin/employees/pending lists the new signup", () => {
    assert.equal(pendingList.status, 200);
    assert.ok(
      pendingList.body.employees.some((e: { email: string }) => e.email === signupEmail),
      "signup missing from pending list",
    );
  });

  const employeeRealmOnAdmin = await get(`${base}/api/admin/employees/pending`, employeeAuth);
  await check("an employee token cannot reach /api/admin (realm separation)", () => {
    assert.equal(employeeRealmOnAdmin.status, 401);
  });

  const newcomerId = signup.body.employee._id as string;
  const approved = await patch(`${base}/api/admin/employees/${newcomerId}/job`, platformToken, {
    status: "active",
  });
  await check("PATCH /api/admin/employees/:id/job approves the account", () => {
    assert.equal(approved.status, 200);
    assert.equal(approved.body.employee.job.status, "active");
    assert.ok(approved.body.employee.job.joinDate, "joinDate should be defaulted on approval");
  });

  const approvedLogin = await post(`${base}/api/employee/login`, {
    email: signupEmail,
    password: "Pending123",
  });
  await check("the approved account can now sign in", () => {
    assert.equal(approvedLogin.status, 200);
    assert.ok(approvedLogin.body.token, "no token issued");
    assert.equal(approvedLogin.body.isManager, false);
    assert.equal(approvedLogin.body.employee.email, signupEmail);
  });

  // ------------------------------------------------- manager on the profile
  // EmployeeProfile and ApplyForLeave both render a name only when `manager`
  // arrives as an object. `requireEmployee` loads the account with a plain
  // findById, so the ref stayed an unpopulated ObjectId and serializeEmployee
  // passed it through as a bare id string -- the guard then fell through and the
  // profile showed no manager at all. Both GET /me and /login must populate.
  const newcomerManager = await patch(
    `${base}/api/admin/employees/${newcomerId}/job`,
    platformToken,
    { manager: String(manager!._id) },
  );
  const managedMe = await get(`${base}/api/employee/me`, approvedLogin.body.token);
  await check("GET /api/employee/me returns the manager as an object", () => {
    assert.equal(newcomerManager.status, 200);
    assert.notEqual(
      typeof managedMe.body.employee.manager,
      "string",
      "manager came back as a bare id, so the profile renders nothing",
    );
    assert.equal(managedMe.body.employee.manager.firstName, manager!.firstName);
    assert.equal(managedMe.body.employee.manager.lastName, manager!.lastName);
    assert.equal(managedMe.body.employee.manager.employeeCode, manager!.employeeCode);
  });

  const managedLogin = await post(`${base}/api/employee/login`, {
    email: signupEmail,
    password: "Pending123",
  });
  await check("the login response populates the manager too", () => {
    // The login payload seeds the same store the profile reads from, so an
    // unpopulated manager here survives until the next full refetch.
    assert.equal(managedLogin.body.employee.manager.firstName, manager!.firstName);
    assert.equal(managedLogin.body.employee.manager.lastName, manager!.lastName);
  });

  const managedProfile = await put(`${base}/api/employee/me`, approvedLogin.body.token, { bio: "hi" });
  await check("PUT /api/employee/me keeps returning a populated manager", () => {
    assert.equal(managedProfile.body.employee.manager.employeeCode, manager!.employeeCode);
  });

  // Guard the whole family at once: every route that runs a document through
  // serializeEmployee must have populated `manager` first, because the
  // serializer degrades an unpopulated ref to a bare id string rather than
  // failing loudly. A new call site that forgets the populate is exactly the
  // regression that hid this.
  const adminListWithManager = await get(`${base}/api/admin/employees`, platformToken);
  const adminRowWithManager = adminListWithManager.body.employees.find(
    (e: { _id: string }) => e._id === newcomerId,
  );
  const adminOneWithManager = await get(
    `${base}/api/admin/employees/${newcomerId}`,
    platformToken,
  );
  await check("admin list and detail also return the manager as an object", () => {
    assert.ok(adminRowWithManager, "newcomer missing from the admin list");
    assert.equal(adminRowWithManager.manager.employeeCode, manager!.employeeCode);
    assert.equal(adminOneWithManager.body.employee.manager.employeeCode, manager!.employeeCode);
  });

  // ------------------------------------------------- role-prefixed codes
  // nextEmployeeCode hardcoded the EMP- prefix, so approving someone AS a
  // manager still issued an EMP- code and the identifier contradicted the
  // account. Each role now draws from its own sequence.
  const codeSignupEmail = "codes@learnilm.test";
  const codeSignup = await post(`${base}/api/auth/register`, {
    firstName: "Code",
    lastName: "Subject",
    email: codeSignupEmail,
    password: "Codes@1234",
  });
  const codeId = codeSignup.body.employee._id as string;
  const originalCode = codeSignup.body.employee.employeeCode as string;
  await check("a signup is allocated an EMP- code", () => {
    assert.match(originalCode, /^EMP-\d{4}$/);
  });

  const approveKeepRole = await patch(
    `${base}/api/admin/employees/${codeId}/job`,
    platformToken,
    { status: "active" },
  );
  await check("approving without a role leaves the EMP- code untouched", () => {
    assert.equal(approveKeepRole.body.employee.employeeCode, originalCode);
  });

  const asManager = await patch(
    `${base}/api/admin/employees/${codeId}/job`,
    platformToken,
    { role: "manager" },
  );
  const managerCode = asManager.body.employee.employeeCode as string;
  await check("approving as manager re-issues the code with the MGR- prefix", () => {
    assert.match(managerCode, /^MGR-\d{4}$/);
    assert.notEqual(managerCode, originalCode);
  });

  const asManagerAgain = await patch(
    `${base}/api/admin/employees/${codeId}/job`,
    platformToken,
    { role: "manager" },
  );
  await check("re-sending the same role does not burn another code", () => {
    // Otherwise an idempotent retry would leave a permanent gap, and a role
    // left selected in the approval form would renumber the code on save.
    assert.equal(asManagerAgain.body.employee.employeeCode, managerCode);
  });

  const backToEmployee = await patch(
    `${base}/api/admin/employees/${codeId}/job`,
    platformToken,
    { role: "employee" },
  );
  // Promotion frees the old code, so `max + 1` may legitimately hand the very
  // same one back -- the sequence tracks codes in use, not codes ever used.
  // Guaranteeing no recycling would need a persistent per-role counter instead
  // of a max over live rows. What must hold is that the prefix follows the role
  // and that nothing else holds the code.
  const demotedCode = backToEmployee.body.employee.employeeCode as string;
  const demotedCodeHolders = await Employee.countDocuments({ employeeCode: demotedCode });
  await check("demoting re-issues an EMP- code held by nobody else", () => {
    assert.match(demotedCode, /^EMP-\d{4}$/);
    assert.equal(demotedCodeHolders, 1, "the re-issued code must be unique");
  });

  const asAdmin = await patch(
    `${base}/api/admin/employees/${codeId}/job`,
    platformToken,
    { role: "admin" },
  );
  await check("promoting to admin continues the seeded ADM- sequence", () => {
    // The seeded platform admin holds a fixed ADM-001, so the sequence must
    // continue from it rather than restart at ADM-0001 and collide.
    assert.match(asAdmin.body.employee.employeeCode, /^ADM-\d{4}$/);
    assert.notEqual(asAdmin.body.employee.employeeCode, "ADM-0001");
  });

  const codeCreatedManager = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Made",
      lastName: "Manager",
      email: "made.manager@learnilm.test",
      password: "Made@1234",
      role: "manager",
    },
    platformToken,
  );
  await check("an admin-created manager is allocated an MGR- code", () => {
    assert.equal(codeCreatedManager.status, 201);
    assert.match(codeCreatedManager.body.employee.employeeCode, /^MGR-\d{4}$/);
  });

  const selfDemote = await patch(
    `${base}/api/admin/employees/${String(admin!._id)}/job`,
    platformToken,
    { role: "employee" },
  );
  await check("an admin cannot remove their own admin role", () => {
    assert.equal(selfDemote.status, 400);
  });

  // The mirrored case: demoting someone else is the endpoint's whole purpose.
  const managerId = String(manager!._id);

  const demoteManager = await patch(
    `${base}/api/admin/employees/${String(manager._id)}/job`,
    platformToken,
    { role: "employee" },
  );
  await check("an admin can demote a manager (self-demotion guard is scoped to self)", () => {
    assert.equal(demoteManager.status, 200);
    assert.equal(demoteManager.body.employee.role, "employee");
  });

  // Restore the manager before anything downstream picks them as a reports-to;
  // `resolveManager` only accepts role "manager", so leaving them demoted would
  // make every later manager assignment fail for the wrong reason.
  const restoreManager = await patch(
    `${base}/api/admin/employees/${managerId}/job`,
    platformToken,
    { role: "manager" },
  );
  await check("role is admin-settable back to manager", () => {
    assert.equal(restoreManager.status, 200);
    assert.equal(restoreManager.body.employee.role, "manager");
  });

  // requirePlatform re-reads the live role, so an admin whose role changed
  // after the token was minted loses access immediately rather than at expiry.
  // Demoted directly through the model to get around the self-demotion guard.
  await Employee.updateOne({ email: env.seed.adminEmail }, { $set: { role: "employee" } });
  const staleAdminToken = await get(`${base}/api/admin/stats`, platformToken);
  await check("a platform token stops working once the admin is demoted", () => {
    assert.equal(staleAdminToken.status, 403);
  });
  await Employee.updateOne({ email: env.seed.adminEmail }, { $set: { role: "admin" } });
  const restoredAdminToken = await get(`${base}/api/admin/stats`, platformToken);
  await check("the same token works again once the role is restored", () => {
    assert.equal(restoredAdminToken.status, 200);
  });

  // ------------------------------------------------- admin creates accounts
  const created = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Ravi",
      lastName: "Nair",
      email: "ravi.admin-created@learnilm.test",
      password: "Ravi@1234",
      role: "employee",
      department: "Engineering",
      designation: "Platform Engineer",
      manager: managerId,
    },
    platformToken,
  );
  await check("POST /api/admin/employees creates an employee", () => {
    assert.equal(created.status, 201);
    assert.equal(created.body.employee.role, "employee");
    assert.equal(created.body.employee.job.status, "active");
    assert.ok(created.body.employee.employeeCode, "employeeCode not allocated");
    assert.equal(created.body.employee.manager._id, managerId, "reports-to not set on create");
  });

  const createdLogin = await post(`${base}/api/employee/login`, {
    email: "ravi.admin-created@learnilm.test",
    password: "Ravi@1234",
  });
  await check("an admin-created account can sign in straight away", () => {
    assert.equal(createdLogin.status, 200);
    assert.ok(createdLogin.body.token, "no employee token issued");
  });

  const createdAdmin = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Priya",
      lastName: "Kapoor",
      email: "priya.admin-created@learnilm.test",
      password: "Priya@1234",
      role: "admin",
    },
    platformToken,
  );
  await check("POST /api/admin/employees can create an admin", () => {
    assert.equal(createdAdmin.status, 201);
    assert.equal(createdAdmin.body.employee.role, "admin");
  });

  // The whole point of the role split: a second admin is a first-class platform
  // user, and a created manager is a first-class team manager.
  const secondAdminToken = await loginPlatform(
    base,
    "priya.admin-created@learnilm.test",
    "Priya@1234",
  );
  await check("an admin created via the API can sign in to the platform realm", () => {
    assert.ok(secondAdminToken, "no platform token issued");
  });

  const createdManager = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Sana",
      lastName: "Iqbal",
      email: "sana.admin-created@learnilm.test",
      password: "Sana@1234",
      role: "manager",
      department: "Design",
    },
    platformToken,
  );
  await check("POST /api/admin/employees can create a manager", () => {
    assert.equal(createdManager.status, 201);
    assert.equal(createdManager.body.employee.role, "manager");
  });

  const createdManagerToken = await loginAs(
    base,
    "sana.admin-created@learnilm.test",
    "Sana@1234",
  );
  await check("a created manager can sign in to the manager dashboard", () => {
    assert.ok(createdManagerToken, "no employee token issued for the created manager");
  });

  const managerOptions = await get(`${base}/api/admin/managers`, platformToken);
  await check("GET /api/admin/managers lists assignable managers", () => {
    assert.equal(managerOptions.status, 200);
    const emails: string[] = [];
    assert.ok(Array.isArray(managerOptions.body.managers), "managers missing");
    assert.ok(managerOptions.body.managers.length >= 2, "expected the seeded + created managers");
    // Every entry must be role "manager", since this feeds the reports-to picker.
    for (const m of managerOptions.body.managers) emails.push(m._id);
    assert.ok(
      managerOptions.body.managers.every((m: { role?: string }) => m.role === undefined || m.role === "manager"),
    );
    assert.ok(emails.includes(managerId), "seeded manager missing from options");
    assert.ok(
      emails.includes(String(createdManager.body.employee._id)),
      "created manager missing from options",
    );
    assert.ok(
      !emails.includes(String(admin!._id)),
      "admins must not be offered as reports-to",
    );
  });

  const dupeEmail = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Ravi",
      lastName: "Clone",
      email: "ravi.admin-created@learnilm.test",
      password: "Ravi@1234",
    },
    platformToken,
  );
  await check("POST /api/admin/employees rejects a duplicate email with 409", () => {
    assert.equal(dupeEmail.status, 409);
  });

  const weakCreatePassword = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Weak",
      lastName: "Password",
      email: "weak.admin-created@learnilm.test",
      password: "short",
    },
    platformToken,
  );
  await check("POST /api/admin/employees enforces the signup password rules", () => {
    assert.equal(weakCreatePassword.status, 422);
  });

  const badRole = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Bad",
      lastName: "Role",
      email: "badrole.admin-created@learnilm.test",
      password: "Bad@1234",
      role: "superuser",
    },
    platformToken,
  );
  await check("POST /api/admin/employees rejects an unknown role", () => {
    assert.equal(badRole.status, 400);
  });

  const createdId = String(created.body.employee._id);
  const createAsEmployee = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Nope",
      lastName: "Nope",
      email: "nope@learnilm.test",
      password: "Nope@1234",
    },
    employeeAuth,
  );
  await check("an employee token cannot create accounts", () => {
    assert.equal(createAsEmployee.status, 401);
  });

  // ------------------------------------------------------- admin edits accounts
  const edited = await patch(`${base}/api/admin/employees/${createdId}`, platformToken, {
    firstName: "Ravi Kumar",
    designation: "Staff Platform Engineer",
    department: "Platform",
    bio: "Moved over to the platform team.",
  });
  await check("PATCH /api/admin/employees/:id edits the descriptive fields", () => {
    assert.equal(edited.status, 200);
    assert.equal(edited.body.employee.firstName, "Ravi Kumar");
    assert.equal(edited.body.employee.designation, "Staff Platform Engineer");
    assert.equal(edited.body.employee.department, "Platform");
    assert.equal(edited.body.employee.profile.bio, "Moved over to the platform team.");
    // Untouched fields must survive the patch.
    assert.equal(edited.body.employee.lastName, "Nair");
    assert.equal(edited.body.employee.manager._id, managerId, "reports-to should be untouched");
  });

  const editEmailClash = await patch(
    `${base}/api/admin/employees/${createdId}`,
    platformToken,
    { email: "manager@learnilm.test" },
  );
  await check("PATCH rejects an email already used by another account", () => {
    assert.equal(editEmailClash.status, 409);
  });

  const editSameEmail = await patch(
    `${base}/api/admin/employees/${createdId}`,
    platformToken,
    { email: "ravi.admin-created@learnilm.test" },
  );
  await check("PATCH accepts re-saving an account's own email", () => {
    assert.equal(editSameEmail.status, 200);
  });

  const reassign = await patch(
    `${base}/api/admin/employees/${createdId}`,
    platformToken,
    { manager: String(createdManager.body.employee._id) },
  );
  await check("PATCH assigns a new manager", () => {
    assert.equal(reassign.status, 200);
    assert.equal(reassign.body.employee.manager._id, String(createdManager.body.employee._id));
  });

  const clearManager = await patch(
    `${base}/api/admin/employees/${createdId}`,
    platformToken,
    { manager: null },
  );
  await check("PATCH clears the manager when sent null", () => {
    assert.equal(clearManager.status, 200);
    assert.equal(clearManager.body.employee.manager, null);
  });

  // ------------------------------------------- manager assignment on approval
  const approver = await post(`${base}/api/auth/register`, {
    firstName: "Aya",
    lastName: "Saleh",
    email: "aya.awaiting-manager@learnilm.test",
    password: "Aya@1234",
  });
  const awaitingId = String(approver.body.employee._id);

  const approveWithManager = await patch(
    `${base}/api/admin/employees/${awaitingId}/job`,
    platformToken,
    { status: "active", manager: String(createdManager.body.employee._id) },
  );
  await check("approval sets status and manager in one call", () => {
    assert.equal(approveWithManager.status, 200);
    assert.equal(approveWithManager.body.employee.job.status, "active");
    assert.equal(
      approveWithManager.body.employee.manager._id,
      String(createdManager.body.employee._id),
      "manager not assigned at approval",
    );
  });

  // The approved account must now be reachable under the manager it was filed
  // to, which is the only reason the assignment is worth making.
  const teamUnderNewManager = await get(`${base}/api/employee/team`, createdManagerToken);
  await check("the assigned manager sees the approved account on their team", () => {
    assert.equal(teamUnderNewManager.status, 200);
    const ids = (teamUnderNewManager.body.members ?? []).map(
      (m: { _id: string }) => m._id,
    );
    assert.ok(ids.includes(awaitingId), "approved account is not on the assigned manager's team");
  });

  const managerAsManager = await patch(
    `${base}/api/admin/employees/${awaitingId}/job`,
    platformToken,
    { manager: awaitingId },
  );
  await check("an account cannot report to itself", () => {
    assert.equal(managerAsManager.status, 400);
  });

  const managerNotAManager = await patch(
    `${base}/api/admin/employees/${awaitingId}/job`,
    platformToken,
    { manager: createdId },
  );
  await check("reports-to must be someone with the manager role", () => {
    assert.equal(managerNotAManager.status, 400);
  });

  // ------------------------------------------------ manager's team-wide tasks
  // The manager's "All tasks" screen needs tasks assigned to their reports.
  // GET /tasks is scoped to the caller's own tasks, so it cannot serve that.
  const sanaId = String(createdManager.body.employee._id);

  // Sana has no reports yet. Team scoping is only meaningful if a task is
  // assigned to somebody who genuinely reports to her, so give her one.
  const sanaReport = await post(
    `${base}/api/admin/employees`,
    {
      firstName: "Tariq",
      lastName: "Haddad",
      email: "tariq.under-sana@learnilm.test",
      password: "Tariq@1234",
      role: "employee",
      manager: sanaId,
    },
    platformToken,
  );
  await check("a manager gets a report to assign tasks to", () => {
    assert.equal(sanaReport.status, 201, JSON.stringify(sanaReport.body));
  });
  const sanaReportId = String(sanaReport.body.employee._id);

  const reportOne = await post(
    `${base}/api/employee/tasks`,
    {
      title: "Rotate the API keys",
      assignedTo: sanaReportId,
      priority: "High",
      status: "In Progress",
      dueDate: "2020-01-05T00:00:00.000Z",
    },
    createdManagerToken,
  );
  await check("a manager can assign a task to a report", () => {
    assert.equal(reportOne.status, 201, JSON.stringify(reportOne.body));
  });

  const reportTwo = await post(
    `${base}/api/employee/tasks`,
    {
      title: "Draft the runbook",
      assignedTo: sanaReportId,
      priority: "Low",
      status: "Completed",
    },
    createdManagerToken,
  );
  await check("a second task for the same report is created", () => {
    assert.equal(reportTwo.status, 201, JSON.stringify(reportTwo.body));
  });

  const teamTasks = await get(`${base}/api/employee/team/tasks`, createdManagerToken);
  await check("GET /team/tasks returns tasks assigned across the whole team", () => {
    assert.equal(teamTasks.status, 200, JSON.stringify(teamTasks.body));
    const titles = (teamTasks.body.tasks as Array<{ title: string }>).map((t) => t.title);
    assert.ok(titles.includes("Rotate the API keys"), "report's task is missing");
    assert.ok(titles.includes("Draft the runbook"), "second report task is missing");
  });

  await check("GET /team/tasks populates the assignee, not just the id", () => {
    const task = (teamTasks.body.tasks as Array<{ title: string; assignedTo: unknown }>).find(
      (t) => t.title === "Rotate the API keys",
    );
    assert.ok(task, "task not found");
    const assignee = task!.assignedTo as { firstName?: string };
    assert.equal(typeof assignee, "object", "assignedTo should be populated");
    assert.equal(assignee.firstName, "Tariq", "assignee did not populate");
  });

  const teamSummary = await get(`${base}/api/employee/team/tasks/summary`, createdManagerToken);
  await check("GET /team/tasks/summary counts the same scope as /team/tasks", () => {
    assert.equal(teamSummary.status, 200, JSON.stringify(teamSummary.body));
    assert.equal(teamSummary.body.total, (teamTasks.body.tasks as unknown[]).length);
    assert.equal(teamSummary.body.completed, 1);
    assert.equal(teamSummary.body.inProgress, 1);
    // "Rotate the API keys" is due in 2020 and not completed.
    assert.equal(teamSummary.body.overdue, 1);
  });

  // Another manager's report must not leak into this manager's list, even
  // though `createdId` reports to the seeded manager rather than to Sana.
  // P4: the SEEDED manager CAN assign to their own report — unchanged. The
  // cross-team case (Sana assigning to ravi) is asserted separately below.
  // NOTE: earlier blocks reassigned ravi (to Sana, then to nobody), so put him
  // back under the seeded manager first — otherwise his 403 would be for the
  // wrong reason.
  await patch(`${base}/api/admin/employees/${createdId}`, platformToken, { manager: managerId });
  const otherTeamTask = await post(
    `${base}/api/employee/tasks`,
    { title: "Seeded manager's own errand", assignedTo: createdId },
    managerAuth,
  );
  await check("the seeded manager can assign a task to their own report", () => {
    assert.equal(otherTeamTask.status, 201, JSON.stringify(otherTeamTask));
  });
  // P4 regression: a DIFFERENT manager (Sana) cannot reach ravi.
  const crossTeamAssign = await post(
    `${base}/api/employee/tasks`,
    { title: "Sana reaching outside her team", assignedTo: createdId },
    createdManagerToken,
  );
  await check("a manager cannot assign across to another manager's report (P4)", () => {
    assert.equal(crossTeamAssign.status, 403, JSON.stringify(crossTeamAssign.body));
  });

  const sanaSeesOther = await get(`${base}/api/employee/team/tasks`, createdManagerToken);
  await check("GET /team/tasks does not leak another manager's team", () => {
    const titles = (sanaSeesOther.body.tasks as Array<{ title: string }>).map((t) => t.title);
    assert.ok(
      !titles.includes("Seeded manager's own errand"),
      "a task from another manager's team leaked in",
    );
  });

  const seededSeesOwn = await get(`${base}/api/employee/team/tasks`, managerAuth);
  await check("each manager sees only their own team's tasks", () => {
    const titles = (seededSeesOwn.body.tasks as Array<{ title: string }>).map((t) => t.title);
    assert.ok(
      titles.includes("Seeded manager's own errand"),
      "the seeded manager should see the task assigned to their report",
    );
    assert.ok(
      !titles.includes("Rotate the API keys"),
      "the seeded manager should not see Sana's report's task",
    );
  });

  const tasksAsEmployee = await get(`${base}/api/employee/team/tasks`, employeeAuth);
  await check("an employee cannot read the team task list", () => {
    assert.equal(tasksAsEmployee.status, 403);
  });

  const summaryAsEmployee = await get(`${base}/api/employee/team/tasks/summary`, employeeAuth);
  await check("an employee cannot read the team task summary", () => {
    assert.equal(summaryAsEmployee.status, 403);
  });

  // A task assigned to the manager themselves is their own, not their team's.
  const managerOwnTask = await post(
    `${base}/api/employee/tasks`,
    { title: "Manager's own chore", assignedTo: sanaId },
    createdManagerToken,
  );
  await check("a manager can assign a task to themselves", () => {
    assert.equal(managerOwnTask.status, 201, JSON.stringify(managerOwnTask.body));
  });

  const ownTasks = await get(`${base}/api/employee/tasks`, createdManagerToken);
  await check("GET /tasks stays scoped to the caller", () => {
    assert.equal(ownTasks.status, 200);
    const titles = (ownTasks.body.tasks as Array<{ title: string }>).map((t) => t.title);
    assert.ok(titles.includes("Manager's own chore"), "own task should be listed");
    assert.ok(
      !titles.includes("Rotate the API keys"),
      "GET /tasks leaked a report's task to the manager",
    );
  });

  const teamTasksAfterOwn = await get(`${base}/api/employee/team/tasks`, createdManagerToken);
  await check("GET /team/tasks includes tasks the manager assigned to themselves", () => {
    const titles = (teamTasksAfterOwn.body.tasks as Array<{ title: string }>).map((t) => t.title);
    assert.ok(titles.includes("Manager's own chore"), "own task missing from the team list");
    assert.ok(titles.includes("Rotate the API keys"), "report's task missing from the team list");
  });

  const statusChanged = await patch(
    `${base}/api/employee/tasks/${String(reportOne.body.task._id)}/status`,
    createdManagerToken,
    { status: "Completed" },
  );
  await check("a manager can close a task they assigned", () => {
    assert.equal(statusChanged.status, 200, JSON.stringify(statusChanged.body));
    assert.equal(statusChanged.body.task.status, "Completed");
  });

  const summaryAfterClose = await get(`${base}/api/employee/team/tasks/summary`, createdManagerToken);
  await check("the summary follows a status change", () => {
    // Was 1 completed / 1 overdue; closing the overdue one clears both.
    assert.equal(summaryAfterClose.body.completed, 2);
    assert.equal(summaryAfterClose.body.overdue, 0);
    assert.equal(summaryAfterClose.body.inProgress, 0);
  });

  // ------------------------------------------- role decided at approval time
  // Signup only ever creates employees, so approval is where the role is
  // chosen. All three values go out in the same PATCH /job call.
  const asManagerSignup = await post(`${base}/api/auth/register`, {
    firstName: "Rui",
    lastName: "Alves",
    email: "rui.approves-as-manager@learnilm.test",
    password: "Rui@1234",
  });
  const approveAsManager = await patch(
    `${base}/api/admin/employees/${String(asManagerSignup.body.employee._id)}/job`,
    platformToken,
    { status: "active", role: "manager" },
  );
  await check("approval can promote the signup to manager", () => {
    assert.equal(approveAsManager.status, 200, JSON.stringify(approveAsManager.body));
    assert.equal(approveAsManager.body.employee.role, "manager");
    assert.equal(approveAsManager.body.employee.job.status, "active");
    assert.equal(approveAsManager.body.employee.job.isActive, true);
  });

  await check("an account promoted to manager at approval is offered as a reports-to", async () => {
    const managers = await get(`${base}/api/admin/managers`, platformToken);
    assert.equal(managers.status, 200);
    assert.ok(
      (managers.body.managers as Array<{ _id: string }>).some(
        (m) => m._id === String(asManagerSignup.body.employee._id),
      ),
      "newly promoted manager is missing from GET /admin/managers",
    );
  });

  const asAdminSignup = await post(`${base}/api/auth/register`, {
    firstName: "Nia",
    lastName: "Rahman",
    email: "nia.approves-as-admin@learnilm.test",
    password: "Nia@1234",
  });
  const approveAsAdmin = await patch(
    `${base}/api/admin/employees/${String(asAdminSignup.body.employee._id)}/job`,
    platformToken,
    { status: "active", role: "admin" },
  );
  await check("approval can promote the signup to platform admin", () => {
    assert.equal(approveAsAdmin.status, 200, JSON.stringify(approveAsAdmin.body));
    assert.equal(approveAsAdmin.body.employee.role, "admin");
    assert.equal(approveAsAdmin.body.employee.job.status, "active");
  });

  // A promoted admin is a real platform admin, so the platform login must
  // accept them. This is the behaviour that separates role from job status.
  const promotedAdminLogin = await post(`${base}/api/auth/login`, {
    email: "nia.approves-as-admin@learnilm.test",
    password: "Nia@1234",
  });
  await check("an account approved as admin can sign in to the platform console", () => {
    assert.equal(promotedAdminLogin.status, 200, JSON.stringify(promotedAdminLogin.body));
    assert.equal(promotedAdminLogin.body.user.role, "admin");
    assert.ok(promotedAdminLogin.body.token);
  });

  const promotedAdminToken = promotedAdminLogin.body.token as string;
  const promotedAdminCanList = await get(`${base}/api/admin/employees`, promotedAdminToken);
  await check("a signup promoted to admin gets platform permissions", () => {
    assert.equal(promotedAdminCanList.status, 200);
  });

  // Reports-to is an employee-side concept; the UI hides the picker for
  // manager/admin rows, so the API should not leave a stale manager behind.
  const staleManagerCleared = await patch(
    `${base}/api/admin/employees/${awaitingId}/job`,
    platformToken,
    { role: "manager" },
  );
  await check("promoting someone who had a manager keeps them unassigned", () => {
    assert.equal(staleManagerCleared.status, 200, JSON.stringify(staleManagerCleared.body));
    assert.equal(staleManagerCleared.body.employee.role, "manager");
  });

  const selfSuspend = await patch(
    `${base}/api/admin/employees/${String(admin!._id)}/job`,
    platformToken,
    { status: "terminated" },
  );
  await check("an admin cannot suspend their own account", () => {
    assert.equal(selfSuspend.status, 400);
  });

  const adminStats = await get(`${base}/api/admin/stats`, platformToken);
  await check("GET /api/admin/stats aggregates by role and status", () => {
    assert.equal(adminStats.status, 200);
    assert.equal(typeof adminStats.body.total, "number");
    assert.ok(adminStats.body.byRole, "byRole missing");
    assert.ok(Array.isArray(adminStats.body.byDepartment));
  });

  const adminList = await get(`${base}/api/admin/employees?search=Okafor`, platformToken);
  await check("GET /api/admin/employees?search= filters", () => {
    assert.equal(adminList.status, 200);
    assert.equal(adminList.body.employees.length, 1);
    assert.equal(adminList.body.employees[0].email, signupEmail);
    assert.equal(typeof adminList.body.totalPages, "number");
  });
  // --------------------------------------------------------- delete account
  // A throwaway account with a report, so the cascade and the unassigning of
  // direct reports are both observable.
  const doomed = await post(`${base}/api/admin/employees`, {
    firstName: "Temp",
    lastName: "Account",
    email: "temp.doomed@learnilm.test",
    password: "Temp@1234",
    role: "manager",
    department: "Engineering",
  }, platformToken);
  const doomedId = String(doomed.body.employee._id);

  const report = await post(`${base}/api/admin/employees`, {
    firstName: "Under",
    lastName: "Doom",
    email: "under.doom@learnilm.test",
    password: "Doom@1234",
    role: "employee",
    manager: doomedId,
  }, platformToken);
  await check("a report can be filed under the account about to be deleted", () => {
    assert.equal(report.status, 201, JSON.stringify(report.body));
    assert.equal(report.body.employee.manager._id, doomedId);
  });

  const deleteSelf = await del(`${base}/api/admin/employees/${String(admin!._id)}`, platformToken);
  await check("an admin cannot delete their own account", () => {
    assert.equal(deleteSelf.status, 400, JSON.stringify(deleteSelf.body));
    assert.match(String(deleteSelf.body.message), /own account/i);
  });

  const deleteByEmployee = await del(`${base}/api/admin/employees/${doomedId}`, employeeAuth);
  await check("delete requires a platform token", () => {
    assert.equal(deleteByEmployee.status, 401);
  });

  const deleteMissing = await del(`${base}/api/admin/employees/39dee8c2b33924b411fe74a9`, platformToken);
  await check("deleting a well-formed id that does not exist is a 404", () => {
    // 24 hex chars, so it passes `isMongoId` and is only rejected on lookup.
    assert.equal(deleteMissing.status, 404, JSON.stringify(deleteMissing.body));
  });

  const deleteBadId = await del(`${base}/api/admin/employees/not-an-id`, platformToken);
  await check("deleting a malformed id is rejected by validation, before any delete", () => {
    assert.equal(deleteBadId.status, 422, JSON.stringify(deleteBadId.body));
    assert.match(String(deleteBadId.body.message), /Invalid employee id/i);
  });

  const deleteResult = await del(`${base}/api/admin/employees/${doomedId}`, platformToken);
  await check("DELETE removes the account", () => {
    assert.equal(deleteResult.status, 200, JSON.stringify(deleteResult.body));
    assert.match(String(deleteResult.body.message), /Temp Account was deleted/);
    assert.equal(deleteResult.body.deleted.email, "temp.doomed@learnilm.test");
  });

  await check("the deleted account is gone from the directory and the manager list", async () => {
    const list = await get(`${base}/api/admin/employees?search=doomed`, platformToken);
    assert.equal(list.body.total, 0);
    const managers = await get(`${base}/api/admin/managers`, platformToken);
    assert.ok(
      !(managers.body.managers as Array<{ _id: string }>).some((m) => m._id === doomedId),
      "deleted manager is still offered as a reports-to",
    );
  });

  // Leaving the report pointing at a missing id would render as a bare object
  // id in the directory's "Reports to" column, so it has to be nulled.
  const reportAfter = await get(`${base}/api/admin/employees?search=doom`, platformToken);
  await check("direct reports of a deleted account become unassigned, not orphaned", () => {
    assert.equal(reportAfter.status, 200);
    const survivor = (reportAfter.body.employees as Array<{ _id: string; manager: unknown }>).find(
      (e) => e.email === "under.doom@learnilm.test",
    );
    assert.ok(survivor, "the report itself should survive");
    assert.equal(survivor!.manager, null);
  });

  await check("the deleted account's login no longer works", async () => {
    const gone = await post(`${base}/api/employee/login`, {
      email: "temp.doomed@learnilm.test",
      password: "Temp@1234",
    });
    assert.equal(gone.status, 401, JSON.stringify(gone.body));
  });

  // ------------------------------------------------------------------- CORS
  // A Vite dev server does not always get port 5173 — if that port is busy it
  // takes the next free one, and the browser then sends a different Origin.
  // These cover the allow-any-loopback-port dev behaviour and, just as
  // importantly, that it does not leak outside loopback.
  const preflight = async (origin: string) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });
    return {
      status: res.status,
      allowOrigin: res.headers.get("access-control-allow-origin"),
    };
  };

  await check("a dev server on the default port is allowed", async () => {
    const res = await preflight("http://localhost:5173");
    assert.equal(res.allowOrigin, "http://localhost:5173");
  });

  await check("a dev server on a shifted port is allowed too", async () => {
    // The regression this exists for: 5174 being refused when 5173 was taken.
    const res = await preflight("http://localhost:5174");
    assert.equal(res.allowOrigin, "http://localhost:5174");
  });

  await check("any loopback port is allowed in dev, on either host name", async () => {
    assert.equal((await preflight("http://127.0.0.1:4321")).allowOrigin, "http://127.0.0.1:4321");
    assert.equal((await preflight("http://localhost:9999")).allowOrigin, "http://localhost:9999");
  });

  await check("a lookalike host is not treated as loopback", async () => {
    // Guards the regex: "localhost.evil.com" and "notlocalhost" must not pass
    // just because they contain the word.
    assert.equal((await preflight("http://localhost.evil.example.com")).allowOrigin, null);
    assert.equal((await preflight("http://notlocalhost:5173")).allowOrigin, null);
  });

  await check("an external origin is refused", async () => {
    const res = await preflight("https://evil.example.com");
    assert.equal(res.allowOrigin, null);
  });

  await check("a refused origin is not turned into a 500", async () => {
    // cors used to call next(err) here, so every browser retry logged an
    // identical stack trace and the client saw a 500 instead of a CORS block.
    const res = await preflight("https://evil.example.com");
    assert.ok(res.status < 500, `expected a non-5xx status, got ${res.status}`);
  });

  await check("an actual request from a refused origin gets no CORS headers", async () => {
    const res = await fetch(`${base}/api/employee/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example.com" },
      body: JSON.stringify({ email: "x@y.z", password: "nope" }),
    });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  await check("a same-origin request with no Origin header still works", async () => {
    const res = await post(`${base}/api/employee/login`, {
      email: "employee@learnilm.test",
      password: "Employee@123",
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  // `env` is a module singleton read once at boot, so the "CORS_ORIGINS was set
  // explicitly" case is exercised by flipping the flag rather than standing up
  // a second server. This is the production posture: loopback stays refused.
  const loopbackFlag = env.cors.devAllowLoopback;
  env.cors.devAllowLoopback = false;
  const strict = await preflight("http://localhost:5174");
  env.cors.devAllowLoopback = loopbackFlag;
  await check("the loopback allowance is off when CORS_ORIGINS is configured", () => {
    assert.equal(strict.allowOrigin, null, "a shifted loopback port was still allowed");
  });

  const wildcardFlag = env.cors.origins.includes("*");
  env.cors.origins.push("*");
  const wildcard = await preflight("https://anything.example.com");
  env.cors.origins = env.cors.origins.filter((o) => o !== "*");
  await check('CORS_ORIGINS="*" still opens it up', () => {
    assert.equal(wildcard.allowOrigin, "https://anything.example.com");
  });
  void wildcardFlag;

  await shutdown();

  // ------------------------------------------------------------- report
  console.log(`\n[test] passed: ${passed.length}`);
  if (failed.length) {
    console.log(`[test] failed: ${failed.length}\n`);
    for (const f of failed) console.log(`  FAIL  ${f.name}\n        ${f.error}\n`);
    process.exitCode = 1;
  } else {
    console.log("[test] all checks passed\n");
  }
}

// ------------------------------------------------------------------ helpers

function startServer(): Promise<string> {
  return new Promise((resolve) => {
    httpServer = app.listen(0, () => {
      const addr = httpServer?.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function shutdown(): Promise<void> {
  const server = httpServer;
  httpServer = undefined;
  if (!server) return;
  await new Promise<void>((resolve) => {
    // Destroy keep-alive sockets first, otherwise close() waits on them.
    server.closeAllConnections?.();
    server.close(() => resolve());
    setTimeout(resolve, 3000).unref();
  });
}

interface Res {
  status: number;
  body: Record<string, unknown>;
}

async function parse(res: globalThis.Response): Promise<Res> {
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text };
  }
  if (res.status >= 400 && process.env.VERBOSE) {
    console.log(`      [${res.status}] ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { status: res.status, body };
}

async function get(url: string, token = "", headers: Record<string, string> = {}): Promise<Res> {
  return parse(
    await fetch(url, {
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }),
  );
}

async function post(
  url: string,
  body: unknown,
  token = "",
  headers: Record<string, string> = {},
): Promise<Res> {
  return parse(
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function put(url: string, token: string, body: unknown): Promise<Res> {
  return parse(
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

async function patch(url: string, token: string, body: unknown): Promise<Res> {
  return parse(
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

async function del(url: string, token: string, body: unknown = {}): Promise<Res> {
  return parse(
    await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

/** Signs in through the employee login route that the app serves. */
async function loginAs(base: string, email: string, password: string): Promise<string> {
  const res = await post(`${base}/api/employee/login`, { email, password });
  if (res.status !== 200 || typeof res.body.token !== "string") {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

/** Signs in through the platform realm, which gates /api/admin. */
async function loginPlatform(base: string, email: string, password: string): Promise<string> {
  const res = await post(`${base}/api/auth/login`, { email, password });
  if (res.status !== 200 || typeof res.body.token !== "string") {
    throw new Error(`platform login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

main()
  .catch((err) => {
    console.error("[test] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await shutdown();
    const { disconnectDatabase } = await import("../src/config/db.js");
    await disconnectDatabase().catch(() => undefined);
    await memoryServer?.stop().catch(() => undefined);
  });

void mongoose;