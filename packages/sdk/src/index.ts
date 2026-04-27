/**
 * Aloy SDK — public entrypoint.
 *
 * Quickstart:
 *
 *     import { AloyClient, mcpAdapter } from "aloy";
 *
 *     const aloy = new AloyClient({ apiUrl: "http://localhost:3000" });
 *     const observed = aloy.watch(mcpClient, { adapter: mcpAdapter() });
 *
 *     await observed.callTool({ name: "read_file", arguments: { path: "..." } });
 *
 * The package is MIT-licensed even though the rest of the Aloy repository
 * is AGPL-3.0. See LICENSE in this directory.
 */

export { VERSION } from "./version.js";

export {
  AloyError,
  AloyConfigError,
  AloyTransportError,
  PolicyViolationError,
} from "./errors.js";
export type { PolicyViolationDetails } from "./errors.js";

export {
  AloyConfigSchema,
  RedactionPatternSchema,
  loadConfigFromEnv,
} from "./config.js";
export type { AloyConfig, AloyConfigInput, RedactionPattern } from "./config.js";

export {
  ToolCallEventSchema,
  ToolCallEventBatchSchema,
  EventCreatedSchema,
  EventBatchCreatedSchema,
  EventListResponseSchema,
} from "./events.js";
export type {
  ToolCallEvent,
  ToolCallEventInput,
  ToolCallEventBatch,
  EventCreated,
  EventBatchCreated,
  EventListResponse,
} from "./events.js";

export { Redactor } from "./redact.js";
export { scoreEvent } from "./risk.js";
export type { RiskScoreContext } from "./risk.js";

export { Transport } from "./transport.js";
export type { TransportOptions, TransportStats, TransportLogger } from "./transport.js";

export { AloyClient, watch, _resetDefaultClient } from "./client.js";
export type { Adapter, AdapterContext, AloyClientDeps, WatchOptions } from "./client.js";

export { mcpAdapter, watchMcp } from "./adapters/mcp.js";
export type { McpClientLike, McpCallToolRequest } from "./adapters/mcp.js";

export { vercelAiAdapter, watchVercelAi } from "./adapters/vercel-ai.js";
export type { VercelAiTool, VercelAiToolset, VercelAiExecuteFn } from "./adapters/vercel-ai.js";

export {
  openaiAgentsAdapter,
  watchOpenAiAgents,
  wrapOpenAiAgentTool,
} from "./adapters/openai-agents.js";
export type { OpenAiAgentTool } from "./adapters/openai-agents.js";
