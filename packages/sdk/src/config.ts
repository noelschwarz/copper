/**
 * `AloyConfig` and env-var resolution.
 *
 * Plain Zod schema — no extra dependencies. `loadConfigFromEnv` reads
 * `ALOY_*` env vars into a partial input shape and merges any explicit
 * overrides on top, then validates.
 */

import { z } from "zod";

export const RedactionPatternSchema = z.object({
  label: z.string().min(1),
  pattern: z.union([z.string(), z.instanceof(RegExp)]),
});
export type RedactionPattern = z.infer<typeof RedactionPatternSchema>;

export const AloyConfigSchema = z.object({
  apiUrl: z.string().url().default("http://localhost:3000"),
  apiKey: z.string().optional(),
  project: z.string().min(1).default("default"),
  agentId: z.string().min(1).default("default"),
  queueSize: z.number().int().positive().default(1000),
  batchSize: z.number().int().positive().default(50),
  flushIntervalMs: z.number().int().positive().default(1000),
  maxRetries: z.number().int().nonnegative().default(3),
  /**
   * Tool calls with `riskScore >= blockThreshold` throw `PolicyViolationError`
   * *before* the underlying call executes. Default 101 (effectively
   * disabled, since the highest possible score is 100). Set to e.g. 80 to
   * block destructive SQL, 90 to block subprocess execution.
   */
  blockThreshold: z.number().int().min(0).max(101).default(101),
  enabled: z.boolean().default(true),
  redaction: z
    .object({
      extraPatterns: z.array(RedactionPatternSchema).default([]),
    })
    .default({}),
  networkAllowlist: z.array(z.string()).default([]),
});
export type AloyConfig = z.infer<typeof AloyConfigSchema>;
export type AloyConfigInput = z.input<typeof AloyConfigSchema>;

const TRUTHY = new Set(["1", "true", "yes", "on"]);

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return TRUTHY.has(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function loadConfigFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  overrides: Partial<AloyConfigInput> = {},
): AloyConfig {
  const fromEnv: Partial<AloyConfigInput> = {};
  if (env.ALOY_API_URL) fromEnv.apiUrl = env.ALOY_API_URL;
  if (env.ALOY_API_KEY) fromEnv.apiKey = env.ALOY_API_KEY;
  if (env.ALOY_PROJECT) fromEnv.project = env.ALOY_PROJECT;
  if (env.ALOY_AGENT_ID) fromEnv.agentId = env.ALOY_AGENT_ID;
  const queueSize = parseNumber(env.ALOY_QUEUE_SIZE);
  if (queueSize !== undefined) fromEnv.queueSize = queueSize;
  const batchSize = parseNumber(env.ALOY_BATCH_SIZE);
  if (batchSize !== undefined) fromEnv.batchSize = batchSize;
  const flushInterval = parseNumber(env.ALOY_FLUSH_INTERVAL_MS);
  if (flushInterval !== undefined) fromEnv.flushIntervalMs = flushInterval;
  const maxRetries = parseNumber(env.ALOY_MAX_RETRIES);
  if (maxRetries !== undefined) fromEnv.maxRetries = maxRetries;
  const blockThreshold = parseNumber(env.ALOY_BLOCK_THRESHOLD);
  if (blockThreshold !== undefined) fromEnv.blockThreshold = blockThreshold;
  const enabled = parseBoolean(env.ALOY_ENABLED);
  if (enabled !== undefined) fromEnv.enabled = enabled;
  return AloyConfigSchema.parse({ ...fromEnv, ...overrides });
}
