/**
 * Heuristic risk scoring.
 *
 * v0.1 is intentionally dumb — we want a placeholder that flags the obvious
 * dangerous shapes and lets users override per-project via
 * `AloyConfig.riskScorer`. The goal is to give the policy engine
 * something to chew on while we collect real telemetry to learn from.
 *
 * Buckets, per the spec:
 *   subprocess execution                        -> 90+
 *   filesystem writes outside the project dir   -> 70+
 *   SQL DROP/DELETE/TRUNCATE/ALTER              -> 80+
 *   secrets-adjacent tool names                 -> 70+
 *   network calls to non-allowlisted domains    -> 60+
 *   default                                     -> 10
 */

import path from "node:path";

const SUBPROCESS_KEYWORDS = [
  "subprocess",
  "shell",
  "exec",
  "spawn",
  "system",
  "popen",
  "bash",
  "run_command",
  "run_shell",
];

const FILESYSTEM_WRITE_KEYWORDS = [
  "write",
  "create_file",
  "delete",
  "unlink",
  "remove",
  "rmdir",
  "rename",
  "move_file",
  "chmod",
  "chown",
  "save",
];

const NETWORK_KEYWORDS = [
  "http",
  "fetch",
  "request",
  "get_url",
  "post_url",
  "curl",
  "download",
  "upload",
  "browse",
];

const SECRETS_ADJACENT_KEYWORDS = [
  "get_secret",
  "read_env",
  "kms_",
  "decrypt_",
  "list_secrets",
  "describe_secret",
];

const SQL_DESTRUCTIVE = /\b(DROP|DELETE|TRUNCATE|ALTER)\b/i;
const SQL_FIELDS = ["query", "sql", "statement"];
const PATH_FIELDS = ["path", "file", "filename", "filepath", "destination", "target"];
const URL_FIELDS = ["url", "endpoint", "uri"];

export interface RiskScoreContext {
  projectRoot?: string;
  networkAllowlist?: ReadonlyArray<string>;
}

export function scoreEvent(
  toolName: string,
  args: unknown = undefined,
  ctx: RiskScoreContext = {},
): number {
  const name = (toolName ?? "").toLowerCase();
  const projectRoot = ctx.projectRoot ?? process.cwd();
  const allowlist = (ctx.networkAllowlist ?? []).map((d) => d.toLowerCase().trim());
  let score = 10;

  if (SUBPROCESS_KEYWORDS.some((k) => name.includes(k))) {
    score = Math.max(score, 90);
  }
  if (SECRETS_ADJACENT_KEYWORDS.some((k) => name.includes(k))) {
    score = Math.max(score, 70);
  }

  if (FILESYSTEM_WRITE_KEYWORDS.some((k) => name.includes(k))) {
    const p = extractField(args, PATH_FIELDS);
    if (p && !isWithin(p, projectRoot)) {
      score = Math.max(score, 70);
    } else {
      score = Math.max(score, 40);
    }
  }

  if (NETWORK_KEYWORDS.some((k) => name.includes(k))) {
    const url = extractField(args, URL_FIELDS);
    if (url && !isAllowlisted(url, allowlist)) {
      score = Math.max(score, 60);
    } else {
      score = Math.max(score, 25);
    }
  }

  const sql = extractField(args, SQL_FIELDS);
  const candidates: string[] = sql ? [sql] : [];
  if (candidates.length === 0) {
    for (const v of flatten(args)) {
      if (typeof v === "string") candidates.push(v);
    }
  }
  for (const candidate of candidates) {
    if (SQL_DESTRUCTIVE.test(candidate)) {
      score = Math.max(score, 80);
      break;
    }
  }

  return Math.min(score, 100);
}

function extractField(args: unknown, names: ReadonlyArray<string>): string | undefined {
  if (!args || typeof args !== "object") return undefined;
  const targets = new Set(names.map((n) => n.toLowerCase()));
  const stack: unknown[] = [args];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
    } else if (cur && typeof cur === "object") {
      for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
        if (typeof v === "string" && targets.has(k.toLowerCase())) return v;
        if (v && typeof v === "object") stack.push(v);
      }
    }
  }
  return undefined;
}

function* flatten(value: unknown): IterableIterator<unknown> {
  if (Array.isArray(value)) {
    for (const v of value) yield* flatten(v);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) yield* flatten(v);
  } else {
    yield value;
  }
}

function isWithin(target: string, root: string): boolean {
  try {
    const a = path.resolve(target);
    const b = path.resolve(root);
    return a === b || a.startsWith(b + path.sep);
  } catch {
    return false;
  }
}

function isAllowlisted(url: string, allowlist: ReadonlyArray<string>): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    for (const entry of allowlist) {
      if (!entry) continue;
      if (host === entry || host.endsWith(`.${entry}`)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
