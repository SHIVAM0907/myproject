# Work Flow — Backend

Express + Mongoose API for the employee/manager subsystem. It implements the
contract the frontend actually calls, reverse-engineered from
`frontend/src` rather than guessed.

## Quick start

```bash
cd backend
npm install

# 1. Put the real Atlas password in .env (see below)
# 2. Start it
npm run dev
```

On first boot with an empty database it seeds a demo manager and four
employees, so the dashboards have something to render.

```bash
npm run dev        # tsx watch, port 5001
npm run build      # compile to dist/
npm start          # run the compiled build
npm run typecheck  # tsc --noEmit
npm test        # 162-check smoke suite against an in-memory MongoDB
npm run seed       # wipe and reseed the demo data
```

`npm test` downloads a ~68 MB `mongod` binary on first run. It needs no Atlas
credentials, so you can run it before filling in `.env`. `npm run test:live`
runs the same suite against the real `MONGODB_URI` (destructive).

## Configuration

Copy `.env.example` to `.env`. Two things you must change:

1. **`MONGODB_URI`** — the template still contains the literal `<db_password>`
   placeholder and the server refuses to boot with it. If your Atlas password
   contains `@`, `:`, `/` or `#`, URL-encode it (`%40`, `%3A`, `%2F`, `%23`)
   or the driver will misparse the URI.
2. **`JWT_EMPLOYEE_SECRET`** and **`JWT_PLATFORM_SECRET`** — they ship as
   `dev-*-secret-change-me`.

In Atlas, add your IP under **Network Access**, or the connection will time out.

### MongoDB reports `bad auth`

`bad auth : authentication failed` means Atlas rejected the database
credentials. In **Atlas → Database Access**, verify the database user exists
and reset its password if needed. Use that database user's username and
password in `MONGODB_URI`—not your Atlas website login. Copy the connection
string from **Connect → Drivers**, then URL-encode reserved characters in both
credentials (for example `@` as `%40`, `:` as `%3A`, `/` as `%2F`, and `#` as
`%23`). Update `backend/.env` and restart the backend. Do not share or commit
the URI because it contains the database password.

## Seeded credentials

| Role     | Email                     | Password       |
| -------- | ------------------------- | -------------- |
| Admin    | `admin@learnilm.test`     | `Admin@123`    |
| Manager  | `manager@learnilm.test`   | `Manager@123`  |
| Employee | `employee@learnilm.test`  | `Employee@123` |
| Employee | `kabir@learnilm.test`     | `Employee@123` |
| Employee | `meera@learnilm.test`     | `Employee@123` |
| Employee | `aditya@learnilm.test`    | `Employee@123` |

The admin and the manager are **different accounts**. Override them with
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `SEED_ADMIN_NAME`.

Unlike the demo data, the admin is not gated behind "the collection is empty":
`ensureAdmin` runs on every boot, so a database seeded before the admin role
existed still gets an account rather than an unreachable admin console. If that
email already exists it is promoted to `admin` if it is not already; its
password is never silently reset, so change it through the app's own password
path if it is wrong.

## Architecture

```
src/
  config/       env loading (fails fast on placeholder creds), mongo connection
  models/       Employee, Attendance, LeaveRequest, Task, Query, Meeting
  middleware/   auth (JWT), validate, centralized error handler
  controllers/  one router per domain
  routes/       employee.routes.ts — the single /api/employee entry point
  services/     storage (R2 with a local-disk fallback)
  seed/         demo data
tests/smoke.ts  end-to-end suite
```

### Three independent token realms

The frontend keeps three tokens in separate `localStorage` keys and the backend
signs each with a **different secret**, so a token from one cannot be replayed
against another:

| Realm           | Key(s)                                  | Routes                  | Secret                 |
| --------------- | --------------------------------------- | ----------------------- | ---------------------- |
| Employee/manager| `employee_token`, `employee_admin_token` | `/api/employee/*`       | `JWT_EMPLOYEE_SECRET`  |
| Platform admin  | `token`                                  | `/api/auth/*`, `/api/user/*` | `JWT_PLATFORM_SECRET` |
| Uploads         | bearer of the employee realm             | `/api/upload/*`         | `JWT_EMPLOYEE_SECRET`  |

This mirrors `frontend/src/lib/employeeApi.ts`, which deliberately keeps the two
realms apart.

### Why auth lives in `routes/employee.routes.ts`

A router mounted at a prefix runs its own `router.use()` middleware for **every**
request on that prefix, including ones it does not own. Applying
`requireEmployee` inside each sub-router therefore ran it several times per
request and locked out the public `/login` route. Auth is now applied once, at
the single mount point, before the sub-routers.

### Errors

Every failure leaves through one handler and is serialised as
`{ message, errors? }`, because ~25 frontend call sites read
`err.response?.data?.message`. `errors: string[]` is populated for validation
failures, which `My-employee.tsx` joins with spaces.

CORS is the one rejection that deliberately does *not* raise: a disallowed
origin is refused with `callback(null, false)`, which omits the CORS headers so
the browser blocks the call, rather than `callback(new Error(...))`, which
`cors` turns into `next(err)` — a 500 plus a stack trace on every preflight
retry. The offending origin is still logged, once per origin, with the
allowlist.

### `Origin http://localhost:5174 is not allowed by CORS`

The dev server does not always get port 5173. If something else already holds
it, Vite takes the next free port and the browser then sends that port as its
`Origin`, which the allowlist does not contain.

Leaving `CORS_ORIGINS` unset avoids this: in development the server accepts any
`http://localhost:<port>` or `http://127.0.0.1:<port>` origin. That is
loopback-only, so it cannot widen the allowlist for a real deployment, and it
switches itself off the moment `NODE_ENV=production` **or** `CORS_ORIGINS` is
set — an explicit list is always honoured exactly as written.

To pin the port instead, set `strictPort: true` in `frontend/vite.config.ts` so
Vite fails loudly on 5174 rather than silently moving.

### Manager task scope

`GET /tasks` is scoped to `assignedTo: currentUserId(req)` — the caller's own
tasks. That is right for the employee dashboard, but a manager asking it would
only ever see their own tasks, never their reports', so it cannot back the
manager dashboard's "All tasks" table.

Two manager-only endpoints exist for that:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/employee/team/tasks` | every task assigned to a report, plus tasks the manager assigned |
| `GET` | `/api/employee/team/tasks/summary` | `total`, `completed`, `inProgress`, `onHold`, `pending`, `overdue` |

The scope is `assignedTo ∈ my reports` OR `assignedBy = me`, so a task assigned
to someone who later moves teams stays visible to whoever created it. The
summary is computed server-side from the same filter as the list, so the counts
cannot disagree with the table underneath them. Both require the `manager` role;
an employee token gets a 403.

Note the asymmetry: `POST /tasks` validates that the assignee *exists* but not
that they report to the caller, so a manager can still assign a task to any
employee in the directory. It will then appear in that other manager's team
list, not the creator's. Tightening that is a behaviour change and is left
alone here.

### Employee codes follow the role

Each role has its own code sequence: `EMP-` (employee), `MGR-` (manager),
`ADM-` (admin). `nextEmployeeCode(role)` probes only that role's prefix, so the
sequences are independent — promoting the only two managers to employee does not
renumber anybody's `EMP-` code.

Approval is where a role usually lands, because a signup is created as an
employee and promoted afterwards, so `PATCH /admin/employees/:id/job` re-issues
the code whenever the role actually changes. Two deliberate details:

- **Only on a real change.** Re-sending the same role must not burn a code, or
  an idempotent retry — and a role left selected in the approval form — would
  leave a gap in the sequence.
- **Self-collision is excluded.** While re-issuing, the row still holds the
  retired code, and `max + 1` scans live rows, so the naive probe can propose
  the code being replaced. `reissueCode` skips candidates the target row already
  holds.

Codes are recycled once freed: the scheme is `max + 1` over live rows, so a
retired code can be handed out again later. That is pre-existing behaviour, not
a consequence of role prefixing; forbidding it would need a persistent per-role
counter rather than a max over existing documents.

### `manager` must be populated, not just referenced

`serializeEmployee` degrades an unpopulated `manager` ref to a **bare id
string** rather than failing, so a missing `.populate()` is invisible: the
frontend guards with `typeof manager === "object"` (`EmployeeProfile`,
`ApplyForLeave`, `NewLeaveRequestForm`) and quietly renders nothing.

That guard was also why this went unnoticed in tests — `typeof null` is
`"object"` and so is `typeof ObjectId`, so an assertion of the form
`typeof manager === "object"` passes whether the field is populated, empty, or
broken. Assert the manager's `firstName`/`employeeCode` instead.

Every call site therefore populates with the shared `MANAGER_FIELDS`
projection: `GET/PUT /api/employee/me`, `/api/employee/login`,
`/api/admin/employees` (list, pending, detail, create, edit, job),
`/api/platform/auth/me` and `/api/platform/auth/login`.

### `/api/upload` needs the employee token, but not the `/api/employee` prefix

The media store is mounted at `/api/upload`, **not** under `/api/employee`, so
`employeeApi` cannot reach it with the right base path. That is the whole reason
`frontend/src/lib/uploadApi.ts` exists.

The trap: solving the base-path problem with a bare `axios` call also drops the
`Authorization` header, because the interceptor that attaches the token lives on
the axios *instance*. Every such call then 401'd, and the two symptoms looked
unrelated:

- profile pictures silently showed initials, because `getProfileImageUrl` is
  documented never to reject and falls back on any failure
- task attachments failed outright with `Request failed with status code 401`

So every `/api/upload` call goes through `uploadApi`. It deliberately has no 401
response interceptor (unlike `employeeApi`): these routes are also called during
render, and clearing the session from there would turn a missing picture into a
logout. A test now asserts all three upload routes reject an anonymous caller,
which is the check whose absence let this ship.

### Task ids are sequential, and attachments are keys

`taskId` used to be `TASK-${Date.now().toString(36).toUpperCase()}`. Base36 spans
the whole alphabet, so it emitted ids like `TASK-MUTIBLPE` containing `I`, `L`
and `B` — genuinely ambiguous to read aloud or transcribe, which is the entire
purpose of an id that shows up in a UI, a URL and a support ticket. It also
leaked the creation timestamp (base36 of epoch ms decodes straight back to a
date) and, since two tasks in the same millisecond produced the same string,
collided on the unique index with no retry — surfacing as a 500.

`nextTaskId()` now allocates `TASK-0001`, `TASK-0002`, … mirroring
`nextEmployeeCode`, with the same numeric-max probe and a retry loop. Legacy
base36 ids are skipped rather than breaking the sequence: `$toInt` of
`MUTIBLPE` is null and `$max` ignores nulls.

Task `attachments` are **storage keys** (`tasks/attachments/spec-1.png`), not
URLs. Nothing in the database is directly openable, so any UI that wants to link
one must sign it first via `POST /api/upload/get-file-url` —
`getSignedFileUrl()` / `getSignedFileUrls()` in
`frontend/src/utils/getImageUrl.ts` do this and cache for 50 minutes. Rendering
the key directly as an `href` produces a link that opens nothing, and guarding
with `typeof value === "string"` is not enough because a key *is* a string.

## Contract notes

The frontend is inconsistent in ways the backend has to absorb deliberately:

- **Collection keys differ per endpoint** — `/team` returns `members`,
  `/team/available` returns `employees`, `/team/member/:id` returns `member`.
- **Envelope shapes differ** — `/queries/stats` returns a bare
  `{ total, open, inReview, resolved, raisedAgain }`, while
  `/team/attendance/stats` nests under `{ date, stats }`.
- **Dates are encoded three ways** — `/attendance/month` and `/team/reports`
  send a full ISO datetime, `/calendar/events` sends `YYYY-MM`, and the leave
  form sends `YYYY-MM-DD`. `utils/date.ts` normalises all three.
- **Status casing is inconsistent by design in the frontend** — task statuses
  are Title Case (`"Not Started"`, `"In Progress"`) while every other status
  union is `snake_case`. The models match the frontend exactly; the API rejects
  anything else with a 422.
- **Mutations use different verbs** — tasks and leave use `PATCH .../status`,
  but queries use `POST /queries/:id/review` carrying `{ review, status }`.

Attendance records are keyed on a local-midnight `dayKey` (`"YYYY-MM-DD"`) with
a unique index on `{ employee, dayKey }`, so a clock-in upserts rather than
duplicating.

## Uploads

`POST /api/upload/get-upload-url` returns a presigned R2 `PUT` URL plus the key
to store. With R2 credentials configured that is a genuine S3 presigned URL. With
them absent it falls back to `backend/uploads` and hands back an absolute URL
pointing back at this API, so profile pictures work in local development instead
of 404ing. The active backend is reported by `GET /health`.

## Registration and approval

Signup is public and deliberately restrictive, because `POST /api/auth/register`
is unauthenticated:

- `role` is hardcoded to `employee` and never read from the body, so nobody can
  self-register as a manager.
- `employeeCode` is generated server-side (`nextEmployeeCode` in
  `models/Employee.ts`, which computes the highest numeric suffix in the
  database rather than sorting the code strings — the seeded rows use 3-digit
  codes and generated ones are 4-digit, and a lexicographic sort would keep
  re-issuing a taken code).
- The account is created `job.status: "inactive"` / `job.isActive: false` and no
  token is returned, so it **cannot sign in until an administrator approves it**.

Approval, from the terminal (this is the path that works today):

```bash
npm run employees -- list                  # accounts awaiting approval
npm run employees -- approve nina@example.com
npm run employees -- show nina@example.com
npm run employees -- suspend nina@example.com
```

The same operations over HTTP, in the platform realm, for when there is an admin
UI:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/employees/pending` | accounts awaiting approval |
| `GET` | `/api/admin/employees` | `?search=&status=&department=&role=&page=&limit=` |
| `GET` | `/api/admin/employees/:id` | one record |
| `POST` | `/api/admin/employees` | create an active employee/manager/admin |
| `PATCH` | `/api/admin/employees/:id` | edit profile fields, set or clear manager |
| `DELETE` | `/api/admin/employees/:id` | permanently remove the account |
| `PATCH` | `/api/admin/employees/:id/job` | approve/suspend, set role, manager, joinDate |
| `GET` | `/api/admin/managers` | active managers, for reports-to pickers |
| `GET` | `/api/admin/stats` | counts by role, department and status |

`PATCH /job` refuses to let an admin remove their own admin role, which would
otherwise lock the last platform user out of the endpoint approving accounts.

**Approval decides the role.** Signup can only ever create an `employee`, so
`PATCH /job` is where an account becomes a manager or a platform admin. Status,
role and manager are set in that one call, so an account never lands
half-configured. The console's approval row carries a role picker and a
reports-to picker for this reason; the reports-to picker is hidden for manager and
admin rows because those roles do not report to anyone. Assigning a manager is
still optional, so an approval is not blocked while the team is empty.

**Delete is a hard delete.** `PATCH /job` already covers blocking sign-in
(`status: "terminated"`), so `DELETE` exists for accounts that should not be
there at all. It removes the account together with its attendance, leave
requests, tasks, queries and meeting invitations, and sets any direct reports'
`manager` to `null` — otherwise the directory's "Reports to" column would render
a bare dangling id. Self-deletion is refused, and the guard that stops an admin
demoting themselves is what keeps at least one platform user reachable.

### The admin console

The frontend has a screen for all of the above, at `/admin`, signed in at
`/admin/login`. It is authorised by the **platform** token (`localStorage.token`
via `AuthContext`), not the employee token, so it works whether or not anyone is
signed in to the employee app — the realms stay independent.

`/api/auth/login` accepts **only** the `admin` role. A team manager is refused
with a 403 pointing them at `/login`, and gets no token: running the team
dashboards is not the same authority as approving accounts. `admin` is also not
a superset of `manager` in the other direction — inside the employee realm every
privilege is an explicit `role === "manager"` check, so an admin who signs in at
`/login` lands on `/employee` with no elevated rights.

`requirePlatform` re-reads the role from the database on every admin request
rather than trusting the token's claim, so demoting or suspending an admin takes
effect immediately instead of at token expiry. For the same reason
`PATCH /api/admin/employees/:id/job` refuses to let an admin change their own
role away from `admin`, which would lock the last platform user out of the
endpoint doing the demotion.

Sign in with the seeded `admin@learnilm.test` / `Admin@123`.

The console covers the full account lifecycle: **Add account** creates an
employee, manager or admin directly (already active, no approval needed);
**Edit** changes profile fields and reports-to; **Delete** removes an account
after a confirmation dialog that spells out what goes with it; and the approval
queue sets role, status and manager in one step. Delete uses the shared `Modal`
rather than `window.confirm`, so it matches the other dialogs instead of blocking
the page with an unstyleable native prompt.

## Known gaps

These are frontend-side and not fixable from here:

- **`docs/employee-backend-plan.md`**, referenced by `frontend/src/types/Employee.ts`,
  does not exist.

Resolved since this API was written:

- `/`, `/signup` and `/login` exist. Login posts to `/api/employee/login` and
  routes on `isManager`; signup posts to `/api/auth/register` and shows the
  pending-approval state.
- `RouteGuards.tsx` gates every dashboard behind `RequireAuth` / `RequireRole`,
  and keeps signed-in users away from `/login`. A guard awaits `loading` before
  deciding, so a deep link does not flash a dashboard before the session
  resolves.
- `/employee/apply-leave` is wired to `/leave/balance`, `/leave/history`,
  `/leave` and `/leave/draft`, including attachment upload through
  `/api/upload/get-upload-url`. Its duration preview mirrors the server rule
  (business days, falling back to half the calendar span for a weekend-only
  request, floored at half a day) so the number on screen matches what is
  recorded.