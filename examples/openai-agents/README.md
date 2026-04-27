# OpenAI Agents example

Demonstrates wrapping an OpenAI-Agents-SDK-shaped tool array with Aloy. The OpenAI Agents API is still evolving — this example uses the stable shape `openaiAgentsAdapter` targets (an object with `invoke(args)` or `execute(args)`), so it stays runnable as the SDK lands changes.

## Prerequisites

- Node 20+
- An Aloy API server running locally — `docker compose up` from the repo root.
- _Optional._ Add `@openai/agents` as a dependency and replace the demo tool with a real one when you're wiring it into your agent.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter aloy build
pnpm --filter @aloy-examples/openai-agents start
```

## What happens

1. We define a single tool (`lookup_user`) with the standard shape — `name`, `description`, `parameters`, `invoke`.
2. We wrap the tools array with `aloy.watch(tools, { adapter: openaiAgentsAdapter() })`.
3. We call `tools[0].invoke(...)` directly to simulate an agent runner. In a real app the runner does this for you.
4. Aloy captures the call, redacts the arguments and result, scores the risk, and ships the event.

The `lookup_user` tool returns a user object containing an email address. Aloy's built-in PII redaction will replace it with `<REDACTED:email>` before the event hits the wire — the original email never leaves the user's process.

## See the events

```bash
curl 'http://localhost:3000/v1/events?project=openai-agents-example' | jq
```

## Pointing at a non-default Aloy URL

```bash
ALOY_API_URL=https://your-aloy-host pnpm --filter @aloy-examples/openai-agents start
```
