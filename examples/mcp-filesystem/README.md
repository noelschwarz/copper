# MCP filesystem example

This is the centerpiece example — the one the README GIF is recorded from. It spawns the official [`@modelcontextprotocol/server-filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) MCP server, wraps the MCP Client with Aloy, and makes two tool calls. Every call is captured, redacted, scored, and shipped to a self-hosted Aloy server.

## Prerequisites

- Node 20+
- `npx` (ships with npm)
- An Aloy API server running locally — `docker compose up` from the repo root.

## Run it

From the repo root:

```bash
pnpm install
pnpm --filter aloy build
pnpm --filter @aloy-examples/mcp-filesystem start
```

The first run will pull `@modelcontextprotocol/server-filesystem` via `npx`. Subsequent runs are fast.

## What happens

1. Aloy spins up a bounded-queue transport pointed at `http://localhost:3000`.
2. The MCP filesystem server is spawned over stdio.
3. We wrap the MCP Client with `aloy.watch(client, { adapter: mcpAdapter() })`.
4. Two tool calls run: `list_directory` on the repo root, then `read_text_file` on `README.md`.
5. The wrapper observes each call, scores it, redacts arguments and result, and ships an event.
6. We flush, close, and exit.

## See the events

```bash
curl 'http://localhost:3000/v1/events?project=mcp-filesystem-example' | jq
```

You should see two rows shaped like:

```json
{
  "id": "evt_…",
  "project": "mcp-filesystem-example",
  "agentId": "demo",
  "toolName": "list_directory",
  "args": { "path": "/Users/.../aloy" },
  "riskScore": 10,
  "blocked": false,
  "sdkVersion": "0.1.0"
}
```

## Pointing at a non-default Aloy URL

```bash
ALOY_API_URL=https://your-aloy-host pnpm --filter @aloy-examples/mcp-filesystem start
```
