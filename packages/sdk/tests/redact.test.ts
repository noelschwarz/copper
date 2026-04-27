/**
 * Redaction tests.
 *
 * The hard contract: secrets present in the input must NEVER appear in
 * the output. Built-in patterns must catch the common shapes out of the
 * box on realistic, nested fixtures.
 */

import { describe, expect, it } from "vitest";
import { Redactor } from "../src/redact.js";

describe("Redactor.redactString", () => {
  it("redacts an AWS access key", () => {
    const r = new Redactor();
    const out = r.redact("aws key is AKIAIOSFODNN7EXAMPLE in here") as string;
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(out).toContain("<REDACTED:aws_access_key>");
  });

  it("redacts an OpenAI sk- key", () => {
    const r = new Redactor();
    const secret = "sk-abcDEF1234567890abcDEF1234567890abc";
    const out = r.redact(`token: ${secret}`) as string;
    expect(out).not.toContain(secret);
    expect(out).toContain("<REDACTED:openai_key>");
  });

  it("redacts an Aloy live key", () => {
    const r = new Redactor();
    const secret = "aloy_live_abcdef1234567890ABCDEF";
    const out = r.redact(`key=${secret}`) as string;
    expect(out).not.toContain(secret);
    expect(out).toContain("<REDACTED:aloy_key>");
  });

  it("redacts a GitHub token", () => {
    const r = new Redactor();
    const secret = `ghp_${"a".repeat(40)}`;
    const out = r.redact(secret) as string;
    expect(out).not.toContain(secret);
    expect(out).toContain("<REDACTED:");
  });

  it("redacts a Slack bot token", () => {
    const r = new Redactor();
    const secret = "xoxb-1234567890-abcdef1234567890ABCDEF";
    const out = r.redact(secret) as string;
    expect(out).not.toContain(secret);
    expect(out).toContain("<REDACTED:slack_token>");
  });

  it("redacts an email address", () => {
    const r = new Redactor();
    const out = r.redact("contact noel@aloy.dev for help") as string;
    expect(out).not.toContain("noel@aloy.dev");
    expect(out).toContain("<REDACTED:email>");
  });

  it("redacts E.164 phone numbers", () => {
    const r = new Redactor();
    const out = r.redact("call +14155551212 today") as string;
    expect(out).not.toContain("+14155551212");
    expect(out).toContain("<REDACTED:phone>");
  });

  it("redacts US-formatted phone numbers", () => {
    const r = new Redactor();
    const out = r.redact("call (415) 555-1212 today") as string;
    expect(out).not.toContain("(415) 555-1212");
    expect(out).toContain("<REDACTED:phone>");
  });

  it("redacts an SSN", () => {
    const r = new Redactor();
    const out = r.redact("SSN: 123-45-6789") as string;
    expect(out).not.toContain("123-45-6789");
    expect(out).toContain("<REDACTED:ssn>");
  });

  it("redacts a Luhn-valid credit card", () => {
    const r = new Redactor();
    const out = r.redact("card: 4242 4242 4242 4242") as string;
    expect(out).not.toContain("4242 4242 4242 4242");
    expect(out).toContain("<REDACTED:credit_card>");
  });

  it("does not label invalid Luhn digits as a credit card", () => {
    const r = new Redactor();
    const out = r.redact("not a card: 1111 1111 1111 1112") as string;
    expect(out).not.toContain("<REDACTED:credit_card>");
  });

  it("redacts a German IBAN", () => {
    const r = new Redactor();
    const iban = "DE89370400440532013000";
    const out = r.redact(`iban: ${iban}`) as string;
    expect(out).not.toContain(iban);
    expect(out).toContain("<REDACTED:");
  });
});

describe("Redactor.redact (recursive)", () => {
  it("walks objects", () => {
    const r = new Redactor();
    const out = r.redact({ k: "secret AKIAIOSFODNN7EXAMPLE", n: 5 }) as Record<string, unknown>;
    expect(out.n).toBe(5);
    expect(out.k as string).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("walks nested arrays", () => {
    const r = new Redactor();
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const out = r.redact({ args: [{ path: `prefix ${secret} suffix` }] }) as {
      args: Array<{ path: string }>;
    };
    expect(out.args[0]?.path).not.toContain(secret);
  });

  it("preserves non-string scalars", () => {
    const r = new Redactor();
    const out = r.redact({ n: 42, b: true, none: null }) as Record<string, unknown>;
    expect(out).toEqual({ n: 42, b: true, none: null });
  });

  it("ignores cyclic references safely", () => {
    const r = new Redactor();
    const obj: Record<string, unknown> = { name: "a" };
    obj.self = obj;
    expect(() => r.redact(obj)).not.toThrow();
  });
});

describe("user-supplied patterns", () => {
  it("applies extra rules first", () => {
    const r = new Redactor([{ label: "internal_id", pattern: /INT-\d{6}/ }]);
    const out = r.redact("ticket INT-123456 closed") as string;
    expect(out).not.toContain("INT-123456");
    expect(out).toContain("<REDACTED:internal_id>");
  });
});

describe("no-secret-leak paranoia", () => {
  it("scrubs every known secret in a realistic nested payload", () => {
    const r = new Redactor();
    const payload = {
      tool: "fetch_url",
      args: {
        url: "https://api.example.com",
        headers: {
          Authorization: "Bearer sk-abcDEF1234567890abcDEF1234567890abc",
          "X-Customer-Email": "alice@example.com",
        },
        body: {
          creditCard: "4242 4242 4242 4242",
          ssn: "111-22-3333",
          aws: "AKIAIOSFODNN7EXAMPLE",
          github: `ghp_${"a".repeat(40)}`,
        },
      },
    };
    const out = r.redact(payload);
    const flat = JSON.stringify(out);
    for (const secret of [
      "sk-abcDEF1234567890abcDEF1234567890abc",
      "alice@example.com",
      "4242 4242 4242 4242",
      "111-22-3333",
      "AKIAIOSFODNN7EXAMPLE",
      `ghp_${"a".repeat(40)}`,
    ]) {
      expect(flat).not.toContain(secret);
    }
  });
});
