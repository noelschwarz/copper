/**
 * In-process redaction for tool-call arguments and results.
 *
 * Walks strings, arrays, and plain objects recursively and replaces matches
 * for known secret/PII shapes with `<REDACTED:label>`. Built-in rules
 * cover the common API key shapes plus generic high-entropy ≥32-char
 * tokens, emails, phones, SSN, IBAN, and Luhn-valid credit card numbers.
 *
 * Pattern order matters: specific tokens come before the generic
 * high-entropy fallback so the more useful label wins.
 */

import type { RedactionPattern } from "./config.js";

interface RedactRule {
  label: string;
  regex: RegExp;
  /** Optional secondary check; rule only fires if validator returns true. */
  validator?: (match: string) => boolean;
}

const SHANNON_THRESHOLD = 3.5;

function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const n = s.length;
  let h = 0;
  for (const count of freq.values()) {
    const p = count / n;
    h -= p * Math.log2(p);
  }
  return h;
}

function luhnValid(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  const parity = digits.length % 2;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[i]);
    if (Number.isNaN(n)) return false;
    if (i % 2 === parity) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/**
 * Built-in patterns. Stable, conservative defaults. Order matters: anything
 * that overlaps with the generic high-entropy `secret` rule must come
 * before it so it gets the more specific label.
 */
const BUILTIN_RULES: RedactRule[] = [
  { label: "openai_key", regex: /sk_live_[A-Za-z0-9_-]{20,}/g },
  { label: "openai_key", regex: /sk-[A-Za-z0-9_-]{20,}/g },
  { label: "aloy_key", regex: /aloy_(?:live|test)_[A-Za-z0-9_]{16,}/g },
  { label: "slack_token", regex: /xox[abposr]-[A-Za-z0-9-]{10,}/g },
  { label: "github_token", regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
  { label: "aws_access_key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    label: "iban",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
  },
  {
    label: "email",
    regex: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
  },
  { label: "phone", regex: /\+[1-9]\d{6,14}\b/g },
  { label: "phone", regex: /\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g },
  { label: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  {
    label: "credit_card",
    regex: /\b(?:\d[ \-]?){12,18}\d\b/g,
    validator: luhnValid,
  },
  {
    label: "secret",
    regex: /[A-Za-z0-9+/=_\-]{32,}/g,
    validator: (match) => shannonEntropy(match) >= SHANNON_THRESHOLD,
  },
];

function ensureGlobal(re: RegExp): RegExp {
  if (re.flags.includes("g")) return re;
  return new RegExp(re.source, `${re.flags}g`);
}

/**
 * Recursive redactor. Stateless apart from its rule list — safe to share
 * across calls and threads.
 */
export class Redactor {
  private readonly rules: ReadonlyArray<RedactRule>;

  constructor(extra: ReadonlyArray<RedactionPattern> = []) {
    const custom: RedactRule[] = extra.map((p) => ({
      label: p.label,
      regex: typeof p.pattern === "string" ? new RegExp(p.pattern, "g") : ensureGlobal(p.pattern),
    }));
    this.rules = [...custom, ...BUILTIN_RULES];
  }

  /** Return a recursively-redacted copy of `value`. The original is not mutated. */
  redact(value: unknown): unknown {
    return this.walk(value, new WeakSet());
  }

  private walk(value: unknown, seen: WeakSet<object>): unknown {
    if (typeof value === "string") return this.redactString(value);
    if (Array.isArray(value)) {
      if (seen.has(value)) return "<REDACTED:cycle>";
      seen.add(value);
      return value.map((v) => this.walk(v, seen));
    }
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      if (seen.has(value)) return "<REDACTED:cycle>";
      seen.add(value);
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.walk(v, seen);
      return out;
    }
    return value;
  }

  private redactString(input: string): string {
    let result = input;
    for (const rule of this.rules) {
      result = result.replace(rule.regex, (match) => {
        if (rule.validator && !rule.validator(match)) return match;
        return `<REDACTED:${rule.label}>`;
      });
    }
    return result;
  }
}
