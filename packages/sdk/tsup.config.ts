import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "adapters/mcp": "src/adapters/mcp.ts",
    "adapters/vercel-ai": "src/adapters/vercel-ai.ts",
    "adapters/openai-agents": "src/adapters/openai-agents.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "node20",
  external: ["@modelcontextprotocol/sdk", "ai", "@openai/agents"],
});
