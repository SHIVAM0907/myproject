import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { env } from "../config/env.js";
import { Employee } from "../models/Employee.js";
import { Attendance } from "../models/Attendance.js";
import { LeaveRequest } from "../models/LeaveRequest.js";
import { Task, TASK_STATUSES } from "../models/Task.js";
import { Query } from "../models/Query.js";
import { Meeting } from "../models/Meeting.js";
import { addDays, dayKey, startOfLocalDay } from "../utils/date.js";

interface SeedPerson {
  firstName: string;
  lastName: string;
  email: string;
  employeeCode: string;
  role: "employee" | "manager";
  department: string;
  designation: string;
  phone: string;
}

const MANAGER: SeedPerson = {
  firstName: "Aarav",
  lastName: "Sharma",
  email: "manager@learnilm.test",
  employeeCode: "MGR-001",
  role: "manager",
  department: "Engineering",
  designation: "Engineering Manager",
  phone: "+91 90000 00001",
};

const EMPLOYEES: SeedPerson[] = [
  {
    firstName: "Riya",
    lastName: "Verma",
    email: "employee@learnilm.test",
    employeeCode: "EMP-0001",
    role: "employee",
    department: "Engineering",
    designation: "Frontend Engineer",
    phone: "+91 90000 00002",
  },
  {
    firstName: "Kabir",
    lastName: "Nair",
    email: "kabir@learnilm.test",
    employeeCode: "EMP-0002",
    role: "employee",
    department: "Engineering",
    designation: "Backend Engineer",
    phone: "+91 90000 00003",
  },
  {
    firstName: "Meera",
    lastName: "Iyer",
    email: "meera@learnilm.test",
    employeeCode: "EMP-0003",
    role: "employee",
    department: "Design",
    designation: "Product Designer",
    phone: "+91 90000 00004",
  },
  {
    firstName: "Aditya",
    lastName: "Rao",
    email: "aditya@learnilm.test",
    employeeCode: "EMP-0004",
    role: "employee",
    department: "Engineering",
    designation: "QA Engineer",
    phone: "+91 90000 00005",
  },
];

/**
 * Creates the platform/admin account.
 *
 * Split out from the demo data because it is idempotent and runs on *every*
 * boot: `seedIfEmpty` below returns early on a non-empty collection, so a
 * database seeded before the admin role existed would otherwise never get one
 * — and an app with no reachable admin is a locked door.
 *
 * Deliberately does nothing when the email is already taken. If the account
 * exists but with the wrong password, fix it through the app's own change
 * password path rather than silently resetting it on every restart.
 */
export async function ensureAdmin(): Promise<void> {
  const existing = await Employee.findOne({ email: env.seed.adminEmail });
  if (existing) {
    // An existing account may predate the role split and still be a manager.
    // Promote it rather than leaving the platform realm unreachable.
    if (existing.role !== "admin") {
      existing.role = "admin";
      existing.job.isActive = true;
      if (existing.job.status === "inactive") existing.job.status = "active";
      await existing.save();
      console.log(`[seed] promoted existing ${env.seed.adminEmail} to admin`);
    }
    return;
  }

  const [firstName, ...rest] = env.seed.adminName.trim().split(/\s+/);
  await Employee.create({
    firstName: firstName || "Platform",
    lastName: rest.join(" ") || "Administrator",
    email: env.seed.adminEmail,
    password: env.seed.adminPassword,
    phone: "",
    department: "Administration",
    designation: "Platform Administrator",
    role: "admin",
    // Admin codes are fixed rather than allocated from the EMP- sequence, which
    // `nextEmployeeCode` scans for; a numeric suffix here would skew that probe.
    employeeCode: "ADM-001",
    manager: null,
    job: { joinDate: new Date(), status: "active", isActive: true },
    profile: {
      bio: "Platform administrator for approvals and account management.",
      skills: [],
    },
  });

  console.log("[seed] created the platform admin account");
  console.log(`[seed]   admin    ${env.seed.adminEmail} / ${env.seed.adminPassword}`);
}

/**
 * Creates the demo manager and team on an empty database, then makes sure the
 * admin exists. Idempotent: skips any existing email, and `ensureAdmin` above
 * is a no-op once the admin is present.
 */
export async function seedIfEmpty(): Promise<void> {
  await ensureAdmin();

  const existing = await Employee.countDocuments({ role: { $ne: "admin" } });
  if (existing > 0) return;
  console.log("[seed] no employees found — creating demo data");

  const manager = await Employee.create({
    ...MANAGER,
    password: env.seed.managerPassword,
    job: { joinDate: new Date("2022-04-01"), status: "active", isActive: true },
    profile: { bio: "Engineering manager focused on delivery and team health.", skills: [] },
  });

  const employees = [];
  for (const person of EMPLOYEES) {
    employees.push(
      await Employee.create({
        ...person,
        password: env.seed.employeePassword,
        manager: manager._id,
        job: { joinDate: new Date("2023-07-10"), status: "active", isActive: true },
        profile: { bio: "", skills: [] },
      }),
    );
  }

  console.log(`[seed] created 1 manager and ${employees.length} employees`);

  await seedAttendance(employees.map((e) => String(e._id)));
  await seedTasks(String(manager._id), employees.map((e) => String(e._id)));
  await seedMeetings(String(manager._id), employees.map((e) => String(e._id)));

  console.log("[seed] done");
  console.log(`[seed]   manager  ${MANAGER.email} / ${env.seed.managerPassword}`);
  console.log(`[seed]   employee ${EMPLOYEES[0]?.email} / ${env.seed.employeePassword}`);
}

/** Back-fills the last three weeks so month views and reports aren't empty. */
async function seedAttendance(employeeIds: string[]): Promise<void> {
  const rows: Array<Record<string, unknown>> = [];
  const today = startOfLocalDay(new Date());

  for (const employeeId of employeeIds) {
    for (let offset = 20; offset >= 0; offset -= 1) {
      const date = addDays(today, -offset);
      const dow = date.getDay();
      if (dow === 0) continue; // no Sunday records

      const isSaturday = dow === 6;
      const checkIn = new Date(date);
      // Vary arrival times so some days come out `late`.
      checkIn.setHours(9, (offset * 7) % 45, 0, 0);
      const checkOut = new Date(checkIn);
      checkOut.setHours(18, 15, 0, 0);

      const late = checkIn.getHours() > 9 || checkIn.getMinutes() > 15;
      const absent = offset % 11 === 0;
      const onLeave = offset === 8;

      if (absent) {
        rows.push({
          employee: employeeId,
          dayKey: dayKey(date),
          status: "absent",
          workingMinutes: 0,
          breakMinutes: 0,
          overtimeMinutes: 0,
        });
        continue;
      }

      const breakStart = new Date(checkIn);
      breakStart.setHours(13, 0, 0, 0);
      const breakEnd = new Date(breakStart);
      breakEnd.setMinutes(breakEnd.getMinutes() + 45);

      const spanMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000);
      const working = isSaturday ? Math.round(spanMinutes * 0.6) : spanMinutes - 45;

      rows.push({
        employee: employeeId,
        dayKey: dayKey(date),
        status: onLeave ? "leave" : late ? "late" : "present",
        leaveType: onLeave ? "casual" : null,
        checkIn: onLeave ? null : checkIn,
        checkOut: onLeave ? null : checkOut,
        breakStart: null,
        breakMinutes: isSaturday ? 0 : 45,
        workingMinutes: onLeave ? 0 : working,
        overtimeMinutes: onLeave || working <= 510 ? 0 : working - 510,
        lateMinutes: onLeave || !late ? 0 : Math.max(0, checkIn.getMinutes() - 15),
      });
    }
  }

  if (rows.length) await Attendance.insertMany(rows);
}

async function seedTasks(managerId: string, employeeIds: string[]): Promise<void> {
  const templates = [
    { title: "Ship attendance clock-in flow", priority: "High", status: "In Progress" },
    { title: "Review Q3 accessibility audit", priority: "Medium", status: "Pending" },
    { title: "Document the upload service", priority: "Low", status: "Completed" },
    { title: "Fix monthly report rounding", priority: "High", status: "On Hold" },
    { title: "Add leave overlap validation", priority: "Medium", status: "Not Started" },
  ];

  const tasks: Array<Record<string, unknown>> = [];
  templates.forEach((t, index) => {
    const assignee = employeeIds[index % employeeIds.length] as string;
    tasks.push({
      taskId: `TASK-SEED-${String(index + 1).padStart(3, "0")}`,
      title: t.title,
      description: "Seeded task for local development.",
      assignedTo: assignee,
      assignedBy: managerId,
      dueDate: addDays(new Date(), index + 2),
      priority: t.priority,
      status: t.status,
      attachments: [],
    });
  });

  const created = (await Task.insertMany(tasks)) as unknown as Array<{
    _id: unknown;
    assignedTo: unknown;
  }>;
  const first = created[0];
  if (first) {
    await Query.create([
      {
        employee: first.assignedTo,
        task: first._id,
        message: "Are the overtime minutes rounded to the nearest minute?",
        status: "open",
      },
      {
        employee: first.assignedTo,
        task: first._id,
        message: "Which timezone does the report use?",
        status: "resolved",
        review: "Server-local midnight. Please avoid scheduling across DST.",
        reviewedBy: managerId,
        reviewedAt: new Date(),
      },
    ]);
  }

  await LeaveRequest.create({
    employee: employeeIds[1] as string,
    leaveType: "sick",
    dayType: "full_day",
    fromDate: addDays(new Date(), 10),
    toDate: addDays(new Date(), 11),
    days: 2,
    reason: "Not feeling well.",
    status: "pending",
  });
}

async function seedMeetings(managerId: string, employeeIds: string[]): Promise<void> {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start.getTime() + 45 * 60_000);

  await Meeting.create({
    title: "Daily standup",
    meetingLink: "https://meet.example.com/standup",
    createdBy: managerId,
    participants: employeeIds.slice(0, 3),
    startTime: start,
    endTime: end,
    durationMin: 45,
    status: "scheduled",
  });

  const retroStart = addDays(new Date(), 1);
  retroStart.setHours(11, 0, 0, 0);

  await Meeting.create({
    title: "Sprint retro",
    meetingLink: null,
    createdBy: managerId,
    participants: employeeIds,
    startTime: retroStart,
    endTime: new Date(retroStart.getTime() + 60 * 60_000),
    durationMin: 60,
    status: "scheduled",
  });
}

/** CLI entry: `npm run seed`. */
const isDirectRun = process.argv[1]?.includes("seed");

if (isDirectRun) {
  (async () => {
    await connectDatabase();
    await Employee.deleteMany({ email: { $in: [MANAGER.email, ...EMPLOYEES.map((e) => e.email)] } });
    await Attendance.deleteMany({});
    await LeaveRequest.deleteMany({});
    await Task.deleteMany({});
    await Query.deleteMany({});
    await Meeting.deleteMany({});
    console.log("[seed] cleared previous demo data");

    await seedIfEmpty();

    await disconnectDatabase();
    process.exit(0);
  })().catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  });
}

export { TASK_STATUSES };