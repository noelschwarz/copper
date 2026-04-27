/**
 * Test harness for the API.
 *
 * Spins up a real Postgres 15 via @testcontainers/postgresql, runs Drizzle
 * migrations against it, and returns a fresh Hono app handle plus the DB.
 * Drizzle's `jsonb` columns and several Postgres-specific defaults don't
 * translate cleanly to SQLite, so this test harness is the single fixture
 * we use across `apps/api/tests/`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { type DbHandle, createDb } from "../src/db/index.js";
import { type AppDeps, buildApp } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = path.resolve(here, "..", "migrations");

export interface TestApp {
  app: ReturnType<typeof buildApp>;
  handle: DbHandle;
  container: StartedPostgreSqlContainer;
  databaseUrl: string;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

export async function startTestApp(options: Partial<Omit<AppDeps, "db">> = {}): Promise<TestApp> {
  const container = await new PostgreSqlContainer("postgres:15-alpine")
    .withDatabase("aloy_test")
    .withUsername("aloy")
    .withPassword("aloy")
    .start();
  const databaseUrl = container.getConnectionUri();
  const handle = createDb(databaseUrl);
  await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });

  const app = buildApp({
    db: handle.db,
    useDbAuthentication: options.useDbAuthentication ?? false,
    corsOrigins: options.corsOrigins ?? "*",
  });

  return {
    app,
    handle,
    container,
    databaseUrl,
    fetch: async (input, init) => {
      const url = `http://localhost${input.startsWith("/") ? input : `/${input}`}`;
      const result = app.fetch(new Request(url, init));
      return result instanceof Response ? result : await result;
    },
    close: async () => {
      await handle.close();
      await container.stop();
    },
  };
}
