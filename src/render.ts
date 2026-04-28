import pc from "picocolors";

import type { RiskLabel } from "./types.js";

const MAX_LEN = 200;

export type RenderToolCallInput = {
  stream: NodeJS.WritableStream;
  useColor: boolean;
  name: string;
  redactedArguments: Record<string, unknown>;
  riskLabel: RiskLabel;
  riskScore: number;
  durationMs: number;
  ok: boolean;
  errorMessage?: string;
  result?: unknown;
};

function stringifyTruncated(value: unknown, useColor: boolean): string {
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (s.length <= MAX_LEN) return s;
  const cut = `${s.slice(0, MAX_LEN)}...`;
  return useColor ? pc.dim(cut) : cut;
}

function isPlainMcpToolResult(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return Array.isArray(o.content);
}

function successPreview(result: unknown, useColor: boolean): string {
  if (result === undefined || result === null) return "ok";
  if (isPlainMcpToolResult(result)) return "ok";
  return stringifyTruncated(result, useColor);
}

function riskSuffix(label: RiskLabel, useColor: boolean): string {
  if (label === "high") return useColor ? pc.red("⨯ high") : "x high";
  if (label === "medium") return useColor ? pc.yellow("⚠ medium") : "! medium";
  return "";
}

function streamIsTTY(stream: NodeJS.WritableStream): boolean {
  return Boolean((stream as NodeJS.WriteStream).isTTY);
}

/** Whether to emit ANSI styling (TTY streams only). */
export function shouldUseColorForStream(
  stream: NodeJS.WritableStream,
): boolean {
  if (stream === process.stdout) return Boolean(process.stdout.isTTY);
  if (stream === process.stderr) return Boolean(process.stderr.isTTY);
  return streamIsTTY(stream);
}

export function formatSeparator(useColor: boolean): string {
  const line = "─".repeat(56);
  return useColor ? pc.dim(line) : line;
}

/**
 * Print one tool-call block to the given stream.
 * Callers should swallow errors.
 */
export function renderToolCall(input: RenderToolCallInput): void {
  const {
    stream,
    useColor,
    name,
    redactedArguments,
    riskLabel,
    durationMs,
    ok,
    errorMessage,
    result,
  } = input;

  const icon = useColor ? pc.cyan("▸") : ">";
  const namePart = useColor ? pc.bold(name) : name;
  const risk = riskSuffix(riskLabel, useColor);
  const headBits = [`  ${icon} ${namePart}`];
  if (risk) headBits.push(risk);
  headBits.push(`${durationMs}ms`);
  stream.write(`${headBits.join("  ")}\n`);

  const argsStr = stringifyTruncated(redactedArguments, useColor);
  stream.write(`    args: ${argsStr}\n`);

  if (!ok && errorMessage) {
    stream.write(
      useColor
        ? `    ${pc.red("→")} ${pc.red(errorMessage)}\n`
        : `    → ${errorMessage}\n`,
    );
  } else if (!ok) {
    stream.write(useColor ? `    ${pc.red("→")} error\n` : "    → error\n");
  } else {
    const preview = successPreview(result, useColor);
    stream.write(
      useColor
        ? `    ${pc.green("→")} ${pc.green(preview)}\n`
        : `    → ${preview}\n`,
    );
  }
}
