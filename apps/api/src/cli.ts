/**
 * `aloy-admin` — command-line API key management.
 *
 *   aloy-admin keys create --name "my-laptop"
 *   aloy-admin keys list
 *   aloy-admin keys revoke <prefix>
 *
 * Generated keys are printed once (and never again). What we store in
 * Postgres is the bcrypt hash plus a 16-char prefix used for fast lookup.
 */

import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { Command } from "commander";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";
import { apiKeys } from "./db/schema.js";
import { KEY_PREFIX_LENGTH } from "./middleware/auth.js";

const BCRYPT_ROUNDS = 12;

export function generateApiKey(): { full: string; prefix: string } {
  const random = randomBytes(24).toString("base64url");
  const full = `aloy_live_${random}`;
  return { full, prefix: full.slice(0, KEY_PREFIX_LENGTH) };
}

async function withDb<T>(fn: (deps: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const cfg = loadConfig();
  const deps = createDb(cfg.DATABASE_URL);
  try {
    return await fn(deps);
  } finally {
    await deps.close();
  }
}

const program = new Command();
program.name("aloy-admin").description("Admin CLI for the self-hosted Aloy API");

const keys = program.command("keys").description("Manage API keys");

keys
  .command("create")
  .description("Create a new API key")
  .requiredOption("-n, --name <name>", "human-readable name (only stored, not used for auth)")
  .action(async (opts: { name: string }) => {
    await withDb(async ({ db }) => {
      const { full, prefix } = generateApiKey();
      const hash = await bcrypt.hash(full, BCRYPT_ROUNDS);
      await db.insert(apiKeys).values({ id: ulid(), name: opts.name, prefix, hash });
      console.log("Generated API key (shown only once — copy it now):");
      console.log("");
      console.log(`  ${full}`);
      console.log("");
      console.log(`Prefix: ${prefix}`);
      console.log(`Name:   ${opts.name}`);
    });
  });

keys
  .command("list")
  .description("List all API keys")
  .action(async () => {
    await withDb(async ({ db }) => {
      const rows = await db.select().from(apiKeys);
      if (rows.length === 0) {
        console.log("No API keys.");
        return;
      }
      const header = ["PREFIX", "NAME", "CREATED", "STATUS"].join("\t");
      console.log(header);
      for (const row of rows) {
        const created = row.createdAt.toISOString();
        const status = row.revokedAt ? `revoked@${row.revokedAt.toISOString()}` : "active";
        console.log([row.prefix, row.name, created, status].join("\t"));
      }
    });
  });

keys
  .command("revoke")
  .description("Revoke an API key by its 16-char prefix")
  .argument("<prefix>", "first 16 characters of the key")
  .action(async (prefix: string) => {
    await withDb(async ({ db }) => {
      const result = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.prefix, prefix))
        .returning();
      if (result.length === 0) {
        console.error(`No key found with prefix ${prefix}`);
        process.exitCode = 1;
        return;
      }
      console.log(`Revoked ${prefix}`);
    });
  });

function isEntrypoint(): boolean {
  const arg = process.argv[1] ?? "";
  if (!arg) return false;
  return (
    import.meta.url === `file://${arg}` ||
    arg.endsWith("/dist/cli.js") ||
    arg.endsWith("\\dist\\cli.js") ||
    arg.endsWith("src/cli.ts") ||
    arg.endsWith("src\\cli.ts")
  );
}

if (isEntrypoint()) {
  program.parseAsync(process.argv).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { program };
