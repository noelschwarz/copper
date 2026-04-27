/**
 * Bearer-token middleware for the events API.
 *
 * When `useDbAuthentication=false` (default), the middleware is a no-op so
 * local self-hosters don't need to manage keys. When true, every request
 * must carry `Authorization: Bearer aloy_…`. We look the key up by its
 * 16-char prefix in `api_keys` and verify the full token via bcrypt.
 *
 * Lookup-by-prefix is cheap; bcrypt is the real auth. A revoked key
 * (`revoked_at != null`) always rejects.
 */

import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { Database } from "../db/index.js";
import { apiKeys } from "../db/schema.js";

export const KEY_PREFIX_LENGTH = 16;

export interface AuthDeps {
  db: Database;
  useDbAuthentication: boolean;
}

export type AuthVariables = {
  Variables: {
    apiKeyId: string | undefined;
  };
};

export function bearerAuth(deps: AuthDeps) {
  return createMiddleware<AuthVariables>(async (c, next) => {
    if (!deps.useDbAuthentication) {
      await next();
      return;
    }
    const auth = c.req.header("Authorization") ?? c.req.header("authorization") ?? "";
    if (!/^bearer\s/i.test(auth)) {
      return c.json({ error: "missing bearer token" }, 401);
    }
    const token = auth.replace(/^bearer\s+/i, "").trim();
    if (!token.startsWith("aloy_") || token.length < KEY_PREFIX_LENGTH + 1) {
      return c.json({ error: "invalid token format" }, 401);
    }
    const prefix = token.slice(0, KEY_PREFIX_LENGTH);
    const rows = await deps.db.select().from(apiKeys).where(eq(apiKeys.prefix, prefix)).limit(1);
    const row = rows[0];
    if (!row || row.revokedAt) {
      return c.json({ error: "invalid token" }, 401);
    }
    const ok = await bcrypt.compare(token, row.hash);
    if (!ok) {
      return c.json({ error: "invalid token" }, 401);
    }
    c.set("apiKeyId", row.id);
    await next();
  });
}
