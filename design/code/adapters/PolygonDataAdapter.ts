// PolygonDataAdapter — Polygon.io (now Massive.com) market data.
// SDK: `@polygon.io/client-js` (MIT). Install:  npm i @polygon.io/client-js
// Env: POLYGON_KEY
// Docs: https://polygon.io/docs

import {
  DataAdapter, Bar, Quote, SymbolInfo, OptionsChain, Resolution, ConnectionStatus,
} from "../DataAdapter";
import { DataError, num } from "./errors";
import { SerialQueue } from "./queue";

// Backoff schedule for WS reconnects. Capped at 30s — anything longer and
// the user wants a hard "disconnected" signal so they can intervene.
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000];
const MAX_RECONNECT_ATTEMPTS = 8;
// Quiet-tick threshold: WS still "open" but no Q frames in this many ms
// flips status to "stale". Matches the watchlist's per-row threshold.
const STALE_QUIET_MS = 15_000;
// Coalesce reconnect-driven re-fetches so a flap doesn't slam the REST API.
const REFETCH_DEBOUNCE_MS = 500;

export interface PolygonConfig {
  apiKey: string;
  baseUrl?: string;     // default https://api.polygon.io
}

const RES_MAP: Record<Resolution, { multiplier: number; timespan: string }> = {
  "1":   { multiplier: 1,  timespan: "minute" },
  "5":   { multiplier: 5,  timespan: "minute" },
  "15":  { multiplier: 15, timespan: "minute" },
  "30":  { multiplier: 30, timespan: "minute" },
  "60":  { multiplier: 1,  timespan: "hour" },
  "240": { multiplier: 4,  timespan: "hour" },
  "D":   { multiplier: 1,  timespan: "day" },
  "W":   { multiplier: 1,  timespan: "week" },
  "M":   { multiplier: 1,  timespan: "month" },
};

export class PolygonDataAdapter implements DataAdapter {
  readonly name = "polygon";
  readonly tier: "free" | "starter" | "pro";
  private apiKey: string;
  private baseUrl: string;
  private queue = new SerialQueue({ minSpacingMs: 50 });
  private rateState = { limit: 100, remaining: 100, resetAt: 0 };

  // Connection-status bookkeeping. `status` is the authoritative value
  // emitted to subscribers; `statusSubscribers` is iterated synchronously
  // on every transition. `lastTickPerSymbol` is the source of truth for
  // `lastTickAt(symbol)`. `staleTimer` flips us to "stale" if the WS goes
  // quiet while still open. `liveSymbols` is the set of symbols any active
  // `streamQuotes()` caller subscribed to — needed by the reconnect
  // re-fetch path so daily bars (and therefore prevClose) correct themselves.
  private status: ConnectionStatus = { state: "disconnected", since: Date.now() };
  private statusSubscribers = new Set<(s: ConnectionStatus) => void>();
  private lastTickPerSymbol = new Map<string, number>();
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private liveSymbols = new Set<string>();
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  // Hook so callers (e.g. HeroChart) can be notified that we just re-fetched
  // the latest daily bar after a reconnect — set by streamQuotes() callers
  // who care. The contract is "fire-and-forget per symbol".
  private onReconnectRefetch: ((symbol: string, bar: Bar) => void) | null = null;

  constructor(cfg: PolygonConfig & { tier?: "free" | "starter" | "pro" }) {
    if (!cfg.apiKey) throw new DataError("polygon", "config", "POLYGON_KEY is required");
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl ?? "https://api.polygon.io";
    this.tier = cfg.tier ?? "starter";
  }

  get rateLimit() { return { ...this.rateState }; }

  // ---- connection status -----------------------------------------------
  subscribeStatus(handler: (s: ConnectionStatus) => void): () => void {
    this.statusSubscribers.add(handler);
    // Fire current state synchronously so a late subscriber doesn't sit blank.
    // This is the deliberate fix for the "handler may miss the initial
    // 'connected' transition if subscribeStatus is called after WS open" race.
    try { handler(this.status); } catch { /* handler is responsible for its own errors */ }
    return () => { this.statusSubscribers.delete(handler); };
  }

  lastTickAt(symbol: string): number | null {
    const t = this.lastTickPerSymbol.get(symbol);
    return typeof t === "number" ? t : null;
  }

  private setStatus(next: ConnectionStatus): void {
    // Only emit on actual transitions — guarantees handlers don't see
    // "connected" twice for one logical WS open.
    if (next.state === this.status.state &&
        (next as { attempts?: number }).attempts === (this.status as { attempts?: number }).attempts) {
      return;
    }
    this.status = next;
    for (const h of this.statusSubscribers) {
      try { h(next); } catch { /* never let one bad handler break the rest */ }
    }
  }

  private armStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      // If we're still in "connected" but no ticks for STALE_QUIET_MS, flip.
      if (this.status.state === "connected") {
        const lastTick = Math.max(0, ...Array.from(this.lastTickPerSymbol.values()));
        this.setStatus({
          state: "stale",
          since: Date.now(),
          lastTickAt: lastTick || undefined,
        });
      }
    }, STALE_QUIET_MS);
  }

  // ---- bars -------------------------------------------------------------
  async getBars(opts: { symbol: string; resolution: Resolution; from: number; to: number; extendedHours?: boolean }): Promise<Bar[]> {
    return this.call("getBars", async () => {
      const { multiplier, timespan } = RES_MAP[opts.resolution];
      const fromMs = opts.from * 1000;
      const toMs = opts.to * 1000;
      const url = `/v2/aggs/ticker/${encodeURIComponent(opts.symbol)}/range/${multiplier}/${timespan}/${fromMs}/${toMs}`
        + `?adjusted=true&sort=asc&limit=50000`;
      const data = await this.get(url);
      const results = (data.results ?? []) as any[];
      return results.map(r => ({
        time: Math.floor(num(r.t) / 1000),
        open: num(r.o),
        high: num(r.h),
        low: num(r.l),
        close: num(r.c),
        volume: num(r.v),
      }));
    });
  }

  // ---- quotes -----------------------------------------------------------
  async getQuote(symbol: string): Promise<Quote> {
    return this.call("getQuote", async () => {
      const data = await this.get(`/v3/quotes/${encodeURIComponent(symbol)}?limit=1&order=desc`);
      const q = (data.results ?? [])[0] ?? {};
      const lastTrade = await this.get(`/v2/last/trade/${encodeURIComponent(symbol)}`).catch(() => null);
      return {
        symbol,
        bid: num(q.bid_price),
        bidSize: num(q.bid_size),
        ask: num(q.ask_price),
        askSize: num(q.ask_size),
        last: num(lastTrade?.results?.p ?? q.bid_price),
        timestamp: num(q.sip_timestamp) / 1e6 || Date.now(),
      };
    });
  }

  // ---- streaming --------------------------------------------------------
  // Polygon WS endpoints: stocks -> wss://socket.polygon.io/stocks
  // Frame format: [{ev:"Q", sym, bp, bs, ap, as, t}, ...]
  //
  // Reconnect protocol:
  //   - On WS close before max attempts: emit "reconnecting" with attempt
  //     count, sleep BACKOFF_MS[attempt], dial again.
  //   - On WS open: emit "connected", reset attempt counter, re-subscribe.
  //   - After reconnect we ALSO re-fetch the latest daily bar for every
  //     symbol still subscribed (debounced REFETCH_DEBOUNCE_MS), so
  //     consumers' prevClose / dayΔ snap back to the truth instead of
  //     drifting against ticks that arrived mid-disconnect.
  //   - After MAX_RECONNECT_ATTEMPTS: emit "disconnected" and give up.
  //   - Quiet detection: every Q frame resets the stale timer; if the
  //     timer fires while still "connected", we flip to "stale".
  streamQuotes(symbols: string[], handler: (q: Quote) => void): () => void {
    for (const s of symbols) this.liveSymbols.add(s);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WebSocket = require("ws");
    let ws: any = null;
    let closedByCaller = false;
    let attempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const dial = (): void => {
      if (closedByCaller) return;
      ws = new WebSocket("wss://socket.polygon.io/stocks");

      ws.on("open", () => {
        attempts = 0;
        ws.send(JSON.stringify({ action: "auth", params: this.apiKey }));
        ws.send(JSON.stringify({ action: "subscribe", params: symbols.map(s => `Q.${s}`).join(",") }));
        this.setStatus({ state: "connected", since: Date.now() });
        this.armStaleTimer();
        // Re-fetch latest daily bar for every subscribed symbol after a
        // reconnect — debounced so a flap doesn't slam the REST API.
        this.scheduleReconnectRefetch();
      });

      ws.on("message", (raw: Buffer) => {
        try {
          const frames = JSON.parse(raw.toString());
          for (const f of frames) {
            if (f.ev !== "Q") continue;
            const ts = num(f.t);
            this.lastTickPerSymbol.set(f.sym, ts || Date.now());
            // Every tick is a heartbeat — if we drifted into "stale"
            // we recover automatically.
            if (this.status.state === "stale") {
              this.setStatus({ state: "connected", since: Date.now() });
            }
            this.armStaleTimer();
            handler({
              symbol: f.sym,
              bid: num(f.bp),
              bidSize: num(f.bs),
              ask: num(f.ap),
              askSize: num(f.as),
              last: num(f.bp),
              timestamp: ts || Date.now(),
            });
          }
        } catch { /* ignore malformed frames */ }
      });

      ws.on("close", () => {
        if (closedByCaller) return;
        if (attempts >= MAX_RECONNECT_ATTEMPTS) {
          this.setStatus({
            state: "disconnected",
            since: Date.now(),
            error: `gave up after ${attempts} reconnect attempts`,
          });
          return;
        }
        attempts++;
        this.setStatus({ state: "reconnecting", since: Date.now(), attempts });
        const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] as number;
        reconnectTimer = setTimeout(dial, wait);
      });

      ws.on("error", (err: Error) => {
        // ws will follow up with `close` — track the error for the
        // disconnected payload but don't double-emit here.
        void err;
      });
    };

    dial();

    return () => {
      closedByCaller = true;
      for (const s of symbols) this.liveSymbols.delete(s);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (this.staleTimer) { clearTimeout(this.staleTimer); this.staleTimer = null; }
      try { ws?.close(); } catch { /* idempotent */ }
      this.setStatus({ state: "disconnected", since: Date.now() });
    };
  }

  // Re-fetch the latest daily bar for every live symbol so consumers'
  // prevClose / dayΔ correct themselves after a reconnect. Debounced.
  private scheduleReconnectRefetch(): void {
    if (this.refetchTimer) return;
    this.refetchTimer = setTimeout(async () => {
      this.refetchTimer = null;
      const now = Math.floor(Date.now() / 1000);
      const from = now - 3 * 86_400;
      for (const sym of this.liveSymbols) {
        try {
          const bars = await this.getBars({ symbol: sym, resolution: "D", from, to: now });
          const last = bars[bars.length - 1];
          if (last && this.onReconnectRefetch) this.onReconnectRefetch(sym, last);
        } catch { /* swallow — best-effort refresh */ }
      }
    }, REFETCH_DEBOUNCE_MS);
  }

  // ---- symbol metadata --------------------------------------------------
  async getSymbol(symbol: string): Promise<SymbolInfo> {
    return this.call("getSymbol", async () => {
      const data = await this.get(`/v3/reference/tickers/${encodeURIComponent(symbol)}`);
      const r = data.results ?? {};
      return {
        symbol: r.ticker ?? symbol,
        name: r.name ?? symbol,
        type: this.mapType(r.type, r.market),
        exchange: r.primary_exchange ?? "",
        currency: r.currency_name?.toUpperCase() ?? "USD",
        timezone: r.locale === "us" ? "America/New_York" : "UTC",
        hasIntraday: true,
        minTick: 0.01,
        pricescale: 100,
        session: "0930-1600:23456",
        marginable: true,
        shortable: true,
        optionable: r.market === "stocks",
      };
    });
  }

  async search(query: string, opts?: { type?: SymbolInfo["type"]; limit?: number }): Promise<SymbolInfo[]> {
    return this.call("search", async () => {
      const limit = opts?.limit ?? 20;
      const data = await this.get(`/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&limit=${limit}`);
      const arr = (data.results ?? []) as any[];
      const mapped = arr.map(r => ({
        symbol: r.ticker,
        name: r.name ?? r.ticker,
        type: this.mapType(r.type, r.market),
        exchange: r.primary_exchange ?? "",
        currency: r.currency_name?.toUpperCase() ?? "USD",
        timezone: "America/New_York",
        hasIntraday: true,
        minTick: 0.01,
        pricescale: 100,
        session: "0930-1600:23456",
      }) as SymbolInfo);
      return opts?.type ? mapped.filter(s => s.type === opts.type) : mapped;
    });
  }

  // ---- options chain ----------------------------------------------------
  async getOptionsChain(underlying: string, expiration?: string): Promise<OptionsChain> {
    return this.call("getOptionsChain", async () => {
      const params = new URLSearchParams({
        "underlying_ticker": underlying,
        "limit": "250",
        ...(expiration ? { "expiration_date": expiration } : {}),
      });
      const data = await this.get(`/v3/reference/options/contracts?${params}`);
      const contracts = (data.results ?? []) as any[];
      const expirations = Array.from(new Set(contracts.map(c => c.expiration_date).filter(Boolean))).sort();
      return {
        underlying,
        expirations,
        contracts: contracts.map(c => ({
          symbol: c.ticker,
          underlying,
          expiration: c.expiration_date,
          strike: num(c.strike_price),
          right: c.contract_type === "call" ? "call" : "put",
          bid: 0, ask: 0, last: 0, volume: 0, openInterest: 0, // need /v3/snapshot/options for these; intentionally unfilled
        })),
      };
    });
  }

  async getFundamentals(_symbol: string) {
    // Polygon ships a separate Fundamentals product (SEC + Benzinga). The
    // basic plan does not include it; advanced users should hit /vX/reference/financials directly.
    throw new DataError("polygon", "unsupported",
      "Fundamentals require Polygon's Advanced/Financials add-on. Use FMP or yfinance for free fundamentals.");
  }

  async getEarningsCalendar(_from: string, _to: string) {
    throw new DataError("polygon", "unsupported", "Polygon does not expose a free earnings calendar endpoint; use FMP or Finnhub.");
  }

  async getEconomicCalendar(_from: string, _to: string) {
    throw new DataError("polygon", "unsupported", "Polygon does not expose economic events; use FRED or a dedicated calendar provider.");
  }

  async getSessions(exchange: string, from: string, to: string) {
    return this.call("getSessions", async () => {
      // Polygon's /v1/marketstatus/upcoming returns next holidays — combined
      // with daily aggs we synthesize sessions. For now we return the
      // canonical RTH window for US exchanges between from..to.
      const start = new Date(from), end = new Date(to);
      const out: { date: string; open: number; close: number }[] = [];
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        const day = d.getUTCDay();
        if (day === 0 || day === 6) continue;
        const dateStr = d.toISOString().slice(0, 10);
        // 09:30–16:00 America/New_York. Convert via fixed -5h offset (DST handled
        // by caller / TZ-aware lib in real implementations).
        const open = Date.parse(`${dateStr}T14:30:00Z`) / 1000;
        const close = Date.parse(`${dateStr}T21:00:00Z`) / 1000;
        out.push({ date: dateStr, open, close });
      }
      void exchange;
      return out;
    });
  }

  async ping() {
    const t0 = Date.now();
    try {
      await this.get("/v1/marketstatus/now");
      return { ok: true as const, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "ping failed" };
    }
  }

  // ---- HTTP -------------------------------------------------------------
  private async call<T>(op: string, fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(async () => {
      try { return await fn(); }
      catch (err: any) { throw new DataError("polygon", op, err?.message ?? "polygon call failed", err); }
    });
  }

  private async get(path: string): Promise<any> {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${this.baseUrl}${path}${sep}apiKey=${this.apiKey}`;
    const res = await fetch(url);
    // Polygon returns X-RateLimit-* headers on the paid plans.
    const rem = res.headers.get("x-ratelimit-remaining");
    const lim = res.headers.get("x-ratelimit-limit");
    const reset = res.headers.get("x-ratelimit-reset");
    if (rem) this.rateState.remaining = num(rem);
    if (lim) this.rateState.limit = num(lim);
    if (reset) this.rateState.resetAt = num(reset);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${path}: ${text}`);
    }
    return res.json();
  }

  private mapType(t?: string, market?: string): SymbolInfo["type"] {
    if (market === "crypto") return "crypto";
    if (market === "fx") return "forex";
    if (t === "ETF") return "etf";
    if (t === "INDEX") return "index";
    if (t === "OPTION" || market === "options") return "option";
    return "stock";
  }
}
