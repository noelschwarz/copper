/**
 * Wire schema for events shipped from SDK to API.
 *
 * These Zod schemas are the source of truth for the wire contract. The API
 * server imports them via `aloy` (workspace alias) to validate incoming
 * requests; this guarantees the SDK and server agree on the shape forever
 * without manual duplication.
 */

import { z } from "zod";

export const ToolCallEventSchema = z.object({
  project: z.string().min(1),
  agentId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.unknown()).default({}),
  result: z.unknown().nullable().optional(),
  error: z.string().nullable().optional(),
  startedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
  riskScore: z.number().int().min(0).max(100).default(0),
  blocked: z.boolean().default(false),
  sdkVersion: z.string().min(1),
});
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type ToolCallEventInput = z.input<typeof ToolCallEventSchema>;

export const ToolCallEventBatchSchema = z.object({
  events: z.array(ToolCallEventSchema).min(1).max(500),
});
export type ToolCallEventBatch = z.infer<typeof ToolCallEventBatchSchema>;

export const EventCreatedSchema = z.object({ id: z.string() });
export type EventCreated = z.infer<typeof EventCreatedSchema>;

export const EventBatchCreatedSchema = z.object({ ids: z.array(z.string()) });
export type EventBatchCreated = z.infer<typeof EventBatchCreatedSchema>;

export const EventListResponseSchema = z.object({
  events: z.array(ToolCallEventSchema.extend({ id: z.string(), receivedAt: z.string() })),
  nextBeforeId: z.string().nullable(),
});
export type EventListResponse = z.infer<typeof EventListResponseSchema>;
