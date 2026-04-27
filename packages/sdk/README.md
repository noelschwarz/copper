# aloy

[![npm](https://img.shields.io/npm/v/aloy?label=aloy&color=181717)](https://www.npmjs.com/package/aloy)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

The npm package for [Aloy](https://github.com/noelschwarz/aloy) — the safety-first, MCP-native observability layer for AI agent tool calls. Wrap one line, and every tool call your agent makes is captured, scrubbed of secrets, scored for risk, and shipped asynchronously to a self-hosted Aloy server.

> **Licensing note.** This package is **MIT-licensed** even though the rest of the Aloy repository is **AGPL-3.0**. The SDK is the part you import into your (possibly proprietary) code, so it has to be permissive. See [`LICENSE`](LICENSE) and [the repo's CLAUDE.md](https://github.com/noelschwarz/aloy/blob/main/CLAUDE.md) for the contributor rules around cross-package imports.

## Install

```bash
npm install aloy
# or pnpm add aloy / yarn add aloy / bun add aloy
```

The SDK has exactly two runtime dependencies: `zod` (request/response schemas) and the platform's native `fetch`. Adapter peer deps (`@modelcontextprotocol/sdk`, `ai`, `@openai/agents`) are optional and only needed if you import the matching adapter.

## Quickstart — MCP

```ts
import { AloyClient, watchMcp } from "aloy";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const aloy = new AloyClient({
  apiUrl: "http://localhost:3000",
  project: "my-app",
  agentId: "agent-1",
});

const transport = new StdioClientTransport(/* ... */);
const mcp = new Client({ name: "demo", version: "0.0.1" }, { capabilities: {} });
await mcp.connect(transport);

const observed = watchMcp(mcp, aloy);

await observed.callTool({
  name: "read_file",
  arguments: { path: "./README.md" },
});
//          ^ captured, redacted, scored, shipped — your code path is unchanged.

await aloy.close();
```

## Quickstart — Vercel AI SDK

```ts
import { AloyClient, watchVercelAi } from "aloy";
import { generateText, tool } from "ai";
import { z } from "zod";

const aloy = new AloyClient({ apiUrl: "http://localhost:3000" });

const tools = watchVercelAi(
  {
    get_weather: tool({
      description: "Look up weather for a city",
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => ({ city, weather: "sunny" }),
    }),
  },
  aloy,
);

await generateText({
  model: /* ... */,
  tools,
  prompt: "What's the weather in Berlin?",
});
```

## Quickstart — OpenAI Agents

```ts
import { AloyClient, watchOpenAiAgents } from "aloy";

const aloy = new AloyClient({ apiUrl: "http://localhost:3000" });

const tools = watchOpenAiAgents(
  [
    {
      name: "lookup_user",
      description: "Look up a user by id",
      async invoke(args) {
        return { found: true, args };
      },
    },
  ],
  aloy,
);
```

> The `watchMcp` / `watchVercelAi` / `watchOpenAiAgents` helpers are thin
> wrappers around `aloy.watch(target, { adapter: …Adapter() })` that
> preserve the input's TypeScript type. Use the lower-level form when you
> need to share a custom adapter or compose adapters yourself.

## Configuration

Every option has a sensible default. The SDK works against a local Aloy server with zero config:

```ts
const aloy = new AloyClient(); // reads ALOY_* env vars; falls back to http://localhost:3000
```

Or build it from env explicitly:

```ts
import { AloyClient } from "aloy";

const aloy = AloyClient.fromEnv({ project: "my-app" });
```

| Option / env var                                  | Default                  | Description                                                                                                                  |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `apiUrl` / `ALOY_API_URL`                         | `http://localhost:3000`  | Base URL of the Aloy server.                                                                                                  |
| `apiKey` / `ALOY_API_KEY`                         | _none_                   | Set when the server has `USE_DB_AUTHENTICATION=true`.                                                                         |
| `project` / `ALOY_PROJECT`                        | `default`                | Logical grouping. Used as a query filter on `GET /v1/events`.                                                                 |
| `agentId` / `ALOY_AGENT_ID`                       | `default`                | Identifier for the specific agent instance.                                                                                   |
| `queueSize` / `ALOY_QUEUE_SIZE`                   | `1000`                   | Hard cap on in-memory queued events. Drop-oldest on overflow.                                                                 |
| `batchSize` / `ALOY_BATCH_SIZE`                   | `50`                     | Force-flush threshold.                                                                                                        |
| `flushIntervalMs` / `ALOY_FLUSH_INTERVAL_MS`      | `1000`                   | Background flush interval.                                                                                                    |
| `maxRetries` / `ALOY_MAX_RETRIES`                 | `3`                      | Retries with `250ms / 1s / 4s` backoff. After that we drop and warn.                                                          |
| `blockThreshold` / `ALOY_BLOCK_THRESHOLD`         | `101` (effectively off)  | Tool calls with `riskScore >= blockThreshold` throw `PolicyViolationError` *before* the underlying call runs. Set to e.g. 80. |
| `enabled` / `ALOY_ENABLED`                        | `true`                   | Set `false` to disable observation entirely. The wrap is still safe to call.                                                  |
| `redaction.extraPatterns`                         | `[]`                     | User-supplied `[{ label, pattern }]` rules. Applied *before* the built-ins.                                                   |
| `networkAllowlist`                                | `[]`                     | Domains that don't bump risk on network-shaped tool names.                                                                    |

## What gets redacted

In-process, before any event is shipped:

- API-key shapes — `sk-…`, `sk_live_…`, `aloy_…`, `xoxb-…`, AWS access keys (`AKIA…`/`ASIA…`), GitHub PATs (`ghp_…`, `gho_…`, `ghs_…`).
- Generic ≥32-char base64-ish tokens with Shannon entropy ≥ 3.5.
- Email addresses, phone numbers (E.164 + common US formats), SSNs, IBANs, Luhn-validated credit-card numbers.

Each match is replaced with `<REDACTED:label>`. The redactor is best-effort — supply your own regexes via `redaction.extraPatterns` if you have shapes specific to your stack.

## Risk scoring (v0.1)

A heuristic 0–100 score per call:

- **90+** — subprocess / shell execution.
- **80+** — SQL containing `DROP` / `DELETE` / `TRUNCATE` / `ALTER`.
- **70+** — filesystem writes outside the project root, secrets-adjacent tool names (`get_secret`, `read_env`, `kms_*`).
- **60+** — network calls to non-allowlisted domains.
- **10** — everything else.

Pass `riskScorer` via config to override per-project. The full table is documented in [`risk.ts`](src/risk.ts).

## Failure modes

The SDK is built to never break your code:

- Transport errors are caught and logged at most once per minute.
- Redactor / scorer errors are caught silently.
- Queue overflows drop the *oldest* event and bump `client.stats().dropped`.
- The single intentional throw is `PolicyViolationError`, raised *before* the underlying call executes when `riskScore >= blockThreshold`.

```ts
import { PolicyViolationError } from "aloy";

try {
  await observed.callTool({ name: "rm_rf", arguments: { path: "/" } });
} catch (err) {
  if (err instanceof PolicyViolationError) {
    console.warn(`blocked: ${err.details.toolName} scored ${err.details.riskScore}`);
  } else {
    throw err;
  }
}
```

## Self-hosting

Run the Aloy server locally:

```bash
git clone https://github.com/noelschwarz/aloy.git
cd aloy
docker compose up
```

Then point the SDK at it:

```ts
const aloy = new AloyClient({ apiUrl: "http://localhost:3000" });
```

See [`SELF_HOST.md`](https://github.com/noelschwarz/aloy/blob/main/SELF_HOST.md) for the full guide.

## License

MIT. See [`LICENSE`](LICENSE).
