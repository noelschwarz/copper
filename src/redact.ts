/**
 * Recursively scrub secrets and PII from values intended for logs.
 * Replaced segments use `<REDACTED:kind>`.
 */

const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const E164 = /\+[1-9]\d{6,14}\b/g;

function luhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number.parseInt(digits.charAt(i), 10);
    if (Number.isNaN(n)) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function redactCreditCards(s: string): string {
  return s.replace(/\b(?:\d[ -]*?){13,19}\b/g, (chunk) => {
    const digits = chunk.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) return chunk;
    return luhnValid(digits) ? "<REDACTED:credit_card>" : chunk;
  });
}

function redactHighEntropy(s: string): string {
  let out = s;
  out = out.replace(/\b[0-9a-f]{32,}\b/gi, "<REDACTED:high_entropy>");
  out = out.replace(/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, (m) => {
    if (/^\+?[0-9]+$/.test(m.replace(/=/g, ""))) return m;
    if (m.includes("/") && m.length < 48) return m;
    return "<REDACTED:high_entropy>";
  });
  return out;
}

function redactString(s: string): string {
  let out = s;

  out = out.replace(/\bsk_live_[a-zA-Z0-9]{20,}\b/g, "<REDACTED:api_key>");
  out = out.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, "<REDACTED:api_key>");
  out = out.replace(/\bxoxb-[0-9A-Za-z-]{10,}\b/g, "<REDACTED:api_key>");
  out = out.replace(/\bgh[ps]_[a-zA-Z0-9]{20,}\b/g, "<REDACTED:api_key>");
  out = out.replace(/\bgho_[a-zA-Z0-9]{20,}\b/g, "<REDACTED:api_key>");
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, "<REDACTED:api_key>");

  out = out.replace(EMAIL, "<REDACTED:email>");
  out = out.replace(E164, "<REDACTED:phone>");
  out = redactCreditCards(out);
  out = redactHighEntropy(out);

  return out;
}

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      next[k] = redactValue(o[k]);
    }
    return next;
  }
  return value;
}

/** Deep-clone-ish redaction for tool arguments (plain JSON shapes). */
export function redact(value: unknown): unknown {
  return redactValue(value);
}
