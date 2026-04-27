/**
 * End-to-end integration test.
 *
 * Boots the Hono API in-process against a Postgres 15 testcontainer,
 * constructs an `AloyClient` from the SDK pointed at the in-process app
 * via a custom `fetchImpl`, fires a tool call through the MCP adapter
 * with secrets buried in nested arguments, flushes the SDK transport,
 * and asserts the redacted row lands in Postgres.
 *
 * This is the test that proves SDK → wire format → server validation →
 * Drizzle → Postgres all agree.
 */

import { AloyClient, type McpClientLike, Transport, mcpAdapter } from "aloy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { events as eventsTable } from "../src/db/schema.js";
import { type TestApp, startTestApp } from "./setup.js";

let api: TestApp;

beforeAll(async () => {
  api = await startTestApp({ useDbAuthentication: false });
});

afterAll(async () => {
  await api.close();
});

describe("end-to-end SDK → API → Postgres", () => {
  it("ships a redacted, scored event from MCP adapter to the database", async () => {
    // Custom fetch routes SDK requests directly into the in-process Hono app.
    const fetchImpl: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const result = api.app.fetch(
        new Request(`http://localhost${path}`, init as RequestInit | undefined),
      );
      return result instanceof Response ? result : await result;
    };

    const transport = new Transport({
      apiUrl: "http://aloy.test",
      flushIntervalMs: 60_000, // we'll flush manually
      fetchImpl,
      disableShutdownHook: true,
    });
    const client = new AloyClient(
      {
        apiUrl: "http://aloy.test",
        project: "integration",
        agentId: "agent-e2e",
      },
      { transport },
    );

    let underlyingCalls = 0;
    const fakeMcp: McpClientLike = {
      async callTool(req) {
        underlyingCalls += 1;
        return { content: [{ type: "text", text: `read ${req.name}` }] };
      },
    };
    const observed = client.watch(fakeMcp, { adapter: mcpAdapter() });

    await observed.callTool({
      name: "read_file",
      arguments: {
        path: "/etc/passwd",
        creds: {
          aws: "AKIAIOSFODNN7EXAMPLE",
          contact: "noel@aloy.dev",
        },
      },
    });

    expect(underlyingCalls).toBe(1);

    await client.flush();
    await client.close();

    const rows = await api.handle.db.select().from(eventsTable);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error("expected one row");

    expect(row.id).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/i);
    expect(row.project).toBe("integration");
    expect(row.agentId).toBe("agent-e2e");
    expect(row.toolName).toBe("read_file");
    expect(row.blocked).toBe(false);
    expect(row.riskScore).toBeGreaterThanOrEqual(10);
    expect(row.sdkVersion).toBeTruthy();

    const flat = JSON.stringify(row);
    expect(flat).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(flat).not.toContain("noel@aloy.dev");
    expect(flat).toContain("<REDACTED:aws_access_key>");
    expect(flat).toContain("<REDACTED:email>");

    // The tool's literal output is preserved (no secrets in it).
    const result = row.result as { content?: Array<{ text?: string }> } | null;
    expect(result?.content?.[0]?.text).toBe("read read_file");
  });
});
