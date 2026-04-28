import type { RiskResult } from "./types.js";

function collectArgStrings(
  args: Record<string, unknown>,
  out: string[] = [],
): string[] {
  for (const v of Object.values(args)) {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object" && !Array.isArray(v)) {
      collectArgStrings(v as Record<string, unknown>, out);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") out.push(item);
        else if (item && typeof item === "object")
          collectArgStrings(item as Record<string, unknown>, out);
      }
    }
  }
  return out;
}

function hasDestructiveSql(args: Record<string, unknown>): boolean {
  const blob = collectArgStrings(args).join("\n").toUpperCase();
  return /\b(DROP|DELETE|TRUNCATE|ALTER)\b/.test(blob);
}

function nameTokens(name: string): string {
  return name.toLowerCase().replace(/-/g, "_");
}

/**
 * v0.1 heuristic risk score for a tool name plus arguments.
 * Highest matching rule wins.
 */
export function risk(
  toolName: string,
  arguments_: Record<string, unknown>,
): RiskResult {
  const n = nameTokens(toolName);

  const execLike =
    /\bexec\b/.test(n) || n.includes("run_command") || n.includes("shell");
  if (execLike) return { score: 90, label: "high" };

  if (hasDestructiveSql(arguments_)) return { score: 80, label: "high" };

  if (n.includes("write_file") || n.includes("delete_file"))
    return { score: 60, label: "medium" };

  if (
    n.includes("fetch") ||
    n.includes("http") ||
    n.includes("request") ||
    n.includes("curl")
  ) {
    return { score: 30, label: "low" };
  }

  if (
    n.includes("read_file") ||
    n.includes("list_directory") ||
    n.startsWith("get_") ||
    n.includes("_get_")
  ) {
    return { score: 10, label: "low" };
  }

  return { score: 20, label: "low" };
}
