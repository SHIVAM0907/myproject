import { Router, type Response } from "express";
import { body as bodyField, param } from "express-validator";
import { Types } from "mongoose";
import { Task, nextTaskId, PRIORITIES, TASK_STATUSES } from "../models/Task.js";
import { Query, QUERY_STATUSES } from "../models/Query.js";
import { Employee } from "../models/Employee.js";
import { requireEmployee, requireRole, currentUserId, type AuthenticatedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dayKey } from "../utils/date.js";
import { permittedTeamIds, mayManage, assertCanManage } from "../services/authorization.js";

const router = Router();

const PERSON_FIELDS = "firstName lastName employeeCode department role";

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && Types.ObjectId.isValid(value) && /^[a-f\d]{24}$/i.test(value);
}

/** Throws a 400 rather than letting a CastError surface as a confusing 500. */
function requireObjectId(value: unknown, label: string): Types.ObjectId {
  if (!isObjectId(value)) throw ApiError.badRequest(`A valid ${label} is required.`);
  return new Types.ObjectId(value);
}

function serializeTask(doc: unknown) {
  const t = doc as {
    _id: unknown;
    taskId?: string;
    title: string;
    description?: string;
    assignedTo?: unknown;
    assignedBy?: unknown;
    dueDate?: Date | null;
    priority: string;
    status: string;
    attachments?: string[];
    createdAt?: Date;
  };

  return {
    _id: String(t._id),
    taskId: t.taskId,
    title: t.title,
    description: t.description ?? "",
    assignedTo: t.assignedTo ?? null,
    assignedBy: t.assignedBy ?? null,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
    priority: t.priority,
    status: t.status,
    attachments: t.attachments ?? [],
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : undefined,
  };
}

function serializeQuery(doc: unknown) {
  const q = doc as {
    _id: unknown;
    employee?: unknown;
    task?: unknown;
    message: string;
    status: string;
    review?: string;
    createdAt?: Date;
    updatedAt?: Date;
  };

  return {
    _id: String(q._id),
    employee: q.employee ?? null,
    task: q.task ?? null,
    message: q.message,
    status: q.status,
    review: q.review ?? "",
    createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : undefined,
    updatedAt: q.updatedAt ? new Date(q.updatedAt).toISOString() : undefined,
  };
}

/**
 * Resolves the manager's direct reports as ids.
 *
 * Declared here rather than imported from team.controller.ts: that module
 * already imports `isObjectId` from this one, so reaching back would make a
 * require cycle.
 */
async function teamMemberIds(managerId: string): Promise<Types.ObjectId[]> {
  // P4: centralized scope resolution — only ACTIVE direct reports.
  return permittedTeamIds(managerId, Employee);
}

/**
 * The manager's task scope: anything assigned to one of their reports, plus
 * anything they assigned themselves (which may include tasks for someone who
 * has since moved teams).
 *
 * `GET /tasks` cannot serve the manager's "All tasks" table because it is
 * scoped to `assignedTo: currentUserId(req)` — a manager would only ever see
 * their own tasks, which is never what that screen is for.
 */
async function teamTaskFilter(managerId: string): Promise<Record<string, unknown>> {
  const memberIds = await teamMemberIds(managerId);
  return {
    $or: [{ assignedTo: { $in: memberIds } }, { assignedBy: managerId }],
  };
}

/**
 * GET /team/tasks -> `{ tasks }`
 *
 * Manager-only. Read by the manager dashboard's AssignedTasks screen.
 */
router.get(
  "/team/tasks",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tasks = await Task.find(await teamTaskFilter(String(currentUserId(req))))
      .populate("assignedTo", PERSON_FIELDS)
      .populate("assignedBy", PERSON_FIELDS)
      .sort({ createdAt: -1 })
      .limit(300);

    res.json({ tasks: tasks.map(serializeTask) });
  }),
);

/**
 * GET /team/tasks/summary -> `{ total, completed, inProgress, onHold, pending, overdue }`
 *
 * Computed from the same scope as `/team/tasks` rather than in the browser, so
 * the summary strip cannot disagree with the table underneath it.
 *
 * "Overdue" means due before now and not Completed — a task with no due date is
 * never overdue.
 */
router.get(
  "/team/tasks/summary",
  requireRole("manager"),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tasks = await Task.find(await teamTaskFilter(String(currentUserId(req))))
      .select("status dueDate")
      .lean<Array<{ status: string; dueDate: Date | null }>>();

    const now = Date.now();
    const summary = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "Completed").length,
      inProgress: tasks.filter((t) => t.status === "In Progress").length,
      onHold: tasks.filter((t) => t.status === "On Hold").length,
      pending: tasks.filter((t) => t.status === "Pending").length,
      overdue: tasks.filter(
        (t) => t.status !== "Completed" && t.dueDate && new Date(t.dueDate).getTime() < now,
      ).length,
    };

    res.json(summary);
  }),
);

/**
 * GET /tasks — the employee's own tasks.
 *
 * EmployeeQuery uses this to populate its query dropdown, and TasksDetails uses
 * it for the status board. Both read `data.tasks`.
 */
router.get(
  "/tasks",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const tasks = await Task.find({ assignedTo: currentUserId(req) })
      .populate("assignedBy", PERSON_FIELDS)
      .sort({ createdAt: -1 })
      .limit(300);

    res.json({ tasks: tasks.map(serializeTask) });
  }),
);

/** POST /tasks — manager creates and assigns. `status` arrives as "Not Started". */
router.post(
  "/tasks",
  validate([
    bodyField("title").isString().trim().notEmpty().withMessage("Title is required.").isLength({ max: 300 }),
    bodyField("description").optional({ values: "falsy" }).isString().trim().isLength({ max: 4000 }),
    bodyField("assignedTo").exists().withMessage("Choose someone to assign this task to."),
    bodyField("priority").optional({ values: "falsy" }).isIn(PRIORITIES).withMessage("Choose a valid priority."),
    bodyField("status").optional({ values: "falsy" }).isIn(TASK_STATUSES).withMessage("Choose a valid status."),
    bodyField("dueDate").optional({ values: "falsy" }).isISO8601().withMessage("Due date must be a valid date."),
    bodyField("attachments").optional().isArray(),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const managerId = currentUserId(req);
    const payload = req.body as {
      title: string;
      description?: string;
      assignedTo: string;
      priority?: string;
      status?: string;
      dueDate?: string;
      attachments?: string[];
    };

    const assignee = await Employee.findById(requireObjectId(payload.assignedTo, "assignee"));
    if (!assignee) throw ApiError.badRequest("That employee could not be found.");
    // P4: task creation must validate the assignee belongs to the manager's
    // own team — except self-assignment, which is explicitly allowed.
    // Managers cannot assign across teams or to other managers.
    if (String(assignee._id) !== String(managerId)) {
      const myTeam = await teamMemberIds(String(managerId));
      if (!myTeam.some((id) => String(id) === String(assignee._id))) {
        throw ApiError.forbidden("You can only assign tasks to members of your team.");
      }
    }

    // `nextTaskId` probes for the highest code, so two creates landing at the
    // same moment can pick the same one and the unique index rejects the loser.
    let task: (Awaited<ReturnType<typeof Task.create>>)[number] | null = null;
    for (let attempt = 0; attempt < 5 && !task; attempt += 1) {
      try {
        task = await Task.create({
          taskId: await nextTaskId(),
          title: payload.title.trim(),
          description: payload.description ?? "",
          assignedTo: assignee._id,
          assignedBy: managerId,
          dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
          priority: (payload.priority as never) ?? "Medium",
          status: (payload.status as never) ?? "Not Started",
          attachments: payload.attachments ?? [],
        });
      } catch (err) {
        const isDuplicate =
          typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
        if (!isDuplicate || attempt === 4) throw err;
      }
    }

    if (!task) throw ApiError.internal("Could not create the task. Please try again.");

    const populated = await Task.findById(task._id).populate("assignedBy", PERSON_FIELDS);
    res.status(201).json({ message: "Task assigned.", task: serializeTask(populated) });
  }),
);

/**
 * PATCH /tasks/:taskId/status — Title Case statuses only ("In Progress", ...).
 * TasksDetails optimistically updates locally, so the response body is ignored
 * by the client, but it is populated for correctness.
 */
router.patch(
  "/tasks/:taskId/status",
  validate([
    param("taskId").isMongoId().withMessage("A valid task id is required."),
    bodyField("status").isIn(TASK_STATUSES).withMessage("Choose a valid status."),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const taskId = req.params.taskId as string;
    const employeeId = currentUserId(req);
    const { status } = req.body as { status: string };

    const task = await Task.findById(taskId);
    if (!task) throw ApiError.notFound("That task no longer exists.");

    const isAssignee = String(task.assignedTo) === String(employeeId);
    const isAssigner =
      task.assignedBy && String(task.assignedBy) === String(employeeId);

    // P4: a manager may update ONLY tasks belonging to their own team — never
    // blanket "any task" access. Employees keep their assignee/assigner path.
    if (!isAssignee && !isAssigner && req.auth?.role === "manager") {
      const myTeam = await teamMemberIds(String(employeeId));
      const inTeam = task.assignedTo
        ? myTeam.some((id) => String(id) === String(task.assignedTo))
        : false;
      assertCanManage(inTeam, "That task is not assigned to you.");
    } else if (!isAssignee && !isAssigner) {
      throw ApiError.forbidden("That task is not assigned to you.");
    }

    task.status = status as never;
    task.completedAt = status === "Completed" ? new Date() : null;
    await task.save();

    const populated = await Task.findById(task._id)
      .populate("assignedBy", PERSON_FIELDS)
      .populate("assignedTo", PERSON_FIELDS);

    res.json({ message: "Task updated.", task: serializeTask(populated) });
  }),
);

/** GET /queries — the employee's own queries. */
router.get(
  "/queries",
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const queries = await Query.find({ employee: currentUserId(req) })
      .populate("task", "taskId title")
      .sort({ createdAt: -1 })
      .limit(200);

    res.json({ queries: queries.map(serializeQuery) });
  }),
);

/** POST /queries — raises a query against one of the employee's own tasks. */
router.post(
  "/queries",
  validate([
    bodyField("task").exists().withMessage("Choose a task to ask about."),
    bodyField("message").isString().trim().notEmpty().withMessage("Describe your question.").isLength({ max: 4000 }),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const employeeId = currentUserId(req);
    const { task: taskId, message } = req.body as { task: string; message: string };

    const task = await Task.findOne({ _id: requireObjectId(taskId, "task"), assignedTo: employeeId });
    if (!task) {
      throw ApiError.badRequest("You can only raise queries on tasks assigned to you.");
    }

    const created = await Query.create({
      employee: employeeId,
      task: task._id,
      message: message.trim(),
      status: "open",
    });

    res.status(201).json({ message: "Query raised.", query: serializeQuery(created) });
  }),
);

/**
 * POST /queries/:queryId/review — the manager response.
 *
 * Query status transitions go through this write rather than a PATCH, because
 * WriteReview sends `{ review, status }` together.
 */
router.post(
  "/queries/:queryId/review",
  validate([
    param("queryId").isMongoId().withMessage("A valid query id is required."),
    bodyField("review").optional({ values: "falsy" }).isString().trim().isLength({ max: 4000 }),
    bodyField("status").isIn(QUERY_STATUSES).withMessage("Choose a valid status."),
  ]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const queryId = req.params.queryId as string;
    const reviewerId = currentUserId(req);
    const { review, status } = req.body as { review?: string; status: string };

    const record = await Query.findById(queryId);
    if (!record) throw ApiError.notFound("That query no longer exists.");

    const assigneeOfTask = await Task.findById(record.task).select("assignedTo assignedBy").lean();
    // P4: a manager may review ONLY queries raised by their own team members.
    // Employees keep their assignee/assigner path; no global manager grant.
    const employeeAllowed =
      assigneeOfTask &&
      (String(assigneeOfTask.assignedTo) === String(reviewerId) ||
        String(assigneeOfTask.assignedBy) === String(reviewerId));
    const managerAllowed =
      req.auth?.role === "manager" &&
      assigneeOfTask &&
      (await teamMemberIds(String(reviewerId))).some(
        (id) => String(id) === String(assigneeOfTask.assignedTo),
      );
    if (!employeeAllowed && !managerAllowed) {
      throw ApiError.forbidden("You cannot review this query.");
    }

    record.status = status as never;
    record.review = review ?? record.review ?? "";
    record.reviewedBy = new Types.ObjectId(reviewerId);
    record.reviewedAt = new Date();
    if (status === "raised_again") record.raisedAgainCount = (record.raisedAgainCount ?? 0) + 1;

    await record.save();

    const populated = await Query.findById(record._id)
      .populate("task", "taskId title")
      .populate("employee", PERSON_FIELDS);

    res.json({ message: "Review saved.", query: serializeQuery(populated) });
  }),
);

export { serializeTask, serializeQuery, requireObjectId, isObjectId, PERSON_FIELDS };
export default router;