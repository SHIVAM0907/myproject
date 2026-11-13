import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env, trustProxySetting } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { activeBackend } from "./services/storage.service.js";

import authRouter from "./controllers/auth.controller.js";
import platformRouter from "./controllers/platform.controller.js";
import adminRouter from "./controllers/admin.controller.js";
import uploadRouter from "./controllers/upload.controller.js";
import employeeRoutes from "./routes/employee.routes.js";

/**
 * Origins already reported as disallowed, so a browser retrying preflight on
 * every request produces one warning per origin rather than a flood.
 */
const warnedOrigins = new Set<string>();

function warnOriginOnce(origin: string): void {
  if (warnedOrigins.has(origin)) return;
  warnedOrigins.add(origin);
  console.warn(
    `[cors] refused origin ${origin}. Allowed: ${env.cors.origins.join(", ") || "(none)"}\n` +
      "        If this is a dev server on a shifted port it should have been allowed — " +
      "check that NODE_ENV is not 'production' and CORS_ORIGINS is unset.",
  );
}

export function createApp(): express.Express {
  const app = express();
  // Attach the shared Redis rate-limit store (if REDIS_URL is set) before the
  // first request reaches a limiter (P2).
  void import("./middleware/rateLimit.js").then((m) => void m.initRateLimitStores());

  // P2: req.ip must be correct behind a proxy but NOT spoofable on direct
  // connections. TRUST_PROXY defaults to 0 in dev (nothing trusted, so a
  // client cannot forge X-Forwarded-For to dodge IP-based rate limits) and is
  // mandatory-explicit in production (validated in env.ts).
  app.set("trust proxy", trustProxySetting);

  app.use(
    helmet({
      // The frontend is served from a different origin, and the upload flow
      // PUTs directly to this API from the browser.
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl and server-to-server calls have no Origin header.
        if (!origin) return callback(null, true);
        if (env.cors.origins.includes("*") || env.cors.origins.includes(origin)) {
          return callback(null, true);
        }
        // Dev only, and only when CORS_ORIGINS was never set: allow any loopback
        // origin so a Vite dev server that landed on 5174 (because 5173 was
        // busy) is not rejected. `cors.devAllowLoopback` is false in production
        // and false whenever CORS_ORIGINS is configured, so this cannot widen
        // the allowlist for a real deployment.
        if (env.cors.devAllowLoopback && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }

        // Refuse with `callback(null, false)` rather than `callback(new Error(...))`.
        // Passing an Error makes cors call next(err), so Express turns a routine
        // origin mismatch into a 500 plus a full stack trace — and since the
        // browser retries the preflight on every request, one misconfigured
        // origin buries the log in identical traces. Returning false simply
        // omits the CORS headers, so the browser blocks the response as it
        // should and the server stays quiet. The warning below keeps the cause
        // discoverable.
        warnOriginOnce(origin);
        return callback(null, false);
      },
      credentials: true,
    }),
  );

  // JSON for every route except the local upload PUT, which needs the raw
  // bytes and installs its own body parser.
  app.use(
    express.json({
      limit: "1mb",
      type: (req) => !String(req.url ?? "").startsWith("/api/upload/local"),
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      storage: activeBackend(),
      env: env.nodeEnv,
    });
  });

  // Public signup, then the platform/admin realm.
  app.use("/api/auth", authRouter);
  app.use("/api/auth", platformRouter);
  app.use("/api/user", platformRouter);

  // Admin/HR: approving self-registered accounts. Platform realm only.
  app.use("/api/admin", adminRouter);

  // Media store — NOT under /api/employee (see getImageUrl.ts).
  app.use("/api/upload", uploadRouter);

  // Employee/manager subsystem. A single router owns the whole prefix and
  // applies auth once; see routes/employee.routes.ts for why.
  app.use("/api/employee", employeeRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;