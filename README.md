# Work Flow

  **A full-stack HRM platform for attendance, leave, tasks, queries and team reporting.**

  <img alt="Node" src="https://img.shields.io/badge/Node-%3E%3D20-339933?logo=node.js&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black" />
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Mongoose%208-47A248?logo=mongodb&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" />
</div>

---

Work Flow is a monorepo with a React single-page app and an Express/MongoDB API. It
serves three separate audiences from one codebase:

- **Employees** clock in and out, request leave, track tasks, raise queries and join meetings.
- **Managers** approve leave, assign and review tasks, answer queries and see team attendance and reports.
- **Administrators** approve sign-ups, manage the employee directory, set roles and suspend or delete accounts.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Demo accounts](#demo-accounts)
- [How authentication works](#how-authentication-works)
- [API overview](#api-overview)
- [Scripts](#scripts)
- [Testing](#testing)
- [Uploads and storage](#uploads-and-storage)
- [Deployment notes](#deployment-notes)
- [Troubleshooting](#troubleshooting)
- [Further documentation](#further-documentation)

## Features

### Employee dashboard

| Area | What it does |
| --- | --- |
| Attendance | Check in/out, start/end breaks, view today's record, monthly calendar and stats |
| Leave | Balances, request history, new requests with optional attachments, draft support |
| Tasks | Assigned task list, task details, status updates, attachment links |
| Queries | Raise a question to a manager and follow it from open to resolved |
| Meetings | View upcoming meetings and meeting records |
| Profile | Edit personal details, change password, upload a profile picture |

### Manager dashboard

| Area | What it does |
| --- | --- |
| Team | Member directory, profiles, team attendance table and rates |
| Leave | Pending requests with approve/reject actions |
| Tasks | Assign tasks, view all team tasks and an aggregate status summary |
| Queries | Review, respond to and close employee queries with stats |
| Reports | Team-level report views and calendar widget |
| Profile | Manager profile and password settings |

### Admin console (`/admin`)

| Area | What it does |
| --- | --- |
| Stats | Counts by role, department and account status |
| Approvals | Queue of self-registered accounts, approved with a role and optional manager |
| Directory | Search, filter and paginate employees; create, edit and delete accounts |
| Account control | Set role, status, join date and reports-to; suspend or permanently remove accounts |

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 6, React Router 6, Tailwind CSS 3, Axios, Lucide icons |
| Backend | Node.js 20+, Express 4, TypeScript, Mongoose 8 |
| Database | MongoDB (Atlas or local) |
| Auth | JWT (`jsonwebtoken`), bcrypt password hashing, server-side token versioning |
| Uploads | Cloudflare R2 via the S3 SDK, with a local-disk fallback |
| Hardening | Helmet, CORS allowlist, `express-rate-limit` (optionally Redis-backed), `express-validator` |
| Testing | `mongodb-memory-server`, Supertest, `node:assert` suites |

## Repository layout

```text
.
├── backend/
│   ├── src/
│   │   ├── config/         env loading and MongoDB connection
│   │   ├── controllers/    route handlers, one router per domain
│   │   ├── middleware/     auth, validation, rate limiting, errors
│   │   ├── models/         Employee, Attendance, LeaveRequest, Task, Query, Meeting, Upload
│   │   ├── routes/         the single /api/employee entry point
│   │   ├── seed/           demo data and the employee CLI
│   │   ├── services/       storage and authorization helpers
│   │   └── utils/          date, JWT, serialization, API errors
│   ├── tests/              smoke and focused integration suites
│   └── README.md           deep backend design notes
├── frontend/
│   ├── src/
│   │   ├── components/     route guards and shared UI
│   │   ├── contexts/       employee and platform auth contexts
│   │   ├── hooks/          shared hooks
│   │   ├── lib/            axios clients (employee, platform, upload)
│   │   ├── pages/          landing, auth, admin, employee and manager dashboards
│   │   ├── types/          shared TypeScript types
│   │   └── utils/          image URLs, initials, dates
│   └── vite.config.ts      dev server and /api proxy
└── README.md
```

## Quick start

### Prerequisites

- Node.js **20 or newer**
- npm
- A MongoDB database. Atlas works; so does a local MongoDB instance.

### 1. Clone

```bash
git clone https://github.com/SHIVAM0907/myproject.git
cd myproject
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `backend/.env` and set at minimum:

- `MONGODB_URI` — replace `<db_password>` with the real database user's password.
- `JWT_EMPLOYEE_SECRET` and `JWT_PLATFORM_SECRET` — replace the `dev-*-secret-change-me` values.

Then start it:

```bash
npm run dev
```

The API listens on `http://localhost:5001`. On the first boot against an empty
database it seeds a manager, four employees and a platform administrator.

If you use Atlas, add your current IP under **Network Access**, or the connection
will time out. URL-encode reserved characters in the password (`@` → `%40`,
`:` → `%3A`, `/` → `%2F`, `#` → `%23`).

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

The app runs at `http://localhost:5173`.

| Screen | URL |
| --- | --- |
| Landing page | `http://localhost:5173/` |
| Employee / manager sign-in | `http://localhost:5173/login` |
| Sign up | `http://localhost:5173/signup` |
| Admin sign-in | `http://localhost:5173/admin/login` |
| Admin console | `http://localhost:5173/admin` |

New sign-ups are created as inactive employees and cannot sign in until an
administrator approves them.

## Configuration

Both halves ship an `.env.example` with inline documentation. Never commit a
real `.env`.

### Backend (`backend/.env`)

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB connection string |
| `PORT` | no | API port, defaults to `5001` |
| `NODE_ENV` | no | `development` or `production` |
| `CORS_ORIGINS` | in production | Comma-separated allowed origins. Leave unset in development to accept any loopback port |
| `JWT_EMPLOYEE_SECRET` | yes | Signing secret for the employee realm |
| `JWT_PLATFORM_SECRET` | yes | Signing secret for the platform/admin realm |
| `JWT_EXPIRES_IN` / `JWT_PLATFORM_EXPIRES_IN` | no | Token lifetimes, default `7d` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | no | Cloudflare R2 credentials. Without them uploads use local disk |
| `R2_ENDPOINT` | no | Derived from the account ID when blank |
| `UPLOAD_MAX_BYTES` | no | Maximum upload size, default 2 MB |
| `UPLOAD_SIGNED_URL_TTL` | no | Signed URL lifetime in seconds, default 300 |
| `UPLOAD_LOCAL_DIR`, `UPLOAD_LOCAL_BASE_URL` | no | Local fallback storage path and public base URL |
| `SEED_ON_START` | no | Seed demo data when the database is empty |
| `SEED_MANAGER_PASSWORD`, `SEED_EMPLOYEE_PASSWORD` | no | Passwords for seeded demo accounts |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | no | Seeded platform administrator |
| `REDIS_URL` | no | Shares auth rate-limit counters across API instances |
| `TRUST_PROXY` | in production | Number of trusted proxy hops |
| `AUTH_RATE_WINDOW_MS`, `AUTH_RATE_IP_MAX`, `AUTH_RATE_REGISTER_MAX` | no | Authentication rate-limit tuning |

### Frontend (`frontend/.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the API, default `http://localhost:5001` |

Only `VITE_`-prefixed variables reach the browser bundle. Never put a secret in
the frontend environment.

## Demo accounts

Seeded when the database is empty:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@learnilm.test` | `Admin@123` |
| Manager | `manager@learnilm.test` | `Manager@123` |
| Employee | `employee@learnilm.test` | `Employee@123` |
| Employee | `kabir@learnilm.test` | `Employee@123` |
| Employee | `meera@learnilm.test` | `Employee@123` |
| Employee | `aditya@learnilm.test` | `Employee@123` |

The administrator and the team manager are **different accounts**. The admin
signs in at `/admin/login`; the manager signs in at `/login`.

Change these credentials before deploying anywhere public, and reseed with
`npm run seed`.

## How authentication works

There are two independent JWT realms, signed with different secrets, so a token
from one cannot be replayed against the other:

| Realm | Stored as | Routes | Secret |
| --- | --- | --- | --- |
| Employee / manager | `employee_token`, `employee_admin_token` | `/api/employee/*`, `/api/upload/*` | `JWT_EMPLOYEE_SECRET` |
| Platform admin | `token` | `/api/auth/*`, `/api/user/*`, `/api/admin/*` | `JWT_PLATFORM_SECRET` |

Additional properties:

- Passwords are hashed with bcrypt.
- Employee tokens embed a `tokenVersion`, so a password change or logout-all can
  invalidate existing sessions server-side.
- Platform admin requests re-read the role from the database, so demotion or
  suspension takes effect immediately rather than at token expiry.
- Auth endpoints are rate-limited per IP and per account. Failed attempts trigger
  a temporary lockout; success clears the counters.
- Admin accounts are not a superset of managers. Inside the employee realm every
  elevated action is an explicit `role === "manager"` check.

More detail is in [`backend/README.md`](backend/README.md).

## API overview

| Prefix | Purpose | Auth |
| --- | --- | --- |
| `GET /health` | Liveness, uptime and active storage backend | Public |
| `/api/auth` | Sign-up, platform login, current platform user | Public / platform token |
| `/api/user` | Platform user routes | Platform token |
| `/api/admin` | Employee administration, approvals, stats | Platform admin |
| `/api/employee` | Dashboards, attendance, leave, tasks, queries, meetings, team, reports | Employee token |
| `/api/upload` | Presigned uploads and signed file URLs | Employee token |

The employee API is one router mounted at `/api/employee`:

- `POST /login`
- `GET /me`, `PUT /me`, `PUT /me/password`
- `GET /attendance/today`, `GET /attendance/month`
- `POST /attendance/check-in`, `POST /attendance/check-out`
- `POST /attendance/break/start`, `POST /attendance/break/end`
- `GET /leave/balance`, `GET /leave/history`, `POST /leave`, `POST /leave/draft`
- `GET /tasks`, `POST /tasks`, `PATCH /tasks/:taskId/status`
- `GET /team/tasks`, `GET /team/tasks/summary`
- `GET /queries`, `POST /queries`, `POST /queries/:queryId/review`
- `GET /meetings`, `POST /meetings`
- `GET /team`, `GET /team/available`, `GET /team/member/:id`
- `GET /team/attendance`, `GET /team/attendance/stats`
- `GET /team/reports`

Errors are serialised consistently as `{ message, errors? }`.

## Scripts

### Backend

```bash
npm run dev        # tsx watch on port 5001
npm run build      # compile TypeScript to dist/
npm start          # run the compiled build
npm run typecheck  # tsc --noEmit
npm test           # smoke suite against an in-memory MongoDB
npm run test:live  # same suite against MONGODB_URI (destructive)
npm run seed       # wipe and reseed demo data
npm run employees -- list | approve | show | suspend <email>
```

### Frontend

```bash
npm run dev        # Vite dev server on port 5173
npm run build      # type-check and build to dist/
npm run preview    # serve the production build locally
npm run typecheck  # tsc --noEmit
```

## Testing

```bash
cd backend
npm test
```

The smoke suite starts an in-memory MongoDB, so it needs no Atlas credentials
and cannot touch real data. The first run downloads a `mongod` binary (about
68 MB). Focused suites live next to it and can be run directly:

```bash
npx tsx tests/authorization.test.ts
npx tsx tests/jwt-lifecycle.test.ts
npx tsx tests/rate-limit.test.ts
npx tsx tests/timezone.test.ts
npx tsx tests/upload-security.test.ts
npx tsx tests/env-validation.test.ts
```

## Uploads and storage

`POST /api/upload/get-upload-url` returns a presigned `PUT` URL and the object
key to store. With R2 credentials configured this is a genuine S3 presigned URL.
Without them the API stores files under `backend/uploads` and serves them back
itself, so profile pictures work in local development. `GET /health` reports
which backend is active.

Task attachments are stored as **keys**, not URLs. The frontend signs them with
`POST /api/upload/get-file-url` before rendering a link.

## Deployment notes

1. Set `NODE_ENV=production`, both JWT secrets, `MONGODB_URI` and an explicit
   `CORS_ORIGINS` list on the backend.
2. Set `TRUST_PROXY` to the number of proxy hops in front of the API.
3. Build both packages: `npm run build` in `backend/` and `frontend/`.
4. Serve `frontend/dist` from a static host or CDN and run `node dist/index.js`
   for the API.
5. Configure R2 for persistent uploads. Local disk storage is not durable across
   deploys.
6. Set `VITE_API_BASE_URL` at build time to the public API URL.
7. Remove or replace the seeded demo accounts.

## Troubleshooting

**`bad auth : authentication failed`**
Atlas rejected the database credentials. Check **Atlas → Database Access** for
the database user, reset its password if needed, and URL-encode reserved
characters in the connection string. Use the database user's credentials, not
your Atlas website login.

**`Origin http://localhost:5174 is not allowed by CORS`**
The Vite dev server moved off 5173 because the port was busy. Leave
`CORS_ORIGINS` unset in development so any loopback port is accepted, or set
`strictPort: true` in `frontend/vite.config.ts` to fail loudly instead.

**A new sign-up cannot log in**
This is expected. Accounts are created inactive and must be approved by an
administrator at `/admin`, or from the CLI with
`npm run employees -- approve <email>`.

**Uploads 404 in local development**
Confirm `backend/uploads` exists and that `VITE_API_BASE_URL` points at the API
that served the upload.

## Further documentation

- [`backend/README.md`](backend/README.md) — architecture, auth realms, API
  contract quirks, employee codes, task IDs, approval flow and known gaps.
- [`backend/.env.example`](backend/.env.example) — every backend setting with
  inline comments.
- [`frontend/.env.example`](frontend/.env.example) — frontend environment.

## License

No license file is included. Add one before distributing or open-sourcing this
project.