// Abstract market-data interface. Powers the UDF endpoint for TradingView
// Charting Library, the hero chart, screeners, and any backtest.
// See ../PLATFORM-INTEGRATIONS.md for rationale.

export type Resolution = "1" | "5" | "15" | "30" | "60" | "240" | "D" | "W" | "M";

export interface Bar {
  time: number;          // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  last: number;
  timestamp: number;     // unix ms
  session?: "pre" | "rth" | "post" | "closed";
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  type: "stock" | "etf" | "index" | "futures" | "forex" | "crypto" | "option";
  exchange: string;
  currency: string;
  timezone: string;          // e.g. "America/New_York"
  hasIntraday: boolean;
  minTick: number;           // e.g. 0.01
  pricescale: number;        // e.g. 100 for 2-decimal precision
  session: string;           // TV format: "0930-1600:23456"
  marginable?: boolean;
  shortable?: boolean;
  optionable?: boolean;
}

export interface OptionsChain {
  underlying: string;
  expirations: string[];                  // ISO dates
  contracts: OptionContract[];
}

export interface OptionContract {
  symbol: string;                          // OCC symbol
  underlying: string;
  expiration: string;
  strike: number;
  right: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  iv?: number;                             // implied vol
}

export interface Fundamentals {
  symbol: string;
  marketCap: number;
  shares: number;
  float?: number;
  shortInterest?: number;
  beta?: number;
  pe?: number;
  forwardPe?: number;
  eps?: number;
  dividendYield?: number;
  nextEarningsDate?: string;
  sector?: string;
  industry?: string;
}

export interface EconomicEvent {
  id: string;
  date: string;                            // ISO
  release: string;                         // "CPI", "FOMC Rate Decision"
  country: string;
  impact: "low" | "med" | "high";
  actual?: string;
  consensus?: string;
  previous?: string;
}

// ---------------------------------------------------------------------------
// Connection status — see adapters/README.md "Connection status protocol".
// `since` is the unix-ms timestamp the adapter entered the current state.
// `lastTickAt` is the unix-ms timestamp of the most recent quote on any
// subscribed symbol (only meaningful while connected/stale). `attempts`
// counts reconnect tries in the current burst. `error` is the last error
// surfaced from the WS or REST layer when disconnected.
// ---------------------------------------------------------------------------
export type ConnectionStatus =
  | { state: "connected"; since: number }
  | { state: "reconnecting"; since: number; attempts: number }
  | { state: "stale"; since: number; lastTickAt?: number }
  | { state: "disconnected"; since: number; error?: string };

export interface DataAdapter {
  readonly name: string;
  readonly tier: "free" | "starter" | "pro";

  // OHLCV
  getBars(opts: {
    symbol: string;
    resolution: Resolution;
    from: number;       // unix seconds
    to: number;         // unix seconds
    extendedHours?: boolean;
  }): Promise<Bar[]>;

  // Quotes
  getQuote(symbol: string): Promise<Quote>;
  streamQuotes(
    symbols: string[],
    handler: (q: Quote) => void
  ): () => void;                            // unsubscribe

  // Symbol metadata
  getSymbol(symbol: string): Promise<SymbolInfo>;
  search(query: string, opts?: { type?: SymbolInfo["type"]; limit?: number }): Promise<SymbolInfo[]>;

  // Optional capabilities (return null / throw if unsupported)
  getOptionsChain?(underlying: string, expiration?: string): Promise<OptionsChain>;
  getFundamentals?(symbol: string): Promise<Fundamentals>;
  getEarningsCalendar?(from: string, to: string): Promise<{ symbol: string; date: string; estimate?: number }[]>;
  getEconomicCalendar?(from: string, to: string): Promise<EconomicEvent[]>;

  // Market hours
  getSessions(exchange: string, from: string, to: string): Promise<{ date: string; open: number; close: number }[]>;

  // Rate limits
  readonly rateLimit?: { limit: number; remaining: number; resetAt: number };

  // Health
  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;

  // Connection status channel. Handlers receive the current status
  // synchronously on subscribe (so a UI mounting mid-session doesn't sit
  // blank), then every subsequent state transition. Returns an unsubscribe
  // function. Adapters that have no real connection (e.g. pure REST) should
  // still emit "connected" / "stale" based on REST heartbeats.
  subscribeStatus(handler: (s: ConnectionStatus) => void): () => void;

  // Per-symbol last-tick timestamp (unix ms). Returns null if the adapter
  // has never observed a quote for this symbol. Used by consumers to dim
  // rows that have gone quiet relative to the rest of the table.
  lastTickAt(symbol: string): number | null;
}

// True if the connection is in a non-healthy state — `reconnecting`,
// `stale`, `disconnected`, or `connected` but the latest tick predates
// `maxQuietMs`. `maxQuietMs` defaults to 15s, matching the watchlist
// staleness threshold. Callers using REST-only adapters should pass a
// larger window (e.g. 60_000) since polling intervals are longer.
export function isStale(status: ConnectionStatus, maxQuietMs = 15_000): boolean {
  if (status.state === "reconnecting" || status.state === "disconnected") return true;
  if (status.state === "stale") return true;
  // status.state === "connected"
  // No per-symbol info here — we rely on the adapter to flip to "stale"
  // when its own heartbeat ages out. But if a caller hands us a status
  // with an attached `lastTickAt` (some adapters extend it informally),
  // honour that. The TypeScript shape doesn't carry it; we use a runtime
  // check so the helper remains a single source of truth.
  const maybeLast = (status as { lastTickAt?: number }).lastTickAt;
  if (typeof maybeLast === "number" && Date.now() - maybeLast > maxQuietMs) return true;
  return false;
}

// Convenience: turn a Bar series into a Lightweight Charts CandlestickData[].
export function barsToCandles(bars: Bar[]) {
  return bars.map(b => ({
    time: b.time,
    open: b.open, high: b.high, low: b.low, close: b.close,
  }));
}

export function barsToVolume(bars: Bar[], upColor = "#22C55E66", downColor = "#EF444466") {
  return bars.map(b => ({
    time: b.time,
    value: b.volume,
    color: b.close >= b.open ? upColor : downColor,
  }));
}
