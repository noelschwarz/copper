/**
 * Bounded, drop-on-overflow event shipper.
 *
 * Holds an in-memory queue (default size 1000). A background flusher fires
 * every `flushIntervalMs` (default 1s) or whenever the queue reaches
 * `batchSize` (default 50), whichever comes first. Batches POST to
 * `${apiUrl}/v1/events/batch`. On overflow we drop the *oldest* event
 * (so the queue never starves on bursts) and bump a counter.
 *
 * Retries: 250ms, 1s, 4s exponential. We only retry network errors and 5xx
 * (plus 429); any other 4xx means the server has rejected our payload and
 * retrying is pointless. Past `maxRetries`, the batch is dropped and
 * `failed` is incremented. We never throw on network failure — at most we
 * emit one warn log per minute via the throttled logger.
 */

import type { ToolCallEvent } from "./events.js";
import { VERSION } from "./version.js";

export interface TransportLogger {
  warn: (msg: string) => void;
}

export interface TransportOptions {
  apiUrl: string;
  apiKey?: string;
  queueSize?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  logger?: TransportLogger;
  retryDelaysMs?: ReadonlyArray<number>;
  /** Disable `process.on("beforeExit")` registration (useful in tests). */
  disableShutdownHook?: boolean;
}

export interface TransportStats {
  queued: number;
  sent: number;
  failed: number;
  dropped: number;
  retries: number;
}

const DEFAULT_RETRY_DELAYS = [250, 1_000, 4_000];

export class Transport {
  readonly apiUrl: string;
  private readonly apiKey: string | undefined;
  private readonly queueSize: number;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryDelays: ReadonlyArray<number>;
  private readonly fetchImpl: typeof fetch;
  private readonly logger: TransportLogger;

  private readonly queue: ToolCallEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private closed = false;
  private warnAtMs = 0;
  private statsState: TransportStats = {
    queued: 0,
    sent: 0,
    failed: 0,
    dropped: 0,
    retries: 0,
  };
  private beforeExitHandler: (() => void) | undefined;

  constructor(opts: TransportOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.queueSize = opts.queueSize ?? 1_000;
    this.batchSize = opts.batchSize ?? 50;
    this.flushIntervalMs = opts.flushIntervalMs ?? 1_000;
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.logger = opts.logger ?? { warn: (m) => console.warn(`[aloy] ${m}`) };

    this.startTimer();
    if (!opts.disableShutdownHook) this.installShutdownHook();
  }

  enqueue(event: ToolCallEvent): void {
    if (this.closed) return;
    if (this.queue.length >= this.queueSize) {
      this.queue.shift();
      this.statsState.dropped++;
    }
    this.queue.push(event);
    this.statsState.queued = this.queue.length;
    if (this.queue.length >= this.batchSize) {
      void this.flush().catch(() => {});
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.queue.length === 0) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);
        this.statsState.queued = this.queue.length;
        const ok = await this.send(batch);
        if (ok) {
          this.statsState.sent += batch.length;
        } else {
          this.statsState.failed += batch.length;
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.beforeExitHandler) {
      try {
        process.off("beforeExit", this.beforeExitHandler);
      } catch {
        // not installed; ignore
      }
      this.beforeExitHandler = undefined;
    }
    try {
      await this.flush();
    } catch {
      // never throw on close
    }
  }

  getStats(): TransportStats {
    return { ...this.statsState, queued: this.queue.length };
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      void this.flush().catch((err) => this.warn(`flush failed: ${String(err)}`));
    }, this.flushIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  private installShutdownHook(): void {
    this.beforeExitHandler = () => {
      void this.flush().catch(() => {});
    };
    try {
      process.on("beforeExit", this.beforeExitHandler);
    } catch {
      this.beforeExitHandler = undefined;
    }
  }

  private async send(batch: ToolCallEvent[]): Promise<boolean> {
    const url = `${this.apiUrl}/v1/events/batch`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": `aloy-js/${VERSION}`,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
    const body = JSON.stringify({ events: batch });

    const attempts = Math.max(1, this.maxRetries);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const resp = await this.fetchImpl(url, { method: "POST", headers, body });
        if (resp.ok) return true;
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 429) {
          this.warn(`server rejected batch with status ${resp.status}; not retrying`);
          return false;
        }
      } catch (err) {
        // Network error — retry.
        this.warn(`network error: ${String(err)}`);
      }
      if (attempt + 1 < attempts) {
        this.statsState.retries++;
        const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)] ?? 4_000;
        await sleep(delay);
      }
    }
    return false;
  }

  private warn(msg: string): void {
    const now = Date.now();
    if (now - this.warnAtMs < 60_000) return;
    this.warnAtMs = now;
    try {
      this.logger.warn(msg);
    } catch {
      // logger explosion never propagates
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
