/**
 * /v1/events routes.
 *
 *   POST /v1/events         — single event, 202 Accepted, returns { id }.
 *   POST /v1/events/batch   — up to 500 events, 202, returns { ids }.
 *   GET  /v1/events?...     — cursor pagination on event id, descending.
 *
 * The Zod request schemas come from the SDK package (`aloy`) so the wire
 * contract has exactly one source of truth.
 */

import { zValidator } from "@hono/zod-validator";
import { type ToolCallEvent, ToolCallEventBatchSchema, ToolCallEventSchema } from "aloy";
import { and, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import type { Database } from "../db/index.js";
import { events as eventsTable } from "../db/schema.js";

const ListQuerySchema = z.object({
  project: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  beforeId: z.string().min(1).optional(),
});

export interface EventsDeps {
  db: Database;
}

function newEventId(): string {
  return `evt_${ulid()}`;
}

function toRow(id: string, e: ToolCallEvent) {
  return {
    id,
    project: e.project,
    agentId: e.agentId,
    toolName: e.toolName,
    args: (e.args ?? {}) as Record<string, unknown>,
    result: e.result ?? null,
    error: e.error ?? null,
    startedAt: new Date(e.startedAt),
    durationMs: e.durationMs,
    riskScore: e.riskScore ?? 0,
    blocked: e.blocked ?? false,
    sdkVersion: e.sdkVersion,
  } satisfies typeof eventsTable.$inferInsert;
}

export function buildEventsRoutes(deps: EventsDeps): Hono {
  const app = new Hono();

  app.post("/", zValidator("json", ToolCallEventSchema), async (c) => {
    const body = c.req.valid("json");
    const id = newEventId();
    await deps.db.insert(eventsTable).values(toRow(id, body));
    return c.json({ id }, 202);
  });

  app.post("/batch", zValidator("json", ToolCallEventBatchSchema), async (c) => {
    const { events } = c.req.valid("json");
    const rows = events.map((e) => toRow(newEventId(), e));
    if (rows.length > 0) {
      await deps.db.insert(eventsTable).values(rows);
    }
    return c.json({ ids: rows.map((r) => r.id) }, 202);
  });

  app.get("/", zValidator("query", ListQuerySchema), async (c) => {
    const { project, limit, beforeId } = c.req.valid("query");
    const conds = [];
    if (project) conds.push(eq(eventsTable.project, project));
    if (beforeId) conds.push(lt(eventsTable.id, beforeId));
    const rows = await deps.db
      .select()
      .from(eventsTable)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(eventsTable.id))
      .limit(limit);
    const last = rows[rows.length - 1];
    const nextBeforeId = rows.length === limit && last ? last.id : null;
    return c.json({
      events: rows.map((r) => ({
        ...r,
        startedAt: r.startedAt.toISOString(),
        receivedAt: r.receivedAt.toISOString(),
      })),
      nextBeforeId,
    });
  });

  return app;
}
