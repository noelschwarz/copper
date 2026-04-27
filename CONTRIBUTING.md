# Contributing to Aloy

Thanks for considering a contribution. Aloy is small enough that a fast review loop matters more than process — please open an issue describing what you want to do before starting on a non-trivial PR.

## What you'll need

- Node 20+ (LTS).
- pnpm 9 (the repo pins it via `packageManager`; running `corepack enable` is enough).
- Docker, only for the API and integration tests — they spin up a real Postgres 15 via `@testcontainers/postgresql`.

## Setup

```bash
git clone https://github.com/noelschwarz/aloy.git
cd aloy
pnpm install
pnpm --filter aloy build       # the SDK is consumed by the API tests
```

## Running tests

| What                  | Command                                  | Requires Docker |
| --------------------- | ---------------------------------------- | :-------------: |
| SDK unit tests        | `pnpm --filter aloy test`                |                 |
| API + integration     | `pnpm --filter @aloy/api test`           |  ✓              |
| Everything            | `pnpm test`                              |  ✓              |
| Lint + format check   | `pnpm lint`                              |                 |
| Auto-format           | `pnpm format`                            |                 |
| Typecheck             | `pnpm typecheck`                         |                 |

The SDK suite is in [`packages/sdk/tests/`](packages/sdk/tests/). The API suite (including the end-to-end integration test) lives in [`apps/api/tests/`](apps/api/tests/).

## License split — please read this

This repo is **dual-licensed** and the split is non-negotiable:

- Repository root, `apps/`, server, examples, CI: **AGPL-3.0**.
- `packages/sdk/`: **MIT**.

Hard rules for contributors:

1. Code in `packages/sdk/` must NEVER import from `apps/` or any AGPL module in this repo. The SDK is what users embed in their (possibly proprietary) software, and silent contamination would force a relicense.
2. `apps/` may import the SDK's Zod schemas and TypeScript types (they describe the wire contract), but must NOT copy MIT-only utilities and treat them as AGPL.
3. If a utility is genuinely shared, vendor a separate copy on each side under each side's license. Duplication is fine.
4. If you're unsure which side a new file belongs on, **stop and ask** in the issue.

[`CLAUDE.md`](CLAUDE.md) has the full version of this for AI coding assistants; it's a useful contributor reference too.

## Code style

- Strict TypeScript (`tsconfig.base.json` is the source of truth).
- Format and lint with [Biome](https://biomejs.dev/) — `pnpm lint` and `pnpm format`. CI runs `biome check`.
- Single source of truth for the wire schema is [`packages/sdk/src/events.ts`](packages/sdk/src/events.ts) — both the SDK and the server import it.

## Commits and PRs

- Conventional commits are nice but not required.
- Keep PRs small. One change per PR is easier to review than a big one.
- DCO-sign your commits (`git commit -s`) — we will require this once the project gains traction; doing it now saves us a churn later.
- For SDK changes that affect the wire format or public API surface, please add or update the relevant test in `packages/sdk/tests/`.

## SDK design constraints

Two invariants must hold in the SDK at all times:

1. **Never block the user's event loop.** The SDK uses native `fetch` and a bounded queue + `setInterval` flusher. No `axios`, no synchronous I/O on the call path.
2. **Never throw from observation.** The single intentional throw is `PolicyViolationError`, fired *before* the underlying call executes when a tool exceeds the configured risk threshold. Everything else is caught at the boundary.

If a PR can violate either, it will be sent back with notes.

## Security

Security issues do **not** belong in public issues. See [`SECURITY.md`](SECURITY.md). Reports go to **noel@aloy.dev**.
