/**
 * Child-process helper for tests/env-validation.test.ts.
 *
 * Receives a JSON env map on argv[2], applies it, imports src/config/env.ts,
 * and prints a JSON outcome: `{ ok, message, seedOnStart }`. Validation errors
 * from env.ts are caught and reported instead of crashing.
 */
const envJson = process.argv[2] ?? "{}";
const overrides = JSON.parse(envJson);

for (const key of Object.keys(process.env)) {
  delete process.env[key];
}
process.env.NODE_ENV = overrides.NODE_ENV ?? "production";
for (const [k, v] of Object.entries(overrides)) process.env[k] = v;

try {
  const mod = await import("../../src/config/env.ts");
  process.stdout.write(
    JSON.stringify({
      ok: true,
      message: "",
      seedOnStart: mod.env.features.seedOnStart,
    }),
  );
} catch (err) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
      seedOnStart: null,
    }),
  );
}
