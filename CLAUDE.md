# Working in the Aloy repo (notes for AI coding assistants)

This file is for any AI coding assistant working in the Aloy repository. Read it before proposing changes.

## License split — most important

This repo is **dual-licensed**. The split is non-negotiable, and getting it wrong forces a relicense and a release rollback:

- Repository root, `apps/`, server code, examples, CI: **AGPL-3.0**.
- `packages/sdk/`: **MIT**. The SDK is what developers import into their (possibly proprietary) code, so it has to be permissive.

Hard rules:

- Code in `packages/sdk/` must NEVER import from `apps/` or any AGPL module in this repo.
- Code in `apps/` may import the SDK's Zod schemas and types (for request validation), but must NOT copy MIT-only utilities and treat them as AGPL.
- If a utility is genuinely shared, vendor a small copy on each side rather than cross-importing. Duplication is accepted.
- If you are unsure which side a new file belongs on, **stop and ask**.

## Hard runtime rules for the SDK

The SDK is imported into other people's agent loops. We have one job: don't break their app.

1. **Never throw from observation.** Every code path that runs inside a user's tool call must be wrapped so that exceptions in our redaction, scoring, or transport code can never propagate to the caller. The single exception is `PolicyViolationError`, which is intentional and thrown *before* the underlying call executes.
2. **Redact before transport.** Secrets and PII must be scrubbed in-process *before* any event leaves the user's machine.
3. **Drop, don't wait.** The shipper queue is bounded (default 1000). On overflow we drop the oldest event and bump a counter. We do not back-pressure the caller.
4. **No blocking.** No synchronous network calls, no `fs` blocking calls, no long compute on the call path. Use the bounded queue + background flusher.

## Repo layout

```
apps/api/           # Hono + Drizzle server (AGPL)
packages/sdk/       # `aloy` npm package (MIT)
examples/           # runnable demos (AGPL)
.github/            # CI + issue templates
docker-compose.yaml # one-command self-host
```

## How the pieces relate

- **Zod schemas live in the SDK** (`packages/sdk/src/events.ts`). The server imports them via the workspace alias `aloy` to validate incoming requests with `@hono/zod-validator`. This keeps the wire contract source-of-truth in one place.
- **Drizzle** owns the database schema (`apps/api/src/db/schema.ts`) and migrations (`apps/api/migrations/`). Generate with `pnpm --filter @aloy/api db:generate`.
- **Hono routes** are thin glue: validate via Zod, call Drizzle, return JSON.

## Tests

- SDK tests: `packages/sdk/tests/`. Run with `pnpm --filter aloy test`.
- API tests: `apps/api/tests/`. Run with `pnpm --filter @aloy/api test`. Postgres is provided by `@testcontainers/postgresql`; you need Docker running locally.
- Integration test: `apps/api/tests/integration.test.ts` — boots the API in-process with a Postgres testcontainer and fires an event end-to-end through the SDK.

## Style

- Format and lint with `pnpm lint` (Biome). Run `pnpm format` to auto-fix.
- Strict TypeScript everywhere. ESM only. Node 20+.
- No new dependencies in `packages/sdk/` without a strong reason — the SDK aims for zero non-essential deps. Native `fetch` only.

## When in doubt

If a design decision isn't covered by the spec, this file, or the README, **stop and ask** before inventing.
