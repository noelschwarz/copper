/**
 * /v1/events route tests.
 *
 * Exercises the public contract end-to-end against a real Postgres 15
 * (via testcontainers): single insert, batch insert with the 500-event
 * cap, cursor pagination, and the auth-toggle behavior.
 */

import { VERSION } from "aloy";
import bcrypt from "bcrypt";
import { ulid } from "ulid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateApiKey } from "../src/cli.js";
import { apiKeys } from "../src/db/schema.js";
import { type TestApp, startTestApp } from "./setup.js";

let api: TestApp;

beforeAll(async () => {
  api = await startTestApp({ useDbAuthentication: false });
});

afterAll(async () => {
  await api.close();
});

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    project: "test",
    agentId: "agent-1",
    toolName: "echo",
    args: { x: 1 },
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    durationMs: 5,
    riskScore: 10,
    blocked: false,
    sdkVersion: VERSION,
    ...overrides,
  };
}

describe("POST /v1/events", () => {
  it("accepts a valid event and returns evt_<ulid>", async () => {
    const resp = await api.fetch("/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEvent({ toolName: "single" })),
    });
    expect(resp.status).toBe(202);
    const body = (await resp.json()) as { id: string };
    expect(body.id).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/i);
  });

  it("rejects malformed payloads with 400", async () => {
    const resp = await api.fetch("/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: "" }),
    });
    expect(resp.status).toBe(400);
  });
});

describe("POST /v1/events/batch", () => {
  it("inserts up to 500 events and returns ids", async () => {
    const events = Array.from({ length: 5 }, (_, i) => buildEvent({ toolName: `b-${i}` }));
    const resp = await api.fetch("/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    expect(resp.status).toBe(202);
    const body = (await resp.json()) as { ids: string[] };
    expect(body.ids).toHaveLength(5);
    for (const id of body.ids) expect(id).toMatch(/^evt_/);
  });

  it("rejects batches over 500", async () => {
    const events = Array.from({ length: 501 }, () => buildEvent());
    const resp = await api.fetch("/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });
    expect(resp.status).toBe(400);
  });
});

describe("GET /v1/events (cursor pagination)", () => {
  it("paginates descending on id", async () => {
    const project = `pg-${ulid().toLowerCase()}`;
    const events = Array.from({ length: 5 }, (_, i) => buildEvent({ project, toolName: `p-${i}` }));
    await api.fetch("/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events }),
    });

    const first = await api.fetch(`/v1/events?project=${project}&limit=2`);
    const firstBody = (await first.json()) as {
      events: Array<{ id: string }>;
      nextBeforeId: string | null;
    };
    expect(firstBody.events).toHaveLength(2);
    expect(firstBody.nextBeforeId).toBeTruthy();

    const second = await api.fetch(
      `/v1/events?project=${project}&limit=2&beforeId=${firstBody.nextBeforeId}`,
    );
    const secondBody = (await second.json()) as { events: Array<{ id: string }> };
    expect(secondBody.events).toHaveLength(2);
    // Different ids than first page.
    const firstIds = new Set(firstBody.events.map((e) => e.id));
    for (const e of secondBody.events) expect(firstIds.has(e.id)).toBe(false);
  });
});

describe("authentication toggle", () => {
  let auth: TestApp;

  beforeAll(async () => {
    auth = await startTestApp({ useDbAuthentication: true });
  });

  afterAll(async () => {
    await auth.close();
  });

  it("rejects unauthenticated requests", async () => {
    const resp = await auth.fetch("/v1/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildEvent()),
    });
    expect(resp.status).toBe(401);
  });

  it("accepts requests with a valid bearer token", async () => {
    const { full, prefix } = generateApiKey();
    const hash = await bcrypt.hash(full, 4);
    await auth.handle.db.insert(apiKeys).values({ id: ulid(), name: "test", prefix, hash });

    const resp = await auth.fetch("/v1/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${full}`,
      },
      body: JSON.stringify(buildEvent({ toolName: "with-auth" })),
    });
    expect(resp.status).toBe(202);
  });

  it("rejects revoked keys", async () => {
    const { full, prefix } = generateApiKey();
    const hash = await bcrypt.hash(full, 4);
    await auth.handle.db.insert(apiKeys).values({
      id: ulid(),
      name: "revoked-test",
      prefix,
      hash,
      revokedAt: new Date(),
    });

    const resp = await auth.fetch("/v1/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${full}`,
      },
      body: JSON.stringify(buildEvent()),
    });
    expect(resp.status).toBe(401);
  });
});

describe("GET /health", () => {
  it("is public and returns the SDK version", async () => {
    const resp = await api.fetch("/health");
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { status: string; version: string };
    expect(body.status).toBe("ok");
    expect(body.version).toBe(VERSION);
  });
});
