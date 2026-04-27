/**
 * Drizzle client factory.
 *
 * `createDb(databaseUrl)` returns the Drizzle handle plus the underlying
 * `postgres-js` connection so callers (e.g. the CLI, the test harness)
 * can close it explicitly. The HTTP server doesn't need to close
 * explicitly — graceful shutdown is handled by the runtime.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export interface DbHandle {
  db: Database;
  client: postgres.Sql;
  close: () => Promise<void>;
}

export function createDb(
  databaseUrl: string,
  options: postgres.Options<Record<string, never>> = {},
): DbHandle {
  const client = postgres(databaseUrl, { ...options });
  const db = drizzle(client, { schema });
  return {
    db,
    client,
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}
