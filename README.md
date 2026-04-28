# Copper

**See what your AI agent is actually doing. One line, zero infra.**

`tail -f` for MCP tool calls: wrap your client, watch each `callTool` hit the terminal in real time, with redaction and simple risk hints. No server, no database, no dashboard.

<!-- Replace with a short screen recording or GIF once you capture `npx copper demo`. -->
![Demo still](./docs/demo-screenshot.png)

## Quickstart (about 30 seconds)

```bash
npx copper demo
```

You should see a short sequence of fake tool calls with redacted arguments and risk labels. That is the product surface.

Install as a dependency when you wire it into your own MCP client:

```bash
npm install copper
```

```ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { watch } from "copper";

const client = watch(new Client(/* … */));
await client.callTool({ name: "read_file", arguments: { path: "./README.md" } });
```

## What this is not

- Not an LLM tracing product: prompts and completions never pass through here.
- Not a hosted service: nothing listens on a port for you.
- Not a policy engine: risky calls are flagged in the log, not blocked.

## Repository layout

Source lives at the repo root in `src/`. Public API is `watch()` plus types; `redact` and `risk` are exported if you want to reuse them. Tests live in `tests/`. Run `npm test` and `npm run build` before publishing.

## Example: real filesystem MCP

See [`examples/mcp-filesystem.ts`](./examples/mcp-filesystem.ts). Run `npm run example:fs` from a clone (you need the SDK and the filesystem server available on your machine).

## Contributing

Issues and small PRs are welcome. If you have a redaction pattern or tool-name heuristic that belongs in the defaults, that is a good first change.

## License

MIT. See [LICENSE](./LICENSE).
