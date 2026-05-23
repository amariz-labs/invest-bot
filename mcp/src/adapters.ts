// Adapter factory for the MCP server. Same env-var contract as
// web/lib/brokers.ts so config carries across runners.
//
//   BROKER            = synthetic | alpaca | ibkr | tradier   (default: synthetic)
//   DATA_REALTIME     = synthetic | polygon | yfinance | twelvedata (default: synthetic)
//   DATA_HISTORICAL   = synthetic | polygon | yfinance | twelvedata (default: same as DATA_REALTIME)
//
// First-cut scope: synthetic adapters are inlined so the server is fully
// runnable with zero deps. Vendor adapters (Alpaca/IBKR/Tradier/Polygon/...)
// live in /design/code/adapters/ but are NOT bundled here — that wiring is an
// open follow-up (see mcp/README.md "Wiring vendor adapters"). Until then,
// non-synthetic BROKER / DATA_* values throw a clear error pointing the user
// at the wiring instructions.

import type {
  Account,
  Bar,
  BrokerAdapter,
  DataAdapter,
  OrderEvent,
  OrderRequest,
  OrderResult,
  Position,
  Quote,
  Resolution,
  SymbolInfo,
} from "./types.js";

// ---------------------------------------------------------------------------
// Synthetic DataAdapter — tiny in-memory implementation so the server is
// fully runnable with zero config. Deterministic random walk for getBars.
// ---------------------------------------------------------------------------

class SyntheticDataAdapter implements DataAdapter {
  readonly name = "synthetic-data";
  readonly tier = "free" as const;

  async getBars(opts: {
    symbol: string;
    resolution: Resolution;
    from: number;
    to: number;
    extendedHours?: boolean;
  }): Promise<Bar[]> {
    const step = resolutionToSeconds(opts.resolution);
    const out: Bar[] = [];
    let price = 100;
    for (let t = opts.from; t <= opts.to; t += step) {
      const drift = ((hash(`${opts.symbol}:${t}`) % 200) - 100) / 1000; // ~+/-10%
      const open = price;
      const close = +(open * (1 + drift)).toFixed(2);
      const high = +(Math.max(open, close) * 1.005).toFixed(2);
      const low = +(Math.min(open, close) * 0.995).toFixed(2);
      const volume = 100_000 + (hash(`v:${opts.symbol}:${t}`) % 900_000);
      out.push({ time: t, open, high, low, close, volume });
      price = close;
    }
    return out;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const last = 100 + (hash(symbol) % 5000) / 100;
    return {
      symbol,
      bid: +(last - 0.01).toFixed(2),
      bidSize: 100,
      ask: +(last + 0.01).toFixed(2),
      askSize: 100,
      last: +last.toFixed(2),
      timestamp: Date.now(),
      session: "rth",
    };
  }

  streamQuotes(_symbols: string[], _handler: (q: Quote) => void): () => void {
    // No-op for synthetic. (Streaming is not exposed over MCP anyway.)
    return () => {};
  }

  async getSymbol(symbol: string): Promise<SymbolInfo> {
    return {
      symbol,
      name: symbol,
      type: "stock",
      exchange: "NASDAQ",
      currency: "USD",
      timezone: "America/New_York",
      hasIntraday: true,
      minTick: 0.01,
      pricescale: 100,
      session: "0930-1600:23456",
      marginable: true,
      shortable: true,
      optionable: true,
    };
  }

  async search(
    query: string,
    opts?: { type?: SymbolInfo["type"]; limit?: number },
  ): Promise<SymbolInfo[]> {
    const lim = opts?.limit ?? 10;
    const upper = query.toUpperCase();
    return Array.from({ length: Math.min(lim, 3) }, (_, i) => ({
      symbol: `${upper}${i || ""}`,
      name: `${upper} synthetic match #${i + 1}`,
      type: opts?.type ?? "stock",
      exchange: "NASDAQ",
      currency: "USD",
      timezone: "America/New_York",
      hasIntraday: true,
      minTick: 0.01,
      pricescale: 100,
      session: "0930-1600:23456",
    }));
  }

  async getSessions(_exchange: string, _from: string, _to: string) {
    return [];
  }

  async ping() {
    return { ok: true as const, latencyMs: 0 };
  }
}

// ---------------------------------------------------------------------------
// Synthetic BrokerAdapter — inline placeholder. Mirrors the more complete
// SyntheticBrokerAdapter in /design/code/adapters/ but kept lean for the MCP
// server boot-without-deps story. Tracks cash/positions in-memory, fills
// market orders instantly at the last price reported by the data adapter.
// ---------------------------------------------------------------------------

class SyntheticBrokerAdapter implements BrokerAdapter {
  readonly name = "synthetic";
  readonly mode = "synthetic" as const;

  private equity: number;
  private cash: number;
  private orderSeq = 0;
  private positions = new Map<string, Position>();
  private orders: OrderResult[] = [];

  constructor(opts: { startingCash?: number } = {}) {
    this.cash = opts.startingCash ?? 100_000;
    this.equity = this.cash;
  }

  async getAccount(): Promise<Account> {
    return {
      accountId: "synthetic-1",
      equity: this.equity,
      cash: this.cash,
      buyingPower: this.cash * 2,
      marginUsed: 0,
      daytradesUsed: 0,
      daytradesRemaining: null,
      patternDayTrader: false,
      isOptionsApproved: true,
      optionsTier: 3,
      shortingEnabled: true,
      currency: "USD",
    };
  }

  async getPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  async getPosition(symbol: string): Promise<Position | null> {
    return this.positions.get(symbol) ?? null;
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const orderId = `syn-${++this.orderSeq}`;
    const fillPrice = req.limitPrice ?? req.stopPrice ?? 100; // crude
    const cost = req.qty * fillPrice * (req.side === "buy" ? 1 : -1);
    this.cash -= cost;
    const existing = this.positions.get(req.symbol);
    const signedQty = req.side === "buy" ? req.qty : -req.qty;
    if (existing) {
      const newQty = existing.qty + signedQty;
      if (newQty === 0) {
        this.positions.delete(req.symbol);
      } else {
        const newAvg =
          newQty > 0
            ? (existing.avgEntryPrice * existing.qty + fillPrice * signedQty) / newQty
            : existing.avgEntryPrice;
        this.positions.set(req.symbol, {
          ...existing,
          qty: newQty,
          avgEntryPrice: newAvg,
          side: newQty >= 0 ? "long" : "short",
          marketValue: newQty * fillPrice,
          costBasis: Math.abs(newQty) * newAvg,
        });
      }
    } else {
      this.positions.set(req.symbol, {
        symbol: req.symbol,
        qty: signedQty,
        avgEntryPrice: fillPrice,
        marketValue: signedQty * fillPrice,
        unrealizedPnl: 0,
        realizedPnl: 0,
        side: signedQty >= 0 ? "long" : "short",
        costBasis: Math.abs(signedQty) * fillPrice,
      });
    }
    const result: OrderResult = {
      orderId,
      ...(req.clientOrderId !== undefined ? { clientOrderId: req.clientOrderId } : {}),
      status: "filled",
      filledQty: req.qty,
      avgFillPrice: fillPrice,
      submittedAt: new Date().toISOString(),
    };
    this.orders.push(result);
    return result;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const idx = this.orders.findIndex((o) => o.orderId === orderId);
    if (idx >= 0) {
      const existing = this.orders[idx];
      if (existing) this.orders[idx] = { ...existing, status: "canceled" };
    }
  }

  async replaceOrder(orderId: string, _patch: Partial<OrderRequest>): Promise<OrderResult> {
    const found = this.orders.find((o) => o.orderId === orderId);
    if (!found) throw new Error(`order ${orderId} not found`);
    return found;
  }

  async getOrders(opts?: {
    status?: "open" | "closed" | "all";
    limit?: number;
  }): Promise<OrderResult[]> {
    const want = opts?.status ?? "all";
    const filtered = this.orders.filter((o) =>
      want === "all"
        ? true
        : want === "open"
          ? o.status === "accepted" || o.status === "pending" || o.status === "partial"
          : o.status === "filled" || o.status === "canceled" || o.status === "rejected",
    );
    return filtered.slice(0, opts?.limit ?? 50);
  }

  streamOrders(_handler: (evt: OrderEvent) => void): () => void {
    // No-op for synthetic. Streaming is not exposed over MCP anyway.
    return () => {};
  }

  async ping() {
    return { ok: true as const, latencyMs: 0 };
  }
}

function resolutionToSeconds(r: Resolution): number {
  switch (r) {
    case "1": return 60;
    case "5": return 300;
    case "15": return 900;
    case "30": return 1800;
    case "60": return 3600;
    case "240": return 14400;
    case "D": return 86400;
    case "W": return 604800;
    case "M": return 2592000;
    default: return 86400;
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _broker: BrokerAdapter | null = null;
let _data: DataAdapter | null = null;

const NOT_WIRED_MSG =
  "Vendor adapter not bundled with the MCP server yet. " +
  "The implementation lives in /design/code/adapters/ — see mcp/README.md " +
  "'Wiring vendor adapters' for the integration steps. " +
  "Until then, use BROKER=synthetic (or the matching DATA_* env var).";

export async function getBroker(): Promise<BrokerAdapter> {
  if (_broker) return _broker;
  const choice = (process.env["BROKER"] ?? "synthetic").toLowerCase();
  switch (choice) {
    case "synthetic":
      _broker = new SyntheticBrokerAdapter({
        startingCash: numericEnv("SYNTHETIC_STARTING_CASH", 100_000),
      });
      return _broker;
    case "alpaca":
    case "ibkr":
    case "tradier":
    case "tastytrade":
      throw new Error(`${NOT_WIRED_MSG} (requested BROKER="${choice}")`);
    default:
      throw new Error(
        `Unknown BROKER="${choice}". Expected one of: synthetic, alpaca, ibkr, tradier, tastytrade.`,
      );
  }
}

export async function getData(): Promise<DataAdapter> {
  if (_data) return _data;
  const choice = (process.env["DATA_REALTIME"] ?? "synthetic").toLowerCase();
  switch (choice) {
    case "synthetic":
      _data = new SyntheticDataAdapter();
      return _data;
    case "polygon":
    case "yfinance":
    case "twelvedata":
      throw new Error(`${NOT_WIRED_MSG} (requested DATA_REALTIME="${choice}")`);
    default:
      throw new Error(
        `Unknown DATA_REALTIME="${choice}". Expected one of: synthetic, polygon, yfinance, twelvedata.`,
      );
  }
}

function numericEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// For health/version reporting.
export function adapterNames(): { broker: string; data: string } {
  return {
    broker: (process.env["BROKER"] ?? "synthetic").toLowerCase(),
    data: (process.env["DATA_REALTIME"] ?? "synthetic").toLowerCase(),
  };
}
