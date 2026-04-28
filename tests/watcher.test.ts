import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import type { ToolCallEvent } from "../src/types.js";
import { watch } from "../src/watcher.js";

function createClient(handler?: (name: string) => unknown) {
  return {
    async callTool(params: {
      name: string;
      arguments?: Record<string, unknown>;
    }) {
      if (handler) return handler(params.name);
      return { content: [] };
    },
  };
}

describe("watch", () => {
  it("records redacted args and risk for each call", async () => {
    const events: ToolCallEvent[] = [];
    const client = createClient();
    const wrapped = watch(client, {
      onToolCall: (e) => events.push(e),
      stream: new PassThrough(),
    });

    await wrapped.callTool({
      name: "read_file",
      arguments: { path: "/x", secret: "sk-1234567890abcdefghijklmnop" },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("read_file");
    expect(JSON.stringify(events[0]?.redactedArguments)).not.toContain(
      "sk-1234",
    );
    expect(events[0]?.risk.label).toBe("low");
    expect(events[0]?.ok).toBe(true);
  });

  it("propagates errors from the underlying client", async () => {
    const client = {
      async callTool(_params: {
        name: string;
        arguments?: Record<string, unknown>;
      }) {
        throw new Error("nope");
      },
    };
    const wrapped = watch(client, {
      stream: new PassThrough(),
    });
    await expect(
      wrapped.callTool({ name: "x", arguments: {} }),
    ).rejects.toThrow("nope");
  });

  it("returns the underlying result unchanged", async () => {
    const client = {
      async callTool(_params: {
        name: string;
        arguments?: Record<string, unknown>;
      }) {
        return { content: [{ type: "text", text: "hello" }] };
      },
    };
    const wrapped = watch(client, {
      stream: new PassThrough(),
    });
    const r = await wrapped.callTool({ name: "read_file", arguments: {} });
    expect(r).toEqual({ content: [{ type: "text", text: "hello" }] });
  });

  it("uses custom redact and risk when provided", async () => {
    const events: ToolCallEvent[] = [];
    const client = createClient();
    const wrapped = watch(client, {
      onToolCall: (e) => events.push(e),
      stream: new PassThrough(),
      redact: (v) => v,
      risk: () => ({ score: 100, label: "high" }),
    });
    await wrapped.callTool({ name: "read_file", arguments: { a: 1 } });
    expect(events[0]?.risk.score).toBe(100);
    expect(events[0]?.redactedArguments).toEqual({ a: 1 });
  });
});
