<div align="center">

# Aloy

**See and govern what your agent does.**
Wrap one line, get every tool call traced, scored, and self-hosted in 60 seconds.

[![npm](https://img.shields.io/npm/v/aloy?label=aloy&color=181717)](https://www.npmjs.com/package/aloy)
[![License: AGPL-3.0](https://img.shields.io/badge/server-AGPL--3.0-blue.svg)](LICENSE)
[![License: MIT](https://img.shields.io/badge/SDK-MIT-green.svg)](packages/sdk/LICENSE)
[![CI](https://github.com/noelschwarz/aloy/actions/workflows/ci.yml/badge.svg)](https://github.com/noelschwarz/aloy/actions/workflows/ci.yml)

</div>

> _GIF placeholder — drop a 30-second screen capture here showing the MCP-filesystem example and the live event stream in the API._

Aloy is the **safety-first, MCP-native observability layer for AI agent tool calls**. Wrap your agent's tool-calling client with `aloy.watch(...)`. Every tool call is captured, scored for risk, scrubbed of PII and secrets, and shipped asynchronously to a self-hostable Aloy server. Risky calls can be blocked by policy *before* they execute.

```ts
import { AloyClient, watchMcp } from "aloy";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const aloy = new AloyClient({ apiUrl: "http://localhost:3000" });

const mcp = new Client(/* ... */);
const observed = watchMcp(mcp, aloy);

await observed.callTool({ name: "read_file", arguments: { path: "/tmp/x" } });
//          ^ captured, redacted, scored, shipped — your code path is unchanged.
```

## Why Aloy is not Langfuse

[Langfuse](https://github.com/langfuse/langfuse) is the canonical open-source LLM observability platform, and a great one. Aloy is not trying to be Langfuse, and you should probably run both:

|                          | **Langfuse**                       | **Aloy**                              |
| ------------------------ | ---------------------------------- | ------------------------------------- |
| What it instruments      | LLM calls, prompts, completions    | **Tool calls** — what agents *do*     |
| Primary use case         | Trace, evaluate, debug LLM quality | Observe and **govern** side effects   |
| Action on dangerous calls| View after the fact                | Score and **block before they run**   |
| Self-host stack          | Postgres + ClickHouse + workers    | **Postgres + one Hono service**       |

If you want to know what your model said, use Langfuse. If you want to know what your model **did** — and stop it from doing the wrong thing — use Aloy.

## What Aloy isn't

- Not an LLM-tracing tool. (That's Langfuse.)
- Not an evaluations platform. (That's [Braintrust](https://www.braintrust.dev/), [Maxim](https://www.getmaxim.ai/).)
- Not an AI gateway. (That's [Portkey](https://portkey.ai/), [Helicone](https://www.helicone.ai/).)
- Not a general AI APM. (That's Datadog, Arize.)

Aloy sits next to those tools. It looks at one specific thing — the side effects your agent produces — and it does that one thing well.

## Self-host in 60 seconds

```bash
git clone https://github.com/noelschwarz/aloy.git
cd aloy
docker compose up
```

That's it. Postgres + the API are now listening on `:3000`. See [SELF_HOST.md](SELF_HOST.md) for the full guide.

## Install the SDK

```bash
npm install aloy
# or pnpm add aloy / yarn add aloy / bun add aloy
```

Quickstart for each supported runtime is in [`packages/sdk/README.md`](packages/sdk/README.md):

- [`mcpAdapter`](packages/sdk/src/adapters/mcp.ts) — `@modelcontextprotocol/sdk` clients
- [`vercelAiAdapter`](packages/sdk/src/adapters/vercel-ai.ts) — `tool({ ..., execute })` from `ai`
- [`openaiAgentsAdapter`](packages/sdk/src/adapters/openai-agents.ts) — `@openai/agents` tool decorators

## What you get out of the box

- **Per-call risk scoring.** Subprocess execution, filesystem writes outside the project dir, destructive SQL, secrets-adjacent tool names, and non-allowlisted network calls all bump the score. Set `ALOY_BLOCK_THRESHOLD=80` and Aloy will throw `PolicyViolationError` *before* a high-risk call runs.
- **Built-in redaction.** OpenAI / Aloy / Slack / GitHub / AWS keys, generic high-entropy ≥32-char tokens, emails, phones, SSNs, IBANs, and Luhn-validated credit-card numbers are scrubbed *in-process* before any event leaves your machine.
- **Bounded, drop-on-overflow transport.** Up to 1000 events queued; `setInterval`-based batch flusher (1s or 50 events). Network errors retry with exponential backoff (250ms / 1s / 4s) and never throw into your code.
- **One service, two binaries.** A Hono API and a `aloy-admin` CLI for key management. Postgres-only — no ClickHouse, no separate ingestion daemon.

## Roadmap

v0.1 ships the SDK, the API, the three adapters, and a self-host story. The next sprints are:

- A web dashboard. (v0.1 ships an API; events are queryable via `GET /v1/events`.)
- A real policy engine. (v0.1 has a single `blockThreshold`. v0.2 adds rules, allowlists, per-project policies.)
- Slack/webhook alerting on high-risk calls.
- A Python SDK once we have signal.
- An OTEL exporter once we have signal.

## License

Dual licensed and there's a reason:

- **Repository root, server, dashboard, examples, CI: [AGPL-3.0](LICENSE).**
- **`packages/sdk/`: [MIT](packages/sdk/LICENSE).** The SDK is what you import into your (possibly proprietary) code, so it has to be permissive.

This is the same split Sentry, PostHog, Supabase, and Langfuse use. See [`CLAUDE.md`](CLAUDE.md) for the cross-contamination rules contributors must follow.

## Contributing & Security

- Found a bug or want a feature? Open an issue. See [`CONTRIBUTING.md`](CONTRIBUTING.md) before sending a non-trivial PR.
- Security issues go to **noel@aloy.dev**. See [`SECURITY.md`](SECURITY.md).
- Be kind. See [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
