/**
 * Transport tests.
 *
 * We provide a custom `fetchImpl` so the transport doesn't try to talk to
 * the real network. The `disableShutdownHook` flag keeps tests from
 * leaking process listeners.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolCallEvent } from "../src/events.js";
import { Transport } from "../src/transport.js";
import { VERSION } from "../src/version.js";

function event(toolName = "noop", overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
  return {
    project: "test",
    agentId: "agent-1",
    toolName,
    args: {},
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    durationMs: 1,
    riskScore: 10,
    blocked: false,
    sdkVersion: VERSION,
    ...overrides,
  };
}

function okFetch(): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify({ ids: [] }), { status: 202 }),
  ) as unknown as typeof fetch;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Transport.flush (happy path)", () => {
  it("ships a single batch and reports stats", async () => {
    const fetchImpl = okFetch();
    const t = new Transport({
      apiUrl: "http://aloy.test",
      flushIntervalMs: 60_000,
      fetchImpl,
      disableShutdownHook: true,
    });
    t.enqueue(event());
    await t.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const stats = t.getStats();
    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.queued).toBe(0);
    await t.close();
  });

  it("attaches Authorization header when an api key is configured", async () => {
    const fetchImpl = okFetch();
    const t = new Transport({
      apiUrl: "http://aloy.test",
      apiKey: "aloy_live_test_key",
      flushIntervalMs: 60_000,
      fetchImpl,
      disableShutdownHook: true,
    });
    t.enqueue(event());
    await t.flush();
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]?.[1];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer aloy_live_test_key",
    );
    await t.close();
  });
});

describe("queue overflow", () => {
  it("drops the oldest event and bumps `dropped`", () => {
    // Use a tiny queue with no flushing so we can observe overflow directly.
    const t = new Transport({
      apiUrl: "http://aloy.test",
      queueSize: 3,
      batchSize: 999, // never auto-flush by size
      flushIntervalMs: 60_000,
      fetchImpl: okFetch(),
      disableShutdownHook: true,
    });
    for (let i = 0; i < 7; i++) t.enqueue(event(`tool-${i}`));
    const stats = t.getStats();
    expect(stats.queued).toBe(3);
    expect(stats.dropped).toBe(4);
    void t.close();
  });
});

describe("retry behavior", () => {
  it("retries on 500 up to maxRetries then drops", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("boom", { status: 500 }),
    ) as unknown as typeof fetch;
    const t = new Transport({
      apiUrl: "http://aloy.test",
      flushIntervalMs: 60_000,
      maxRetries: 3,
      retryDelaysMs: [0, 0, 0],
      fetchImpl,
      disableShutdownHook: true,
    });
    t.enqueue(event());
    await t.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(t.getStats().failed).toBe(1);
    expect(t.getStats().sent).toBe(0);
    await t.close();
  });

  it("does NOT retry 4xx (non-429) responses", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("bad", { status: 400 }),
    ) as unknown as typeof fetch;
    const t = new Transport({
      apiUrl: "http://aloy.test",
      flushIntervalMs: 60_000,
      maxRetries: 3,
      retryDelaysMs: [0, 0, 0],
      fetchImpl,
      disableShutdownHook: true,
    });
    t.enqueue(event());
    await t.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(t.getStats().failed).toBe(1);
    await t.close();
  });

  it("retries network errors then succeeds", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new TypeError("simulated network error");
      return new Response(JSON.stringify({ ids: [] }), { status: 202 });
    }) as unknown as typeof fetch;
    const t = new Transport({
      apiUrl: "http://aloy.test",
      flushIntervalMs: 60_000,
      maxRetries: 3,
      retryDelaysMs: [0, 0, 0],
      fetchImpl,
      disableShutdownHook: true,
    });
    t.enqueue(event());
    await t.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(t.getStats().sent).toBe(1);
    await t.close();
  });
});

describe("batch size triggers flush", () => {
  it("flushes once the queue hits batchSize", async () => {
    const fetchImpl = okFetch();
    const t = new Transport({
      apiUrl: "http://aloy.test",
      batchSize: 3,
      flushIntervalMs: 60_000,
      fetchImpl,
      disableShutdownHook: true,
    });
    for (let i = 0; i < 3; i++) t.enqueue(event(`tool-${i}`));
    // give microtasks a chance to run
    await new Promise((r) => setImmediate(r));
    expect(fetchImpl).toHaveBeenCalled();
    await t.close();
  });
});

describe("never throws on close or flush", () => {
  it("close() never rejects even when flushes have failed", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    const t = new Transport({
      apiUrl: "http://aloy.test",
      flushIntervalMs: 60_000,
      maxRetries: 2,
      retryDelaysMs: [0, 0],
      fetchImpl,
      disableShutdownHook: true,
    });
    t.enqueue(event());
    await expect(t.close()).resolves.toBeUndefined();
  });
});
