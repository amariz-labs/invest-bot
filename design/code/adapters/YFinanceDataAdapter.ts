// YFinanceDataAdapter — Yahoo Finance via the Python `yfinance` package.
//
// =====================================================================
// IMPORTANT: yfinance is Python-only. This adapter calls a server-side
// /api route on the host application (e.g. `/api/yfinance/bars`) which
// shells out to `python -c "import yfinance ..."` (or runs an FastAPI
// sidecar) and returns JSON.
//
// To wire it up:
//   1) `pip install yfinance pandas` in the project's Python env
//   2) Create the bridge route (Next.js: /api/yfinance/[op]/route.ts) that
//      child_process.spawn("python", ["scripts/yf_bridge.py", op, JSON.stringify(args)])
//   3) Set YF_BRIDGE_URL (default "/api/yfinance") in your env
//
// Without the bridge route this adapter will throw — there is no pure-JS
// yfinance equivalent that hits Yahoo's undocumented endpoints reliably.
// =====================================================================

import {
  DataAdapter, Bar, Quote, SymbolInfo, Resolution, ConnectionStatus,
} from "../DataAdapter";
import { DataError, num } from "./errors";
import { SerialQueue } from "./queue";

// REST-only adapter: each successful call counts as a heartbeat. If the
// bridge goes >60s without a successful call we flip to "stale". On the
// next success we flip back to "connected".
const REST_STALE_MS = 60_000;

export interface YFinanceConfig {
  bridgeUrl?: string;  // default "/api/yfinance"
  // For non-browser runtimes you must pass an absolute base.
  fetchImpl?: typeof fetch;
}

// yfinance interval strings.
const INTERVAL_MAP: Record<Resolution, string> = {
  "1": "1m", "5": "5m", "15": "15m", "30": "30m",
  "60": "60m", "240": "1h", // approx
  "D": "1d", "W": "1wk", "M": "1mo",
};

export class YFinanceDataAdapter implements DataAdapter {
  readonly name = "yfinance";
  readonly tier = "free" as const;
  private bridgeUrl: string;
  private fetchImpl: typeof fetch;
  private queue = new SerialQueue({ minSpacingMs: 200 }); // Yahoo throttles aggressively

  // Connection-status bookkeeping. REST adapters have no real socket —
  // we treat each successful bridge call as a heartbeat and let a single
  // setInterval flip the state to "stale" if calls go quiet.
  private status: ConnectionStatus = { state: "disconnected", since: Date.now() };
  private statusSubscribers = new Set<(s: ConnectionStatus) => void>();
  private lastTickPerSymbol = new Map<string, number>();
  private lastHeartbeat = 0;
  private heartbeatWatcher: ReturnType<typeof setInterval> | null = null;

  constructor(cfg: YFinanceConfig = {}) {
    this.bridgeUrl = cfg.bridgeUrl ?? "/api/yfinance";
    this.fetchImpl = cfg.fetchImpl ?? (globalThis.fetch as typeof fetch);
    if (!this.fetchImpl) throw new DataError("yfinance", "config", "fetch is not available; pass fetchImpl in config");
  }

  // ---- connection status -----------------------------------------------
  subscribeStatus(handler: (s: ConnectionStatus) => void): () => void {
    this.statusSubscribers.add(handler);
    // Lazy-start the heartbeat watcher on first subscribe so adapters
    // created for one-off REST calls don't keep timers alive.
    if (!this.heartbeatWatcher) {
      this.heartbeatWatcher = setInterval(() => {
        if (this.status.state === "connected" &&
            this.lastHeartbeat > 0 &&
            Date.now() - this.lastHeartbeat > REST_STALE_MS) {
          this.setStatus({ state: "stale", since: Date.now(), lastTickAt: this.lastHeartbeat });
        }
      }, 5_000);
    }
    try { handler(this.status); } catch { /* handler owns its errors */ }
    return () => {
      this.statusSubscribers.delete(handler);
      if (this.statusSubscribers.size === 0 && this.heartbeatWatcher) {
        clearInterval(this.heartbeatWatcher);
        this.heartbeatWatcher = null;
      }
    };
  }

  lastTickAt(symbol: string): number | null {
    const t = this.lastTickPerSymbol.get(symbol);
    return typeof t === "number" ? t : null;
  }

  private setStatus(next: ConnectionStatus): void {
    if (next.state === this.status.state) return;
    this.status = next;
    for (const h of this.statusSubscribers) {
      try { h(next); } catch { /* keep going */ }
    }
  }

  private heartbeat(symbol?: string): void {
    const now = Date.now();
    this.lastHeartbeat = now;
    if (symbol) this.lastTickPerSymbol.set(symbol, now);
    if (this.status.state !== "connected") {
      this.setStatus({ state: "connected", since: now });
    }
  }

  async getBars(opts: { symbol: string; resolution: Resolution; from: number; to: number }): Promise<Bar[]> {
    return this.call("getBars", async () => {
      const data = await this.bridge("bars", {
        symbol: opts.symbol,
        interval: INTERVAL_MAP[opts.resolution],
        from: opts.from,
        to: opts.to,
      });
      // Successful REST call = heartbeat for this symbol.
      this.heartbeat(opts.symbol);
      const rows = (data?.bars ?? []) as any[];
      return rows.map(r => ({
        time: num(r.t ?? r.time),
        open: num(r.o ?? r.open),
        high: num(r.h ?? r.high),
        low: num(r.l ?? r.low),
        close: num(r.c ?? r.close),
        volume: num(r.v ?? r.volume),
      }));
    });
  }

  async getQuote(symbol: string): Promise<Quote> {
    return this.call("getQuote", async () => {
      const data = await this.bridge("quote", { symbol });
      this.heartbeat(symbol);
      const q = data?.quote ?? {};
      return {
        symbol,
        bid: num(q.bid),
        bidSize: num(q.bidSize),
        ask: num(q.ask),
        askSize: num(q.askSize),
        last: num(q.last ?? q.regularMarketPrice),
        timestamp: num(q.timestamp) || Date.now(),
      };
    });
  }

  // yfinance has no streaming endpoint — it's HTTP polling against Yahoo's
  // unofficial chart API. We expose a poll-based subscriber so callers can
  // treat it like a stream, but it's NOT real-time.
  streamQuotes(symbols: string[], handler: (q: Quote) => void): () => void {
    let stopped = false;
    const tick = async () => {
      while (!stopped) {
        for (const s of symbols) {
          try { handler(await this.getQuote(s)); } catch { /* keep polling on transient errors */ }
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    };
    tick();
    return () => { stopped = true; };
  }

  async getSymbol(symbol: string): Promise<SymbolInfo> {
    return this.call("getSymbol", async () => {
      const data = await this.bridge("symbol", { symbol });
      const i = data?.info ?? {};
      return {
        symbol: i.symbol ?? symbol,
        name: i.longName ?? i.shortName ?? symbol,
        type: this.mapType(i.quoteType),
        exchange: i.exchange ?? "",
        currency: (i.currency ?? "USD").toUpperCase(),
        timezone: i.exchangeTimezoneName ?? "America/New_York",
        hasIntraday: true,
        minTick: 0.01,
        pricescale: 100,
        session: "0930-1600:23456",
      };
    });
  }

  async search(query: string, opts?: { type?: SymbolInfo["type"]; limit?: number }): Promise<SymbolInfo[]> {
    return this.call("search", async () => {
      const data = await this.bridge("search", { query, limit: opts?.limit ?? 10 });
      const arr = (data?.results ?? []) as any[];
      const mapped = arr.map(r => ({
        symbol: r.symbol,
        name: r.shortname ?? r.longname ?? r.symbol,
        type: this.mapType(r.quoteType),
        exchange: r.exchange ?? "",
        currency: "USD",
        timezone: "America/New_York",
        hasIntraday: true,
        minTick: 0.01,
        pricescale: 100,
        session: "0930-1600:23456",
      }) as SymbolInfo);
      return opts?.type ? mapped.filter(s => s.type === opts.type) : mapped;
    });
  }

  async getFundamentals(symbol: string) {
    return this.call("getFundamentals", async () => {
      const data = await this.bridge("fundamentals", { symbol });
      const i = data?.info ?? {};
      return {
        symbol,
        marketCap: num(i.marketCap),
        shares: num(i.sharesOutstanding),
        float: num(i.floatShares),
        shortInterest: num(i.sharesShort),
        beta: num(i.beta),
        pe: num(i.trailingPE),
        forwardPe: num(i.forwardPE),
        eps: num(i.trailingEps),
        dividendYield: num(i.dividendYield),
        nextEarningsDate: i.earningsDate,
        sector: i.sector,
        industry: i.industry,
      };
    });
  }

  async getEarningsCalendar(_from: string, _to: string) {
    throw new DataError("yfinance", "unsupported",
      "yfinance exposes per-symbol earnings_dates, not a cross-symbol calendar. Use Finnhub or FMP.");
  }

  async getEconomicCalendar(_from: string, _to: string) {
    throw new DataError("yfinance", "unsupported",
      "yfinance does not provide economic calendar data. Use FRED for macro releases.");
  }

  async getOptionsChain(underlying: string, expiration?: string) {
    return this.call("getOptionsChain", async () => {
      const data = await this.bridge("options", { symbol: underlying, expiration });
      return {
        underlying,
        expirations: data?.expirations ?? [],
        contracts: (data?.contracts ?? []).map((c: any) => ({
          symbol: c.contractSymbol ?? c.symbol,
          underlying,
          expiration: c.expiration,
          strike: num(c.strike),
          right: c.type === "C" || c.right === "call" ? "call" : "put",
          bid: num(c.bid),
          ask: num(c.ask),
          last: num(c.lastPrice ?? c.last),
          volume: num(c.volume),
          openInterest: num(c.openInterest),
          iv: c.impliedVolatility ? num(c.impliedVolatility) : undefined,
        })),
      };
    });
  }

  async getSessions(_exchange: string, from: string, to: string) {
    // yfinance doesn't expose a session calendar; synthesize from M-F.
    const out: { date: string; open: number; close: number }[] = [];
    const start = new Date(from), end = new Date(to);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      const dateStr = d.toISOString().slice(0, 10);
      out.push({
        date: dateStr,
        open: Date.parse(`${dateStr}T14:30:00Z`) / 1000,
        close: Date.parse(`${dateStr}T21:00:00Z`) / 1000,
      });
    }
    return out;
  }

  async ping() {
    const t0 = Date.now();
    try {
      await this.bridge("ping", {});
      return { ok: true as const, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "yfinance bridge unreachable" };
    }
  }

  // ---- bridge plumbing --------------------------------------------------
  private async call<T>(op: string, fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(async () => {
      try { return await fn(); }
      catch (err: any) { throw new DataError("yfinance", op, err?.message ?? "yfinance bridge failed", err); }
    });
  }

  private async bridge(op: string, args: Record<string, unknown>): Promise<any> {
    const res = await this.fetchImpl(`${this.bridgeUrl}/${op}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`bridge HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }

  private mapType(t?: string): SymbolInfo["type"] {
    switch ((t ?? "").toUpperCase()) {
      case "ETF": return "etf";
      case "INDEX": return "index";
      case "FUTURE": return "futures";
      case "CURRENCY": return "forex";
      case "CRYPTOCURRENCY": return "crypto";
      case "OPTION": return "option";
      default: return "stock";
    }
  }
}
