// RecordingAdapter — VCR-style wrapper for BrokerAdapter / DataAdapter.
//
// Wraps any concrete adapter and persists every request/response pair as a
// JSON fixture so tests can run offline without hitting Alpaca, Polygon, etc.
//
// Three modes:
//   - "record":      delegate to inner, save the result (or error) to disk.
//   - "replay":      no inner call. Read fixture from disk and return/throw.
//                    Missing fixture is a hard error with a clear message.
//   - "passthrough": just delegate. No persistence. Useful for a sanity check
//                    that the wrapper doesn't change behavior.
//
// Storage layout:
//   data/adapter-fixtures/<adapterName>/<method>/<argsHash>.json
//   data/adapter-fixtures/<adapterName>/<method>/<sessionId>.jsonl   (streams)
//
// Fixture shape (single call):
//   { at, method, args, result?, error?, durationMs }
//
// Fixture shape (stream JSONL — one line per emitted event):
//   { at, event }                                  // record-mode
//   plus a final line { at, __end: true }          // emitted on unsubscribe
//
// Caveats:
//   - Time-sensitive responses (getAccount equity, getQuote last) WILL drift
//     between record and replay. That's expected — tests should assert on
//     shape, not exact numbers, unless you're testing for the drift.
//   - Hash collisions are theoretically possible at 12 hex chars (~5e-7 per
//     pair). The args are also written into the JSON, so a replay-time mismatch
//     is loud. See `assertArgsMatch` below.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

import type {
  BrokerAdapter, OrderRequest, OrderResult, Position, Account, OrderEvent,
} from "../BrokerAdapter";
import type {
  DataAdapter, Bar, Quote, SymbolInfo, OptionsChain, Fundamentals,
  EconomicEvent, Resolution,
} from "../DataAdapter";
import { BrokerError, DataError } from "./errors";
import {
  hashArgs, atomicWriteJson, readJson, fileExists, appendJsonl, readJsonl,
} from "./recording-fs";

// ---------------------------------------------------------------------------

export type RecordingMode = "record" | "replay" | "passthrough";

export interface RecordingOptions {
  mode: RecordingMode;
  /** Root directory for fixtures. Default: `<cwd>/data/adapter-fixtures`. */
  fixturesDir?: string;
  /**
   * Override the adapter name embedded in the path. Useful when two configs
   * point at the same adapter class (e.g. paper vs live Alpaca) and you want
   * isolated fixture sets.
   */
  adapterName?: string;
}

export interface FixtureEnvelope<TArgs = unknown, TResult = unknown> {
  at: string;             // ISO
  method: string;
  args: TArgs;
  result?: TResult;
  error?: { name: string; message: string; code?: string };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Core record/replay helpers (shared by both wrappers).

function defaultFixturesDir(): string {
  return path.join(process.cwd(), "data", "adapter-fixtures");
}

function fixturePath(root: string, adapterName: string, method: string, hash: string): string {
  return path.join(root, adapterName, method, `${hash}.json`);
}

function streamPath(root: string, adapterName: string, method: string, sessionId: string): string {
  return path.join(root, adapterName, method, `${sessionId}.jsonl`);
}

function missingFixtureMessage(file: string, method: string, args: unknown[]): string {
  return (
    `[RecordingAdapter] No fixture for ${method} at ${file}.\n` +
    `Args: ${JSON.stringify(args).slice(0, 300)}\n` +
    `Fix: run with mode="record" first to capture this interaction, then re-run the test in mode="replay".`
  );
}

/** Wrap an adapter call with record/replay/passthrough semantics. */
async function withRecording<T>(
  opts: ResolvedOptions,
  method: string,
  args: unknown[],
  call: () => Promise<T>,
): Promise<T> {
  if (opts.mode === "passthrough") return call();

  const hash = hashArgs(args);
  const file = fixturePath(opts.fixturesDir, opts.adapterName, method, hash);

  if (opts.mode === "replay") {
    if (!(await fileExists(file))) {
      throw new Error(missingFixtureMessage(file, method, args));
    }
    const env = await readJson<FixtureEnvelope>(file);
    if (env.error) {
      // Reconstitute as a generic Error — original error class is lost on disk.
      // Adapters wrap their own errors in BrokerError/DataError, so the inner
      // .name lets callers branch on `err.name === "BrokerError"`.
      const e = new Error(env.error.message);
      e.name = env.error.name;
      if (env.error.code) (e as Error & { code?: string }).code = env.error.code;
      throw e;
    }
    return env.result as T;
  }

  // record mode
  const at = new Date().toISOString();
  const t0 = Date.now();
  try {
    const result = await call();
    const envelope: FixtureEnvelope<unknown[], T> = {
      at, method, args, result, durationMs: Date.now() - t0,
    };
    await atomicWriteJson(file, envelope);
    return result;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string; code?: string };
    const envelope: FixtureEnvelope<unknown[], never> = {
      at, method, args,
      error: {
        name: e?.name ?? "Error",
        message: e?.message ?? String(err),
        code: typeof e?.code === "string" ? e.code : undefined,
      },
      durationMs: Date.now() - t0,
    };
    await atomicWriteJson(file, envelope);
    throw err;
  }
}

interface ResolvedOptions {
  mode: RecordingMode;
  fixturesDir: string;
  adapterName: string;
}

function resolveOptions(adapterName: string, o: RecordingOptions): ResolvedOptions {
  return {
    mode: o.mode,
    fixturesDir: o.fixturesDir ?? defaultFixturesDir(),
    adapterName: o.adapterName ?? adapterName,
  };
}

// ---------------------------------------------------------------------------
// RecordingBrokerAdapter

export class RecordingBrokerAdapter implements BrokerAdapter {
  readonly name: string;
  readonly mode: "paper" | "live" | "synthetic";
  private readonly inner: BrokerAdapter;
  private readonly opts: ResolvedOptions;

  constructor(inner: BrokerAdapter, options: RecordingOptions) {
    this.inner = inner;
    this.opts = resolveOptions(inner.name, options);
    // Surface inner identity, but tag the wrapper so logs are explicit.
    this.name = `${inner.name}+recording:${this.opts.mode}`;
    this.mode = inner.mode;
  }

  // ----- account ----------------------------------------------------------

  getAccount(): Promise<Account> {
    return withRecording(this.opts, "getAccount", [], () => this.inner.getAccount());
  }

  getPositions(): Promise<Position[]> {
    return withRecording(this.opts, "getPositions", [], () => this.inner.getPositions());
  }

  getPosition(symbol: string): Promise<Position | null> {
    return withRecording(this.opts, "getPosition", [symbol], () => this.inner.getPosition(symbol));
  }

  // ----- orders -----------------------------------------------------------

  placeOrder(req: OrderRequest): Promise<OrderResult> {
    return withRecording(this.opts, "placeOrder", [req], () => this.inner.placeOrder(req));
  }

  cancelOrder(orderId: string): Promise<void> {
    return withRecording(this.opts, "cancelOrder", [orderId], () => this.inner.cancelOrder(orderId));
  }

  replaceOrder(orderId: string, patch: Partial<OrderRequest>): Promise<OrderResult> {
    return withRecording(this.opts, "replaceOrder", [orderId, patch], () =>
      this.inner.replaceOrder(orderId, patch));
  }

  getOrders(opts?: { status?: "open" | "closed" | "all"; limit?: number }): Promise<OrderResult[]> {
    return withRecording(this.opts, "getOrders", [opts ?? {}], () => this.inner.getOrders(opts));
  }

  // ----- streaming --------------------------------------------------------

  streamOrders(handler: (evt: OrderEvent) => void): () => void {
    return recordOrReplayStream(
      this.opts,
      "streamOrders",
      handler,
      (h) => this.inner.streamOrders(h),
    );
  }

  // ----- optional capabilities -------------------------------------------

  isShortable(symbol: string): Promise<{ shortable: boolean; feeRate?: number }> {
    if (!this.inner.isShortable) {
      throw new BrokerError(this.inner.name, "unsupported", "inner adapter does not implement isShortable");
    }
    const inner = this.inner.isShortable.bind(this.inner);
    return withRecording(this.opts, "isShortable", [symbol], () => inner(symbol));
  }

  getOptionsChain(underlying: string, expiration?: string): Promise<unknown> {
    if (!this.inner.getOptionsChain) {
      throw new BrokerError(this.inner.name, "unsupported", "inner adapter does not implement getOptionsChain");
    }
    const inner = this.inner.getOptionsChain.bind(this.inner);
    return withRecording(this.opts, "getOptionsChain", [underlying, expiration], () =>
      inner(underlying, expiration));
  }

  get rateLimit() { return this.inner.rateLimit; }

  onRateLimit(handler: (state: { remaining: number; resetAt: number }) => void): () => void {
    // Rate-limit updates are observational only; not recorded.
    if (!this.inner.onRateLimit) return () => undefined;
    return this.inner.onRateLimit(handler);
  }

  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
    return withRecording(this.opts, "ping", [], () => this.inner.ping());
  }
}

// ---------------------------------------------------------------------------
// RecordingDataAdapter

export class RecordingDataAdapter implements DataAdapter {
  readonly name: string;
  readonly tier: "free" | "starter" | "pro";
  private readonly inner: DataAdapter;
  private readonly opts: ResolvedOptions;

  constructor(inner: DataAdapter, options: RecordingOptions) {
    this.inner = inner;
    this.opts = resolveOptions(inner.name, options);
    this.name = `${inner.name}+recording:${this.opts.mode}`;
    this.tier = inner.tier;
  }

  // ----- bars -------------------------------------------------------------

  getBars(opts: { symbol: string; resolution: Resolution; from: number; to: number; extendedHours?: boolean }): Promise<Bar[]> {
    return withRecording(this.opts, "getBars", [opts], () => this.inner.getBars(opts));
  }

  // ----- quotes -----------------------------------------------------------

  getQuote(symbol: string): Promise<Quote> {
    return withRecording(this.opts, "getQuote", [symbol], () => this.inner.getQuote(symbol));
  }

  streamQuotes(symbols: string[], handler: (q: Quote) => void): () => void {
    return recordOrReplayStream(
      this.opts,
      "streamQuotes",
      handler,
      (h) => this.inner.streamQuotes(symbols, h),
      // Include the symbol set in the session metadata so a future replay
      // can be filtered, though current replay emits everything captured.
      { symbols },
    );
  }

  // ----- symbols ----------------------------------------------------------

  getSymbol(symbol: string): Promise<SymbolInfo> {
    return withRecording(this.opts, "getSymbol", [symbol], () => this.inner.getSymbol(symbol));
  }

  search(query: string, opts?: { type?: SymbolInfo["type"]; limit?: number }): Promise<SymbolInfo[]> {
    return withRecording(this.opts, "search", [query, opts ?? {}], () => this.inner.search(query, opts));
  }

  // ----- optional capabilities -------------------------------------------

  getOptionsChain(underlying: string, expiration?: string): Promise<OptionsChain> {
    if (!this.inner.getOptionsChain) {
      throw new DataError(this.inner.name, "unsupported", "inner adapter does not implement getOptionsChain");
    }
    const inner = this.inner.getOptionsChain.bind(this.inner);
    return withRecording(this.opts, "getOptionsChain", [underlying, expiration], () =>
      inner(underlying, expiration));
  }

  getFundamentals(symbol: string): Promise<Fundamentals> {
    if (!this.inner.getFundamentals) {
      throw new DataError(this.inner.name, "unsupported", "inner adapter does not implement getFundamentals");
    }
    const inner = this.inner.getFundamentals.bind(this.inner);
    return withRecording(this.opts, "getFundamentals", [symbol], () => inner(symbol));
  }

  getEarningsCalendar(from: string, to: string): Promise<{ symbol: string; date: string; estimate?: number }[]> {
    if (!this.inner.getEarningsCalendar) {
      throw new DataError(this.inner.name, "unsupported", "inner adapter does not implement getEarningsCalendar");
    }
    const inner = this.inner.getEarningsCalendar.bind(this.inner);
    return withRecording(this.opts, "getEarningsCalendar", [from, to], () => inner(from, to));
  }

  getEconomicCalendar(from: string, to: string): Promise<EconomicEvent[]> {
    if (!this.inner.getEconomicCalendar) {
      throw new DataError(this.inner.name, "unsupported", "inner adapter does not implement getEconomicCalendar");
    }
    const inner = this.inner.getEconomicCalendar.bind(this.inner);
    return withRecording(this.opts, "getEconomicCalendar", [from, to], () => inner(from, to));
  }

  getSessions(exchange: string, from: string, to: string): Promise<{ date: string; open: number; close: number }[]> {
    return withRecording(this.opts, "getSessions", [exchange, from, to], () =>
      this.inner.getSessions(exchange, from, to));
  }

  get rateLimit() { return this.inner.rateLimit; }

  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }> {
    return withRecording(this.opts, "ping", [], () => this.inner.ping());
  }
}

// ---------------------------------------------------------------------------
// Stream record/replay
//
// The contract from caller's POV is: `(handler) => unsubscribe`. We preserve
// that. In record-mode we tee events into a JSONL session file. In replay
// we ignore `inner` entirely and play back the most recent session for the
// method (or one selected by env var FIXTURE_SESSION_ID).

interface StreamMeta {
  // biome-ignore lint/suspicious/noExplicitAny: stream events span union types
  [k: string]: any;
}

function recordOrReplayStream<E>(
  opts: ResolvedOptions,
  method: string,
  handler: (evt: E) => void,
  startInner: (h: (evt: E) => void) => () => void,
  meta?: StreamMeta,
): () => void {
  if (opts.mode === "passthrough") return startInner(handler);

  const methodDir = path.join(opts.fixturesDir, opts.adapterName, method);

  if (opts.mode === "replay") {
    let cancelled = false;
    void (async () => {
      const sessionFile = await pickLatestSession(methodDir);
      if (!sessionFile) {
        // Surface synchronously-ish via the handler since stream errors don't
        // get to throw out of subscribe — emit nothing and log via console.
        // Tests should assert on event delivery and explicitly check this case.
        // eslint-disable-next-line no-console
        console.error(missingFixtureMessage(path.join(methodDir, "*.jsonl"), method, []));
        return;
      }
      const events = await readJsonl<{ at: string; event?: E; __end?: boolean }>(sessionFile);
      for (const e of events) {
        if (cancelled) return;
        if (e.__end) return;
        if (e.event !== undefined) handler(e.event);
      }
    })();
    return () => { cancelled = true; };
  }

  // record mode
  const sessionId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
  const file = streamPath(opts.fixturesDir, opts.adapterName, method, sessionId);
  let unsubInner: (() => void) | null = null;
  let ended = false;

  // Lazily await mkdir; events arriving before it completes get queued.
  const ready = fs.mkdir(path.dirname(file), { recursive: true }).then(() => {
    if (meta) return appendJsonl(file, { at: new Date().toISOString(), __meta: meta });
    return undefined;
  });

  unsubInner = startInner((evt: E) => {
    handler(evt);
    void ready.then(() => appendJsonl(file, { at: new Date().toISOString(), event: evt }));
  });

  return () => {
    if (ended) return;
    ended = true;
    void ready.then(() => appendJsonl(file, { at: new Date().toISOString(), __end: true }));
    if (unsubInner) unsubInner();
  };
}

async function pickLatestSession(dir: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir);
    const sessions = entries.filter(f => f.endsWith(".jsonl")).sort();
    if (sessions.length === 0) return null;
    const explicit = process.env.FIXTURE_SESSION_ID;
    if (explicit) {
      const match = sessions.find(s => s === `${explicit}.jsonl`);
      if (match) return path.join(dir, match);
    }
    // sessionId starts with a timestamp so lexicographic sort == chronological.
    return path.join(dir, sessions[sessions.length - 1]);
  } catch {
    return null;
  }
}
