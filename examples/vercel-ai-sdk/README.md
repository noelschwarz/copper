# Vercel AI SDK example

Wraps a Vercel-AI-SDK toolset with Aloy so every tool execution is captured, scored, and redacted before shipping.

## Prerequisites

- Node 20+
- `OPENAI_API_KEY` in your environment.
- An Aloy API server running locally — `docker compose up` from the repo root.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter aloy build
OPENAI_API_KEY=sk-... pnpm --filter @aloy-examples/vercel-ai-sdk start
```

## What happens

1. We define one Vercel-AI tool (`get_weather`) and pass the toolset through `aloy.watch(..., { adapter: vercelAiAdapter() })`.
2. The model is asked about the weather in SF.
3. When the model calls `get_weather`, the wrapper runs first: redact args → score risk → run the original `execute` → redact result → ship an event.
4. The model's natural-language response is printed.

## See the events

```bash
curl 'http://localhost:3000/v1/events?project=vercel-ai-example' | jq
```

## Pointing at a non-default Aloy URL

```bash
ALOY_API_URL=https://your-aloy-host \
  OPENAI_API_KEY=sk-... \
  pnpm --filter @aloy-examples/vercel-ai-sdk start
```
