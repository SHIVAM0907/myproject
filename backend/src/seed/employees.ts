/**
 * Employee administration from the terminal.
 *
 *   npm run employees -- list
 *   npm run employees -- approve <email|employeeCode|id>
 *   npm run employees -- suspend <email|employeeCode|id>
 *   npm run employees -- show <email|employeeCode|id>
 *
 * Signup (POST /api/auth/register) creates accounts that deliberately cannot
 * sign in. This is the approval path that exists today — the `/api/admin`
 * endpoints do the same thing over HTTP, but the frontend has no admin UI yet.
 */
import mongoose from "mongoose";
import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { Employee } from "../models/Employee.js";
import { env } from "../config/env.js";

type Command = "list" | "approve" | "suspend" | "show";

/** Accepts an email, an employee code, or a Mongo id. */
async function findOne(identifier: string) {
  const value = identifier.trim();
  return Employee.findOne({
    $or: [{ email: value.toLowerCase() }, { employeeCode: value.toUpperCase() }, { _id: value }],
  });
}

function describe(employee: { _id: unknown; firstName: string; lastName: string; email: string; employeeCode: string; role: string; job?: { status?: string; isActive?: boolean } }) {
  return [
    `  ${employee.email}`,
    `    name        ${employee.firstName} ${employee.lastName}`,
    `    code        ${employee.employeeCode}`,
    `    role        ${employee.role}`,
    `    status      ${employee.job?.status ?? "unknown"}${employee.job?.isActive ? " (active)" : ""}`,
    `    id          ${String(employee._id)}`,
  ].join("\n");
}

async function run(): Promise<void> {
  const [rawCommand, identifier] = process.argv.slice(2);
  const command = (rawCommand ?? "list").toLowerCase() as Command;

  if (!["list", "approve", "suspend", "show"].includes(command)) {
    console.error(`Unknown command "${command}". Use: list | approve | suspend | show`);
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  try {
    if (command === "list") {
      const pending = await Employee.find({ "job.status": "inactive" }).sort({ createdAt: 1 });
      if (pending.length === 0) {
        console.log("No accounts are awaiting approval.");
      } else {
        console.log(`${pending.length} account(s) awaiting approval:\n`);
        pending.forEach((e) => console.log(describe(e as never)));
        console.log("\nApprove with: npm run employees -- approve <email>");
      }
      return;
    }

    if (!identifier) {
      console.error(`"${command}" needs an email, employee code, or id.`);
      process.exitCode = 1;
      return;
    }

    const employee = await findOne(identifier);
    if (!employee) {
      console.error(`No employee matched "${identifier}".`);
      process.exitCode = 1;
      return;
    }

    if (command === "show") {
      console.log(describe(employee));
      return;
    }

    if (command === "approve") {
      employee.job.status = "active";
      employee.job.isActive = true;
      if (!employee.job.joinDate) employee.job.joinDate = new Date();
      await employee.save();
      console.log(`Approved ${employee.email}. They can now sign in.`);
      return;
    }

    // suspend
    employee.job.status = "terminated";
    employee.job.isActive = false;
    await employee.save();
    console.log(`Suspended ${employee.email}. They can no longer sign in.`);
  } finally {
    await disconnectDatabase();
  }
}

run()
  .catch(async (err) => {
    console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    if (mongoose.connection.readyState !== 0) await disconnectDatabase();
  })
  .then(() => {
    // `connectDatabase` may leave a handle open if run() bailed before the
    // finally block; force the process down so the CLI never hangs.
    void mongoose.disconnect().finally(() => process.exit(process.exitCode ?? 0));
  });

void env;