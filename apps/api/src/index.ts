/**
 * Aloy API entrypoint.
 *
 * Composition root. `buildApp(...)` constructs a Hono app independent of
 * the network — perfect for unit tests, the integration test, and the
 * actual server. The `main()` block at the bottom only runs when the
 * file is executed as the entry script.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { type Config, loadConfig } from "./config.js";
import { type Database, createDb } from "./db/index.js";
import { type AuthVariables, bearerAuth } from "./middleware/auth.js";
import { buildEventsRoutes } from "./routes/events.js";
import { buildHealthRoute } from "./routes/health.js";

export interface AppDeps {
  db: Database;
  useDbAuthentication: boolean;
  corsOrigins: string;
}

export function buildApp(deps: AppDeps): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  const origins =
    deps.corsOrigins.trim() === "*"
      ? "*"
      : deps.corsOrigins
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  app.use("*", cors({ origin: origins }));

  app.route("/health", buildHealthRoute());

  // Auth applies to /v1/* only; /health is always public.
  app.use("/v1/*", bearerAuth({ db: deps.db, useDbAuthentication: deps.useDbAuthentication }));
  app.route("/v1/events", buildEventsRoutes({ db: deps.db }));

  app.notFound((c) => c.json({ error: "not found" }, 404));
  app.onError((err, c) => {
    console.error("[aloy-api] unhandled error", err);
    return c.json({ error: "internal server error" }, 500);
  });

  return app;
}

export function migrationsFolder(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "migrations");
}

async function main(): Promise<void> {
  const cfg: Config = loadConfig();
  const handle = createDb(cfg.DATABASE_URL);
  try {
    await migrate(handle.db, { migrationsFolder: migrationsFolder() });
  } catch (err) {
    console.error("[aloy-api] migration failed", err);
    process.exit(1);
  }
  const app = buildApp({
    db: handle.db,
    useDbAuthentication: cfg.USE_DB_AUTHENTICATION,
    corsOrigins: cfg.CORS_ORIGINS,
  });
  serve({ fetch: app.fetch, port: cfg.PORT });
  console.log(`[aloy-api] listening on :${cfg.PORT}`);
}

const entrypoint = process.argv[1] ?? "";
if (
  import.meta.url === `file://${entrypoint}` ||
  entrypoint.endsWith("/dist/index.js") ||
  entrypoint.endsWith("\\dist\\index.js")
) {
  void main();
}
