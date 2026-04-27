/**
 * MCP adapter — wraps `@modelcontextprotocol/sdk` Client.callTool.
 *
 * The standard MCP Client exposes:
 *
 *     client.callTool({ name, arguments }) -> Promise<CallToolResult>
 *
 * That's the *only* shape we want to intercept. Other methods (`connect`,
 * `listTools`, `notification`, etc.) pass through unchanged so we don't
 * pollute traces with non-tool-call telemetry.
 */

import type { AloyClient } from "../client.js";
import type { Adapter, AdapterContext } from "../client.js";

export interface McpCallToolRequest {
  name: string;
  arguments?: Record<string, unknown> | undefined;
  _meta?: Record<string, unknown> | undefined;
}

/**
 * Minimal shape we need from an MCP client. The real
 * `@modelcontextprotocol/sdk` Client carries dozens of additional fields
 * and ships several overloaded `callTool` signatures with strongly-typed
 * first parameters. We only intercept `.callTool(...)` and pass the
 * runtime arguments through untouched, so we use `any` here as the
 * appropriate escape hatch — TypeScript's strict variance check would
 * otherwise refuse to admit the real Client to this interface.
 */
export interface McpClientLike {
  // biome-ignore lint/suspicious/noExplicitAny: any callTool overload is fine; runtime is what matters
  callTool: (...args: any[]) => Promise<any>;
}

export function mcpAdapter<TClient extends McpClientLike = McpClientLike>(): Adapter<
  TClient,
  TClient
> {
  return {
    wrap(target: TClient, ctx: AdapterContext): TClient {
      return new Proxy(target, {
        get(t, prop, receiver) {
          if (prop === "callTool") {
            const original = (t.callTool as McpClientLike["callTool"]).bind(t);
            return (...args: unknown[]): Promise<unknown> => {
              const request = (args[0] ?? {}) as McpCallToolRequest;
              const toolName = typeof request.name === "string" ? request.name : "callTool";
              const toolArgs = request.arguments ?? {};
              return Promise.resolve(ctx.observe(toolName, toolArgs, () => original(...args)));
            };
          }
          return Reflect.get(t, prop, receiver);
        },
      }) as TClient;
    },
  };
}

/**
 * Ergonomic helper for the common case: wrap an MCP client and preserve
 * its original type. Equivalent to
 * `client.watch(target, { adapter: mcpAdapter<T>() })` but without the
 * boilerplate.
 */
export function watchMcp<TClient extends McpClientLike>(
  target: TClient,
  client: AloyClient,
): TClient {
  return client.watch<TClient, TClient>(target, { adapter: mcpAdapter<TClient>() });
}
