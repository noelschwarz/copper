import { redact as defaultRedact } from "./redact.js";
import { renderToolCall, shouldUseColorForStream, formatSeparator } from "./render.js";
import { risk as defaultRisk } from "./risk.js";
import type { CallToolParams, ToolCallEvent, WatchableClient, WatchOptions } from "./types.js";

function safeOnToolCall(cb: ((e: ToolCallEvent) => void) | undefined, event: ToolCallEvent) {
  if (!cb) return;
  try {
    cb(event);
  } catch {
    /* observation must not break the tool call */
  }
}

function safeRender(fn: () => void) {
  try {
    fn();
  } catch {
    /* never throw from logging */
  }
}

/**
 * Wrap an MCP client so every `callTool` is redacted, scored, logged, then passed through.
 */
export function watch<T extends WatchableClient>(client: T, options?: WatchOptions): T {
  const stream = options?.stream ?? process.stdout;
  const redactFn = options?.redact ?? defaultRedact;
  const riskFn = options?.risk ?? defaultRisk;
  const onToolCall = options?.onToolCall;

  const bound = client.callTool.bind(client);
  let firstLog = true;

  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "callTool") {
        return async (params: CallToolParams) => {
          const start = Date.now();
          const name = params.name;
          const rawArgs = params.arguments ?? {};
          const redactedArguments = redactFn(rawArgs) as Record<string, unknown>;
          const riskResult = riskFn(name, rawArgs);
          const useColor = shouldUseColorForStream(stream);

          let result: unknown;
          let error: Error | undefined;

          try {
            result = await bound(params);
          } catch (e) {
            error = e instanceof Error ? e : new Error(String(e));
          }

          const durationMs = Date.now() - start;
          const ok = !error;

          const event: ToolCallEvent = {
            name,
            redactedArguments,
            risk: riskResult,
            durationMs,
            ok,
            errorMessage: error?.message,
            result,
          };

          safeOnToolCall(onToolCall, event);

          safeRender(() => {
            if (!firstLog) {
              stream.write(`${formatSeparator(useColor)}\n`);
            }
            firstLog = false;
            renderToolCall({
              stream,
              useColor,
              name,
              redactedArguments,
              riskLabel: riskResult.label,
              riskScore: riskResult.score,
              durationMs,
              ok,
              errorMessage: error?.message,
              result,
            });
          });

          if (error) throw error;
          return result;
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  }) as T;
}
