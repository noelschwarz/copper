/**
 * OpenAI Agents SDK adapter — wraps tool decorators.
 *
 * The OpenAI Agents SDK represents tools as objects with an
 * `invoke` (or sometimes `execute`) function. We compose a new tool
 * preserving every other field so the agent's planner / serializer sees
 * an identical shape.
 */

import type { AloyClient } from "../client.js";
import type { Adapter, AdapterContext } from "../client.js";

// biome-ignore lint/suspicious/noExplicitAny: tool args are arbitrary at this layer
type AnyFn = (...args: any[]) => any;

export interface OpenAiAgentTool {
  name?: string;
  description?: string;
  parameters?: unknown;
  invoke?: AnyFn;
  execute?: AnyFn;
}

export function openaiAgentsAdapter<T extends OpenAiAgentTool>(): Adapter<T[], T[]> {
  return {
    wrap(tools: T[], ctx: AdapterContext): T[] {
      return tools.map((tool) => wrapOne(tool, ctx));
    },
  };
}

/** Wrap a single tool. Convenient when the user manages tools individually. */
export function wrapOpenAiAgentTool<T extends OpenAiAgentTool>(tool: T, ctx: AdapterContext): T {
  return wrapOne(tool, ctx);
}

/**
 * Ergonomic helper: wrap an array of OpenAI-Agents tools and preserve
 * the inferred element type.
 */
export function watchOpenAiAgents<T extends OpenAiAgentTool>(tools: T[], client: AloyClient): T[] {
  return client.watch<T[], T[]>(tools, { adapter: openaiAgentsAdapter<T>() });
}

function wrapOne<T extends OpenAiAgentTool>(tool: T, ctx: AdapterContext): T {
  const name = typeof tool.name === "string" && tool.name.length > 0 ? tool.name : "tool";
  if (typeof tool.invoke === "function") {
    const original = tool.invoke.bind(tool);
    return {
      ...tool,
      invoke: ((...args: unknown[]) =>
        ctx.observe(name, args[0], () => original(...args))) as AnyFn,
    };
  }
  if (typeof tool.execute === "function") {
    const original = tool.execute.bind(tool);
    return {
      ...tool,
      execute: ((...args: unknown[]) =>
        ctx.observe(name, args[0], () => original(...args))) as AnyFn,
    };
  }
  return tool;
}
