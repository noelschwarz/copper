/**
 * Adapter tests.
 *
 * Each adapter wraps a specific call shape from a real client / SDK and
 * leaves everything else unchanged. We use small fake objects matching the
 * real shapes so we don't pull peer dependencies into the SDK test suite.
 */

import { describe, expect, it, vi } from "vitest";
import { type McpClientLike, mcpAdapter } from "../src/adapters/mcp.js";
import { type OpenAiAgentTool, openaiAgentsAdapter } from "../src/adapters/openai-agents.js";
import { type VercelAiToolset, vercelAiAdapter } from "../src/adapters/vercel-ai.js";
import { AloyClient } from "../src/client.js";
import type { ToolCallEvent } from "../src/events.js";
import { Transport, type TransportStats } from "../src/transport.js";

class FakeTransport extends Transport {
  readonly events: ToolCallEvent[] = [];
  constructor() {
    super({
      apiUrl: "http://test",
      fetchImpl: vi.fn(async () => new Response(null, { status: 202 })) as unknown as typeof fetch,
      disableShutdownHook: true,
      flushIntervalMs: 60_000,
    });
  }
  override enqueue(e: ToolCallEvent): void {
    this.events.push(e);
  }
  override getStats(): TransportStats {
    return { queued: 0, sent: this.events.length, failed: 0, dropped: 0, retries: 0 };
  }
}

function newClient() {
  const transport = new FakeTransport();
  const client = new AloyClient(
    { apiUrl: "http://test", project: "test", agentId: "agent-1" },
    { transport },
  );
  return { client, transport };
}

interface FakeMcpClient extends McpClientLike {
  listTools?: () => string[];
}

describe("mcpAdapter", () => {
  it("wraps callTool({ name, arguments }) and leaves other methods alone", async () => {
    const { client, transport } = newClient();
    const fakeMcp: FakeMcpClient = {
      async callTool(req) {
        return { content: [{ type: "text", text: `read ${req.name}` }] };
      },
      listTools() {
        return ["a", "b"];
      },
    };
    const observed = client.watch(fakeMcp, { adapter: mcpAdapter<FakeMcpClient>() });
    const result = await observed.callTool({ name: "read_file", arguments: { path: "/tmp/x" } });
    expect(result).toMatchObject({ content: expect.any(Array) });
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.toolName).toBe("read_file");

    // listTools should be the original, not wrapped.
    expect(observed.listTools).toBe(fakeMcp.listTools);
  });

  it("captures errors thrown by the underlying callTool", async () => {
    const { client, transport } = newClient();
    const fakeMcp: McpClientLike = {
      async callTool() {
        throw new Error("tool exploded");
      },
    };
    const observed = client.watch(fakeMcp, { adapter: mcpAdapter() });
    await expect(observed.callTool({ name: "boom" })).rejects.toThrow(/tool exploded/);
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.error).toContain("tool exploded");
  });
});

describe("vercelAiAdapter", () => {
  it("wraps tool.execute for each tool in the toolset", async () => {
    const { client, transport } = newClient();
    const tools: VercelAiToolset = {
      get_weather: {
        description: "Get the weather",
        parameters: { city: "string" },
        async execute(args) {
          return { weather: "sunny", city: args.city };
        },
      },
      tool_without_execute: {
        description: "metadata-only",
      },
    };
    const observed = client.watch(tools, { adapter: vercelAiAdapter() });
    const out = await observed.get_weather?.execute?.({ city: "Berlin" }, {});
    expect(out).toEqual({ weather: "sunny", city: "Berlin" });
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.toolName).toBe("get_weather");

    expect(observed.tool_without_execute).toBe(tools.tool_without_execute);
  });
});

describe("openaiAgentsAdapter", () => {
  it("wraps invoke when present", async () => {
    const { client, transport } = newClient();
    const tools: OpenAiAgentTool[] = [
      {
        name: "lookup_user",
        async invoke(args) {
          return { found: true, args };
        },
      },
    ];
    const wrapped = client.watch(tools, { adapter: openaiAgentsAdapter() });
    const result = await wrapped[0]?.invoke?.({ id: "u_1" });
    expect(result).toMatchObject({ found: true });
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.toolName).toBe("lookup_user");
  });

  it("falls back to execute when invoke is absent", async () => {
    const { client, transport } = newClient();
    const tools: OpenAiAgentTool[] = [
      {
        name: "compute",
        async execute(args) {
          return { ok: true, args };
        },
      },
    ];
    const wrapped = client.watch(tools, { adapter: openaiAgentsAdapter() });
    await wrapped[0]?.execute?.({ x: 1 });
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.toolName).toBe("compute");
  });
});
