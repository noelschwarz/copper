import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { renderToolCall, shouldUseColorForStream } from "../src/render.js";

describe("render", () => {
  it("writes a block without throwing", () => {
    const stream = new PassThrough();
    let buf = "";
    stream.on("data", (c: Buffer) => {
      buf += c.toString();
    });
    renderToolCall({
      stream,
      useColor: false,
      name: "read_file",
      redactedArguments: { path: "/x" },
      riskLabel: "low",
      riskScore: 10,
      durationMs: 5,
      ok: true,
      result: { ok: true },
    });
    expect(buf).toContain("read_file");
    expect(buf).toContain("args:");
    expect(buf).toContain("→");
  });

  it("truncates long payloads", () => {
    const stream = new PassThrough();
    let buf = "";
    stream.on("data", (c: Buffer) => {
      buf += c.toString();
    });
    const long = "z".repeat(300);
    renderToolCall({
      stream,
      useColor: false,
      name: "t",
      redactedArguments: { x: long },
      riskLabel: "high",
      riskScore: 90,
      durationMs: 1,
      ok: false,
      errorMessage: "boom",
    });
    expect(buf.length).toBeLessThan(long.length + 500);
    expect(buf).toContain("...");
    expect(buf).toContain("boom");
  });

  it("detects TTY for stdout only in real TTY", () => {
    const pt = new PassThrough();
    expect(shouldUseColorForStream(pt)).toBe(false);
  });
});
