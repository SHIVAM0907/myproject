import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { activeBackend } from "./services/storage.service.js";
import { seedIfEmpty } from "./seed/seed.js";

async function main(): Promise<void> {
  await connectDatabase();

  if (env.features.seedOnStart) {
    await seedIfEmpty();
  }

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[api] listening on http://localhost:${env.port}`);
    console.log(`[api] env=${env.nodeEnv} storage=${activeBackend()}`);
    if (activeBackend() === "local") {
      console.log("[api] no R2 credentials found — uploads fall back to backend/uploads");
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[api] failed to start:", err instanceof Error ? err.message : err);
  process.exit(1);
});