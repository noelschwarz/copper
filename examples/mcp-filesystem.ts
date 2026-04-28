/**
 * Example: wrap an MCP `Client` with `watch()` so every `callTool` is logged.
 *
 * From the repo root (requires `@modelcontextprotocol/sdk` and a local MCP server):
 *
 *   npm run example:fs
 *
 * This uses `tsx` to load TypeScript directly. In your own app, import `watch`
 * from the published `copper` package instead of `../src/index.js`.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { watch } from "../src/index.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
  });

  const raw = new Client({ name: "copper-example", version: "0.0.0" });
  const client = watch(raw);

  await client.connect(transport);
  // Every callTool from here on prints to stdout with redaction + risk hints.
  await client.callTool({
    name: "list_directory",
    arguments: { path: "/tmp" },
  });
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
