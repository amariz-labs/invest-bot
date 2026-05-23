// Data adapter selector. Two slots — `realtime` (intraday quotes + streaming)
// and `historical` (daily bars + backtest data) — because the cheapest
// production stack splits these (Polygon for live, yfinance for history).
// See PLATFORM-INTEGRATIONS.md.

import type { DataAdapter, Bar, Quote, SymbolInfo, ConnectionStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Placeholder data adapter — deterministic, no network. Bars are a simple
// sine-wave-ish synthetic series so the UDF endpoint returns something
// chartable without any API keys.
// ---------------------------------------------------------------------------

class PlaceholderDataAdapter implements DataAdapter {
  readonly name = "placeholder";
  readonly tier = "free" as const;

  async getBars(opts: {
    symbol: string;
    resolution: string;
    from: number;
    to: number;
    extendedHours?: boolean;
  }): Promise<Bar[]> {
    // Generate ~1 bar per day in the requested range. Deterministic per symbol.
    const seed = Array.from(opts.symbol).reduce((a, c) => a + c.charCodeAt(0), 0);
    const out: Bar[] = [];
    const stepSec = opts.resolution === "D" ? 86_400 : opts.resolution === "W" ? 604_800 : 3_600;
    for (let t = opts.from; t < opts.to; t += stepSec) {
      const phase = ((t / stepSec) % 60) / 60; // 0..1
      const wave = Math.sin(phase * Math.PI * 2 + seed) * 5;
      const base = 100 + (seed % 50) + wave;
      const open = base;
      const close = base + (Math.sin(phase * Math.PI * 4 + seed) * 1.5);
      const high = Math.max(open, close) + Math.abs(wave) * 0.4;
      const low = Math.min(open, close) - Math.abs(wave) * 0.4;
      out.push({
        time: t,
        open: round(open),
        high: round(high),
        low: round(low),
        close: round(close),
        volume: Math.floor(500_000 + Math.abs(wave) * 50_000),
      });
    }
    return out;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const seed = Array.from(symbol).reduce((a, c) => a + c.charCodeAt(0), 0);
    const mid = 100 + (seed % 50);
    return {
      symbol,
      bid: round(mid - 0.05),
      bidSize: 100,
      ask: round(mid + 0.05),
      askSize: 100,
      last: round(mid),
      timestamp: Date.now(),
      session: "rth",
    };
  }

  streamQuotes(_symbols: string[], _handler: (q: Quote) => void): () => void {
    // Placeholder — wire up WebSocket in concrete adapter.
    return () => { /* no-op */ };
  }

  async getSymbol(symbol: string): Promise<SymbolInfo> {
    return {
      symbol,
      name: `${symbol} (placeholder)`,
      type: "stock",
      exchange: "NASDAQ",
      currency: "USD",
      timezone: "America/New_York",
      hasIntraday: true,
      minTick: 0.01,
      pricescale: 100,
      session: "0930-1600:23456",
    };
  }

  async search(
    query: string,
    opts: { type?: SymbolInfo["type"]; limit?: number } = {},
  ): Promise<SymbolInfo[]> {
    if (!query) return [];
    const upper = query.toUpperCase();
    const samples = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "SPY", "QQQ", "IWM"];
    return samples
      .filter((s) => s.startsWith(upper))
      .slice(0, opts.limit ?? 10)
      .map((s) => ({
        symbol: s,
        name: `${s} (placeholder)`,
        type: opts.type ?? "stock",
        exchange: "NASDAQ",
        currency: "USD",
        timezone: "America/New_York",
        hasIntraday: true,
        minTick: 0.01,
        pricescale: 100,
        session: "0930-1600:23456",
      }));
  }

  async ping() {
    return { ok: true as const, latencyMs: 0 };
  }

  // Intentional placeholder behavior: we emit a single "connected" event
  // synchronously and never change state. Concrete adapters (Polygon,
  // TwelveData, YFinance) replace this with real WS / REST heartbeat
  // logic — see design/code/adapters/README.md "Connection status protocol".
  // Returning a no-op unsubscribe keeps the consumer cleanup path uniform.
  subscribeStatus(handler: (s: ConnectionStatus) => void): () => void {
    const status: ConnectionStatus = { state: "connected", since: Date.now() };
    try { handler(status); } catch { /* ignore handler errors */ }
    return () => { /* no-op — placeholder never transitions */ };
  }

  // Placeholder: every symbol is "freshly ticked right now". The real
  // adapter tracks the unix-ms timestamp of each incoming quote.
  lastTickAt(_symbol: string): number | null {
    return Date.now();
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function selectRealtime(): DataAdapter {
  // TODO: dynamic-import `./adapters/polygon` when POLYGON_API_KEY is present.
  // For now we always return the deterministic placeholder so dev works offline.
  if (process.env.POLYGON_API_KEY) {
    // TODO: replace with `new PolygonDataAdapter({ apiKey: process.env.POLYGON_API_KEY })`
  }
  return new PlaceholderDataAdapter();
}

function selectHistorical(): DataAdapter {
  // TODO: dynamic-import `./adapters/yfinance` (no key required).
  return new PlaceholderDataAdapter();
}

export const data = {
  realtime: selectRealtime(),
  historical: selectHistorical(),
};
