/**
 * Drizzle schema for the Aloy API.
 *
 * Two tables:
 *   - `api_keys`  — bearer tokens, bcrypt-hashed.
 *   - `events`    — observed tool calls, identified by `evt_<ulid>`.
 */

import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().unique(),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    project: text("project").notNull(),
    agentId: text("agent_id").notNull(),
    toolName: text("tool_name").notNull(),
    args: jsonb("args").notNull().default(sql`'{}'::jsonb`),
    result: jsonb("result"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    riskScore: integer("risk_score").notNull().default(0),
    blocked: boolean("blocked").notNull().default(false),
    sdkVersion: text("sdk_version").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("events_project_id_idx").on(t.project, t.id)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type ApiKeyInsert = typeof apiKeys.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
