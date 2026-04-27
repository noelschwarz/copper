/**
 * API server env-config schema.
 *
 * All env vars are validated through Zod at startup. If anything is wrong
 * we fail loudly with a useful message — there is no "best effort" mode.
 */

import { z } from "zod";

const TRUTHY = new Set(["1", "true", "yes", "on"]);

export const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1),
  USE_DB_AUTHENTICATION: z
    .preprocess(
      (v) => (typeof v === "string" ? TRUTHY.has(v.trim().toLowerCase()) : v),
      z.boolean(),
    )
    .default(false),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  CORS_ORIGINS: z.string().default("*"),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.errors.map((e) => `  ${e.path.join(".")}: ${e.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
