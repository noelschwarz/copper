/**
 * Vercel AI SDK adapter — wraps `tool({ ..., execute })` definitions.
 *
 * The shape we intercept is the per-tool `execute` function. We compose a
 * new tool object whose `execute` runs through Aloy first and then calls
 * the original. The rest of the tool object (description, parameters,
 * etc.) is preserved verbatim.
 *
 * `execute` accepts arbitrary `args` (Vercel AI ships strongly-typed
 * `args` derived from each tool's Zod schema). To stay compatible with
 * any tool definition the user throws at us, we accept `unknown[]`
 * everywhere and let the runtime carry the original types through.
 */

import type { AloyClient } from "../client.js";
import type { Adapter, AdapterContext } from "../client.js";

// biome-ignore lint/suspicious/noExplicitAny: tool args are schema-driven and arbitrary at this layer
export type VercelAiExecuteFn = (...args: any[]) => unknown;

export interface VercelAiTool {
  description?: string;
  parameters?: unknown;
  execute?: VercelAiExecuteFn;
}

export type VercelAiToolset = Record<string, VercelAiTool>;

export function vercelAiAdapter<T extends Record<string, VercelAiTool>>(): Adapter<T, T> {
  return {
    wrap(toolset: T, ctx: AdapterContext): T {
      const out: Record<string, VercelAiTool> = {};
      for (const [name, tool] of Object.entries(toolset)) {
        if (typeof tool.execute !== "function") {
          out[name] = tool;
          continue;
        }
        const original = tool.execute.bind(tool);
        out[name] = {
          ...tool,
          execute: ((...callArgs: unknown[]) => {
            const args = callArgs[0];
            return ctx.observe(name, args, () => original(...callArgs));
          }) as VercelAiExecuteFn,
        };
      }
      return out as T;
    },
  };
}

/**
 * Ergonomic helper: wrap a Vercel-AI toolset and preserve its inferred
 * type so `generateText`/`streamText` continue to see the same `tools`
 * shape they would without Aloy.
 */
export function watchVercelAi<T extends Record<string, VercelAiTool>>(
  toolset: T,
  client: AloyClient,
): T {
  return client.watch<T, T>(toolset, { adapter: vercelAiAdapter<T>() });
}
