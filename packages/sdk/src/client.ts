/**
 * `AloyClient` and the `watch()` proxy — the part of the SDK that sits in
 * the user's hot path.
 *
 * Two invariants hold at all times:
 *
 *   1. We never block the user's event loop. The transport is fully async
 *      and bounded; on overflow we drop the oldest event.
 *   2. We never throw from observation. Redactor / scorer / transport
 *      errors are swallowed at the boundary. The single intentional throw
 *      is `PolicyViolationError`, fired *before* the underlying call
 *      executes when a tool exceeds the configured risk threshold.
 *
 * `watch()` returns a Proxy that, on each method invocation, runs:
 *
 *   redact(args) -> score risk -> maybe block -> run -> redact(result)
 *   -> enqueue event
 *
 * For complex client shapes (MCP `.callTool`, Vercel AI's `tool({ execute })`,
 * OpenAI Agents tool decorators), pass an `adapter` that targets the
 * specific call shape — the generic Proxy is the fallback, not the only
 * option.
 */

import {
  type AloyConfig,
  type AloyConfigInput,
  AloyConfigSchema,
  loadConfigFromEnv,
} from "./config.js";
import { PolicyViolationError } from "./errors.js";
import { type ToolCallEvent, ToolCallEventSchema } from "./events.js";
import { Redactor } from "./redact.js";
import { scoreEvent } from "./risk.js";
import { Transport, type TransportStats } from "./transport.js";
import { VERSION } from "./version.js";

export interface AdapterContext {
  readonly client: AloyClient;
  /**
   * Capture an observation around `run`. Returns whatever `run` returns
   * (sync result or promise). Throws `PolicyViolationError` *before* run is
   * invoked when the call would exceed the configured block threshold.
   */
  observe<T>(toolName: string, args: unknown, run: () => T | Promise<T>): T | Promise<T>;
}

export interface Adapter<TIn, TOut = TIn> {
  wrap(target: TIn, ctx: AdapterContext): TOut;
}

export interface AloyClientDeps {
  transport?: Transport;
}

export interface WatchOptions<TIn, TOut = TIn> {
  adapter?: Adapter<TIn, TOut>;
}

export class AloyClient {
  readonly config: AloyConfig;
  readonly redactor: Redactor;
  readonly transport: Transport;
  private readonly ownsTransport: boolean;

  constructor(input: AloyConfigInput | AloyConfig = {}, deps: AloyClientDeps = {}) {
    this.config = AloyConfigSchema.parse(input);
    this.redactor = new Redactor(this.config.redaction.extraPatterns);
    if (deps.transport) {
      this.transport = deps.transport;
      this.ownsTransport = false;
    } else {
      this.transport = new Transport({
        apiUrl: this.config.apiUrl,
        apiKey: this.config.apiKey,
        queueSize: this.config.queueSize,
        batchSize: this.config.batchSize,
        flushIntervalMs: this.config.flushIntervalMs,
        maxRetries: this.config.maxRetries,
      });
      this.ownsTransport = true;
    }
  }

  static fromEnv(overrides: Partial<AloyConfigInput> = {}): AloyClient {
    return new AloyClient(loadConfigFromEnv(process.env, overrides));
  }

  watch<TIn extends object, TOut extends object = TIn>(
    target: TIn,
    options: WatchOptions<TIn, TOut> = {},
  ): TOut {
    const ctx: AdapterContext = {
      client: this,
      observe: (name, args, run) => this.observe(name, args, run),
    };
    if (options.adapter) {
      return options.adapter.wrap(target, ctx);
    }
    return this.proxyWrap(target) as unknown as TOut;
  }

  /**
   * The default proxy wrapper. Intercepts every method call and routes it
   * through `observe`. Non-callable property access passes straight
   * through (so `client.constant === target.constant`).
   */
  private proxyWrap<T extends object>(target: T): T {
    const self = this;
    return new Proxy(target, {
      get(t, prop, receiver) {
        const value = Reflect.get(t, prop, receiver);
        if (typeof value !== "function") return value;
        const name = String(prop);
        return function wrapped(this: unknown, ...args: unknown[]) {
          return self.observe(name, args, () => Reflect.apply(value, t, args) as unknown);
        };
      },
    });
  }

  /**
   * Observe a single call. Always synchronous up to the moment we invoke
   * `run`; if `run` returns a promise we attach observers and propagate.
   */
  observe<T>(toolName: string, args: unknown, run: () => T | Promise<T>): T | Promise<T> {
    const startedAt = new Date();
    const t0 = nowMs();
    const redactedArgs = this.safeRedact(args);
    const riskScore = this.safeScore(toolName, redactedArgs);

    if (riskScore >= this.config.blockThreshold) {
      this.capture({
        toolName,
        args: redactedArgs,
        result: null,
        error: null,
        riskScore,
        blocked: true,
        startedAt,
        durationMs: 0,
      });
      throw new PolicyViolationError({
        toolName,
        riskScore,
        threshold: this.config.blockThreshold,
      });
    }

    let out: T | Promise<T>;
    try {
      out = run();
    } catch (err) {
      this.capture({
        toolName,
        args: redactedArgs,
        result: undefined,
        error: err,
        riskScore,
        blocked: false,
        startedAt,
        durationMs: Math.max(0, Math.round(nowMs() - t0)),
      });
      throw err;
    }

    if (isThenable(out)) {
      return Promise.resolve(out).then(
        (value) => {
          this.capture({
            toolName,
            args: redactedArgs,
            result: value,
            error: null,
            riskScore,
            blocked: false,
            startedAt,
            durationMs: Math.max(0, Math.round(nowMs() - t0)),
          });
          return value;
        },
        (err) => {
          this.capture({
            toolName,
            args: redactedArgs,
            result: undefined,
            error: err,
            riskScore,
            blocked: false,
            startedAt,
            durationMs: Math.max(0, Math.round(nowMs() - t0)),
          });
          throw err;
        },
      );
    }

    this.capture({
      toolName,
      args: redactedArgs,
      result: out,
      error: null,
      riskScore,
      blocked: false,
      startedAt,
      durationMs: Math.max(0, Math.round(nowMs() - t0)),
    });
    return out;
  }

  flush(): Promise<void> {
    return this.transport.flush();
  }

  stats(): TransportStats {
    try {
      return this.transport.getStats();
    } catch {
      return { queued: 0, sent: 0, failed: 0, dropped: 0, retries: 0 };
    }
  }

  async close(): Promise<void> {
    if (this.ownsTransport) {
      await this.transport.close();
    } else {
      await this.transport.flush();
    }
  }

  // --- internals --------------------------------------------------------

  private safeRedact(value: unknown): unknown {
    try {
      return this.redactor.redact(value);
    } catch {
      return value;
    }
  }

  private safeScore(toolName: string, args: unknown): number {
    try {
      return scoreEvent(toolName, args, { networkAllowlist: this.config.networkAllowlist });
    } catch {
      return 0;
    }
  }

  private capture(c: {
    toolName: string;
    args: unknown;
    result: unknown;
    error: unknown;
    riskScore: number;
    blocked: boolean;
    startedAt: Date;
    durationMs: number;
  }): void {
    if (!this.config.enabled) return;
    try {
      const redactedResult = c.error ? null : this.safeRedact(c.result);
      const event: ToolCallEvent = ToolCallEventSchema.parse({
        project: this.config.project,
        agentId: this.config.agentId,
        toolName: c.toolName,
        args: toRecord(c.args),
        result: redactedResult ?? null,
        error: c.error ? formatError(c.error) : null,
        startedAt: c.startedAt.toISOString(),
        durationMs: c.durationMs,
        riskScore: c.riskScore,
        blocked: c.blocked,
        sdkVersion: VERSION,
      });
      this.transport.enqueue(event);
    } catch {
      // never throw from observation
    }
  }
}

let defaultInstance: AloyClient | undefined;

/** Lazy module-level default client built from env vars. */
function getDefaultClient(): AloyClient {
  if (!defaultInstance) defaultInstance = AloyClient.fromEnv();
  return defaultInstance;
}

/** Test-only hook: drop the cached default client. */
export function _resetDefaultClient(): void {
  if (defaultInstance) {
    void defaultInstance.close().catch(() => {});
  }
  defaultInstance = undefined;
}

/**
 * Module-level convenience wrapper. Builds a default `AloyClient` from env
 * vars on first call. Pass `client` to override.
 */
export function watch<TIn extends object, TOut extends object = TIn>(
  target: TIn,
  options: WatchOptions<TIn, TOut> & { client?: AloyClient } = {},
): TOut {
  const { client = getDefaultClient(), ...watchOpts } = options;
  return client.watch<TIn, TOut>(target, watchOpts);
}

// --- helpers ---------------------------------------------------------------

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function isThenable<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function toRecord(args: unknown): Record<string, unknown> {
  if (Array.isArray(args)) return { args };
  if (args && typeof args === "object") return args as Record<string, unknown>;
  if (args === undefined) return {};
  return { value: args };
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.name && err.name !== "Error" ? `${err.name}: ${err.message}` : err.message;
  }
  return String(err);
}
