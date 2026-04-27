/**
 * Tests for `AloyClient.watch()` and the default Proxy wrapper.
 *
 * Invariants exercised here:
 *   - Sync calls and async calls both flow through observation.
 *   - User errors propagate untouched.
 *   - `PolicyViolationError` short-circuits the call (target never runs).
 *   - Observation failures (transport explosion) never leak.
 *   - Non-callable attribute access passes straight through.
 */

import { describe, expect, it, vi } from "vitest";
import { AloyClient } from "../src/client.js";
import { PolicyViolationError } from "../src/errors.js";
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
  override enqueue(event: ToolCallEvent): void {
    this.events.push(event);
  }
  override getStats(): TransportStats {
    return { queued: 0, sent: this.events.length, failed: 0, dropped: 0, retries: 0 };
  }
}

class ExplodingTransport extends Transport {
  constructor() {
    super({
      apiUrl: "http://test",
      fetchImpl: vi.fn() as unknown as typeof fetch,
      disableShutdownHook: true,
      flushIntervalMs: 60_000,
    });
  }
  override enqueue(): void {
    throw new Error("transport on fire");
  }
  override async flush(): Promise<void> {
    throw new Error("flush on fire");
  }
  override async close(): Promise<void> {
    throw new Error("close on fire");
  }
  override getStats(): TransportStats {
    throw new Error("stats on fire");
  }
}

class _SyncTool {
  constant = "hello";
  add(a: number, b: number): number {
    return a + b;
  }
  boom(): void {
    throw new Error("user said no");
  }
}

class _AsyncTool {
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ name: string; args: Record<string, unknown>; ok: true }> {
    await Promise.resolve();
    return { name, args, ok: true };
  }
  async fail(): Promise<void> {
    await Promise.resolve();
    throw new TypeError("async user error");
  }
}

function makeClient() {
  const transport = new FakeTransport();
  const client = new AloyClient(
    { apiUrl: "http://test", project: "test", agentId: "agent-1" },
    { transport },
  );
  return { client, transport };
}

describe("sync path", () => {
  it("returns the underlying value and captures one event", () => {
    const { client, transport } = makeClient();
    const tool = client.watch(new _SyncTool());
    expect(tool.add(2, 3)).toBe(5);
    expect(transport.events).toHaveLength(1);
    const evt = transport.events[0];
    expect(evt?.toolName).toBe("add");
    expect(evt?.error).toBeNull();
    expect(evt?.sdkVersion).toBeTruthy();
    expect(evt?.project).toBe("test");
    expect(evt?.blocked).toBe(false);
  });

  it("propagates user exceptions while still capturing the event", () => {
    const { client, transport } = makeClient();
    const tool = client.watch(new _SyncTool());
    expect(() => tool.boom()).toThrow(/user said no/);
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.error).toContain("user said no");
  });

  it("passes non-callable attributes through unchanged", () => {
    const { client, transport } = makeClient();
    const tool = client.watch(new _SyncTool());
    expect(tool.constant).toBe("hello");
    expect(transport.events).toHaveLength(0);
  });
});

describe("async path", () => {
  it("awaits the underlying call and captures the event", async () => {
    const { client, transport } = makeClient();
    const tool = client.watch(new _AsyncTool());
    const out = await tool.callTool("read_file", { path: "/tmp/x" });
    expect(out).toEqual({ name: "read_file", args: { path: "/tmp/x" }, ok: true });
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.toolName).toBe("callTool");
  });

  it("propagates async user errors and still captures the event", async () => {
    const { client, transport } = makeClient();
    const tool = client.watch(new _AsyncTool());
    await expect(tool.fail()).rejects.toThrow(/async user error/);
    expect(transport.events).toHaveLength(1);
    expect(transport.events[0]?.error).toContain("async user error");
  });
});

describe("policy blocking", () => {
  it("throws PolicyViolationError BEFORE invoking the underlying tool", () => {
    const { client, transport } = makeClient();
    // Force every tool call to score 100 with a custom adapter / direct observe call.
    // The cleanest way is to set blockThreshold low and use a known-high tool name.
    const armed = new AloyClient(
      { apiUrl: "http://test", project: "test", agentId: "agent-1", blockThreshold: 90 },
      { transport: transport },
    );
    let invoked = false;
    const dangerous = {
      shell_exec(_cmd: string) {
        invoked = true;
        return "should not happen";
      },
    };
    const observed = armed.watch(dangerous);
    expect(() => observed.shell_exec("rm -rf /")).toThrow(PolicyViolationError);
    expect(invoked).toBe(false);
    // We still ship one event with `blocked: true`.
    const blocked = transport.events.find((e) => e.blocked);
    expect(blocked).toBeTruthy();
    expect(blocked?.toolName).toBe("shell_exec");
  });
});

describe("never-leak invariants", () => {
  it("does not let transport explosion break sync calls", () => {
    const client = new AloyClient(
      { apiUrl: "http://test" },
      { transport: new ExplodingTransport() },
    );
    const tool = client.watch(new _SyncTool());
    expect(tool.add(1, 1)).toBe(2);
  });

  it("does not let transport explosion break async calls", async () => {
    const client = new AloyClient(
      { apiUrl: "http://test" },
      { transport: new ExplodingTransport() },
    );
    const tool = client.watch(new _AsyncTool());
    await expect(tool.callTool("x", {})).resolves.toMatchObject({ ok: true });
  });

  it("disabled clients ship nothing", () => {
    const transport = new FakeTransport();
    const client = new AloyClient({ apiUrl: "http://test", enabled: false }, { transport });
    const tool = client.watch(new _SyncTool());
    expect(tool.add(1, 2)).toBe(3);
    expect(transport.events).toHaveLength(0);
  });
});

describe("redaction integration", () => {
  it("strips secrets from args before they hit the transport", () => {
    const { client, transport } = makeClient();
    const echo = {
      echo(payload: { key: string; email: string }): { key: string; email: string } {
        return payload;
      },
    };
    const observed = client.watch(echo);
    observed.echo({ key: "AKIAIOSFODNN7EXAMPLE", email: "noel@aloy.dev" });
    expect(transport.events).toHaveLength(1);
    const flat = JSON.stringify(transport.events[0]);
    expect(flat).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(flat).not.toContain("noel@aloy.dev");
  });
});
