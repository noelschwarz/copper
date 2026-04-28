import { describe, expect, it } from "vitest";

import { risk } from "../src/risk.js";

describe("risk", () => {
  it("scores exec-like tools as high", () => {
    expect(risk("run_command", {})).toEqual({ score: 90, label: "high" });
    expect(risk("exec", {})).toEqual({ score: 90, label: "high" });
    expect(risk("remote_shell", {})).toEqual({ score: 90, label: "high" });
  });

  it("scores destructive SQL in arguments as high", () => {
    expect(risk("query", { sql: "DROP TABLE users" })).toEqual({
      score: 80,
      label: "high",
    });
    expect(risk("run_sql", { query: "DELETE FROM t" })).toEqual({
      score: 80,
      label: "high",
    });
    expect(risk("db", { q: "TRUNCATE logs" })).toEqual({
      score: 80,
      label: "high",
    });
    expect(risk("db", { q: "ALTER TABLE x ADD y int" })).toEqual({
      score: 80,
      label: "high",
    });
  });

  it("scores filesystem writes as medium", () => {
    expect(risk("write_file", {})).toEqual({ score: 60, label: "medium" });
    expect(risk("delete_file", {})).toEqual({ score: 60, label: "medium" });
  });

  it("scores network-ish tools as low", () => {
    expect(risk("fetch_url", {})).toEqual({ score: 30, label: "low" });
    expect(risk("http_get", {})).toEqual({ score: 30, label: "low" });
  });

  it("scores reads as low", () => {
    expect(risk("read_file", {})).toEqual({ score: 10, label: "low" });
    expect(risk("list_directory", {})).toEqual({ score: 10, label: "low" });
    expect(risk("get_status", {})).toEqual({ score: 10, label: "low" });
  });

  it("uses a mild default", () => {
    expect(risk("unknown_tool", {})).toEqual({ score: 20, label: "low" });
  });
});
