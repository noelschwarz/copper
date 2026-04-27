/**
 * Aloy + MCP filesystem server demo.
 *
 * Spawns the official `@modelcontextprotocol/server-filesystem` MCP server
 * over stdio, wraps the MCP Client with `aloy.watch(...)` + `mcpAdapter()`,
 * and runs two tool calls. Every call is captured, redacted, scored, and
 * shipped to the Aloy server you point at via `ALOY_API_URL`
 * (defaults to `http://localhost:3000`).
 *
 * This is the script the README GIF is recorded from.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AloyClient, watchMcp } from "aloy";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

async function main(): Promise<void> {
  const aloy = new AloyClient({
    apiUrl: process.env.ALOY_API_URL ?? "http://localhost:3000",
    project: "mcp-filesystem-example",
    agentId: "demo",
  });

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", repoRoot],
  });

  const mcp = new Client({ name: "aloy-mcp-example", version: "0.0.1" }, { capabilities: {} });
  await mcp.connect(transport);

  const observed = watchMcp(mcp, aloy);

  const dir = await observed.callTool({
    name: "list_directory",
    arguments: { path: repoRoot },
  });
  console.log("[list_directory]", JSON.stringify(dir, null, 2).slice(0, 200), "...");

  const file = await observed.callTool({
    name: "read_text_file",
    arguments: { path: path.join(repoRoot, "README.md") },
  });
  console.log("[read_text_file] first 200 chars:");
  console.log(JSON.stringify(file).slice(0, 200), "...");

  await aloy.flush();
  await aloy.close();
  await mcp.close();
  console.log(
    "\nDone. Query the events:\n  curl 'http://localhost:3000/v1/events?project=mcp-filesystem-example'",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
