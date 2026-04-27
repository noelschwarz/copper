import path from "node:path";
import { describe, expect, it } from "vitest";
import { scoreEvent } from "../src/risk.js";

describe("subprocess scoring", () => {
  it("scores subprocess_run very high", () => {
    expect(scoreEvent("subprocess_run", { cmd: "ls" })).toBeGreaterThanOrEqual(90);
  });
  it("scores shell_exec very high", () => {
    expect(scoreEvent("shell_exec", { cmd: "rm -rf /" })).toBeGreaterThanOrEqual(90);
  });
});

describe("filesystem scoring", () => {
  it("scores fs writes outside the project root high", () => {
    const score = scoreEvent(
      "write_file",
      { path: "/tmp/aloy_outside.txt" },
      { projectRoot: "/usr/local/some-aloy-project" },
    );
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("scores fs writes inside the project root moderately", () => {
    const root = path.resolve("/tmp/aloy_test_root");
    const inside = path.join(root, "x.txt");
    const score = scoreEvent("write_file", { path: inside }, { projectRoot: root });
    expect(score).toBeGreaterThanOrEqual(40);
    expect(score).toBeLessThan(70);
  });
});

describe("network scoring", () => {
  it("flags non-allowlisted HTTP calls", () => {
    const score = scoreEvent(
      "http_get",
      { url: "https://evil.example.com/api" },
      { networkAllowlist: ["api.openai.com"] },
    );
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it("does not flag allowlisted HTTP calls", () => {
    const score = scoreEvent(
      "http_get",
      { url: "https://api.openai.com/v1/chat" },
      { networkAllowlist: ["api.openai.com"] },
    );
    expect(score).toBeLessThan(60);
  });
});

describe("SQL scoring", () => {
  it("scores DROP TABLE high", () => {
    expect(scoreEvent("db_query", { query: "DROP TABLE users" })).toBeGreaterThanOrEqual(80);
  });
  it("scores DELETE high", () => {
    expect(
      scoreEvent("db_query", { query: "DELETE FROM customers WHERE 1=1" }),
    ).toBeGreaterThanOrEqual(80);
  });
  it("scores SELECT low", () => {
    expect(scoreEvent("db_query", { query: "SELECT * FROM customers LIMIT 10" })).toBeLessThan(50);
  });
});

describe("secrets-adjacent scoring", () => {
  it("flags get_secret", () => {
    expect(scoreEvent("get_secret", { name: "stripe-key" })).toBeGreaterThanOrEqual(70);
  });
  it("flags read_env", () => {
    expect(scoreEvent("read_env", { var: "STRIPE_KEY" })).toBeGreaterThanOrEqual(70);
  });
});

describe("misc", () => {
  it("returns the default 10 for unknown tools", () => {
    expect(scoreEvent("hello_world", { name: "noel" })).toBe(10);
  });

  it("stays within [0, 100] when many buckets fire", () => {
    const score = scoreEvent("subprocess_shell_exec_query", {
      cmd: "DROP TABLE users",
      path: "/etc/passwd",
      url: "https://evil.example.com",
    });
    // v0.1 takes the max bucket rather than stacking. Subprocess (90) wins;
    // every other bucket is lower. We just want to know the cap is honored.
    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });
});
