/** Risk tier returned by the built-in scorer. */
export type RiskLabel = "low" | "medium" | "high";

/** Score 0–100 plus label from `risk()`. */
export type RiskResult = {
  score: number;
  label: RiskLabel;
};

/** MCP `callTool` request shape (subset). */
export type CallToolParams = {
  name: string;
  arguments?: Record<string, unknown>;
};

/** Minimal client surface `watch()` wraps. */
export type WatchableClient = {
  callTool(params: CallToolParams): Promise<unknown>;
};

/** Payload emitted after each observed call (tests, integrations). */
export type ToolCallEvent = {
  name: string;
  redactedArguments: Record<string, unknown>;
  risk: RiskResult;
  durationMs: number;
  ok: boolean;
  errorMessage?: string;
  result?: unknown;
};

export type WatchOptions = {
  /** Where formatted lines are written. Default: `process.stdout`. */
  stream?: NodeJS.WritableStream;
  /** Replace built-in recursive redaction. */
  redact?: (value: unknown) => unknown;
  /** Replace built-in risk heuristics. */
  risk?: (toolName: string, arguments_: Record<string, unknown>) => RiskResult;
  /**
   * Called after each tool call finishes (success or failure).
   * Observation hooks must not throw; this callback is wrapped defensively.
   */
  onToolCall?: (event: ToolCallEvent) => void;
};
