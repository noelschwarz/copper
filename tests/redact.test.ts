import { describe, expect, it } from "vitest";

import { redact } from "../src/redact.js";

describe("redact", () => {
  it("masks OpenAI-style keys", () => {
    const out = redact({ key: "sk-1234567890abcdefghijklmnop" }) as {
      key: string;
    };
    expect(out.key).toContain("<REDACTED:api_key>");
    expect(out.key).not.toContain("sk-1234");
  });

  it("masks sk_live_", () => {
    const out = redact({ k: "sk_live_abcd1234567890abcdefghijklmn" }) as {
      k: string;
    };
    expect(out.k).toBe("<REDACTED:api_key>");
  });

  it("masks Slack bot token prefix", () => {
    const out = redact({
      t: "xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx",
    }) as {
      t: string;
    };
    expect(out.t).toBe("<REDACTED:api_key>");
  });

  it("masks GitHub PATs", () => {
    expect(redact("ghp_0123456789abcdefghijklmnopqrstuvwxyz")).toBe(
      "<REDACTED:api_key>",
    );
    expect(redact("gho_0123456789abcdefghijklmnopqrstuvwxyz")).toBe(
      "<REDACTED:api_key>",
    );
    expect(redact("ghs_0123456789abcdefghijklmnopqrstuvwxyz")).toBe(
      "<REDACTED:api_key>",
    );
  });

  it("masks AWS access key id", () => {
    const nested = { creds: { aws: "AKIAIOSFODNN7EXAMPLE" } };
    const out = redact(nested) as { creds: { aws: string } };
    expect(out.creds.aws).toBe("<REDACTED:api_key>");
    expect(JSON.stringify(out)).not.toContain("AKIA");
  });

  it("masks emails", () => {
    const out = redact({ note: "mail alice@example.com today" }) as {
      note: string;
    };
    expect(out.note).toContain("<REDACTED:email>");
    expect(out.note).not.toContain("alice@");
  });

  it("masks E.164 phones", () => {
    const out = redact({ phone: "+14155552671" }) as { phone: string };
    expect(out.phone).toBe("<REDACTED:phone>");
  });

  it("masks Luhn-valid credit card numbers", () => {
    const out = redact({ pan: "4242424242424242" }) as { pan: string };
    expect(out.pan).toBe("<REDACTED:credit_card>");
  });

  it("masks long hex strings", () => {
    const hex = "a".repeat(32);
    const out = redact({ digest: hex }) as { digest: string };
    expect(out.digest).toBe("<REDACTED:high_entropy>");
  });

  it("does not replace short harmless strings", () => {
    expect(redact({ id: "abc" })).toEqual({ id: "abc" });
  });
});
