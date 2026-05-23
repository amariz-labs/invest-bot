// Adapter factory for the MCP server. Same env-var contract as
// web/lib/brokers.ts so config carries across runners.
//
//   BROKER            = synthetic | alpaca | ibkr | tradier   (default: synthetic)
//   DATA_REALTIME     = synthetic | polygon | yfinance | twelvedata (default: synthetic)
//   DATA_HISTORICAL   = synthetic | polygon | yfinance | twelvedata (default: same as DATA_REALTIME)
//
// All vendor SDKs are loaded LAZILY (dynamic import) so the server starts
// with zero third-party deps when running in synthetic mode.

import type { BrokerAdapter } from "../../design/code/BrokerAdapter.js";
import type { DataAdapter } from "../../design/code/DataAdapter.js";

// ---------------------------------------------------------------------------
// Synthetic DataAdapter — tiny in-memory implementation so the server is
// fully runnable with zero config. Deterministic random walk for getBars.
// ---------------------------------------------------------------------------

class SyntheticDataAdapter implements DataAdapter {
  readonly name = "synthetic-data";
  readonly tier = "free" as const;

  async getBars(opts: {
    symbol: string;
    resolution: string;
    from: number;
    to: number;
    extendedHours?: boolean;
  }): Promise<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>> {
    const step = resolutionToSeconds(opts.resolution);
    const out: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    let price = 100;
    for (let t = opts.from; t <= opts.to; t += step) {
      const drift = (hash(`${opts.symbol}:${t}`) % 200 - 100) / 1000; // ~+/-10%
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

  async getQuote(symbol: string) {
    const last = 100 + (hash(symbol) % 5000) / 100;
    return {
      symbol,
      bid: +(last - 0.01).toFixed(2),
      bidSize: 100,
      ask: +(last + 0.01).toFixed(2),
      askSize: 100,
      last: +last.toFixed(2),
      timestamp: Date.now(),
      session: "rth" as const,
    };
  }

  streamQuotes(_symbols: string[], _handler: (q: unknown) => void): () => void {
    // No-op for synthetic. (Streaming is not exposed over MCP anyway.)
    return () => {};
  }

  async getSymbol(symbol: string) {
    return {
      symbol,
      name: symbol,
      type: "stock" as const,
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

  async search(query: string, opts?: { type?: string; limit?: number }) {
    const lim = opts?.limit ?? 10;
    const upper = query.toUpperCase();
    return Array.from({ length: Math.min(lim, 3) }, (_, i) => ({
      symbol: `${upper}${i || ""}`,
      name: `${upper} synthetic match #${i + 1}`,
      type: (opts?.type as "stock" | undefined) ?? ("stock" as const),
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

function resolutionToSeconds(r: string): number {
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

export async function getBroker(): Promise<BrokerAdapter> {
  if (_broker) return _broker;
  const choice = (process.env["BROKER"] ?? "synthetic").toLowerCase();
  switch (choice) {
    case "synthetic": {
      const { SyntheticBrokerAdapter } = await import("../../design/code/adapters/SyntheticBrokerAdapter.js");
      _broker = new SyntheticBrokerAdapter({
        startingCash: numericEnv("SYNTHETIC_STARTING_CASH", 100_000),
        defaultLastPrice: numericEnv("SYNTHETIC_DEFAULT_LAST_PRICE", 100),
      });
      return _broker;
    }
    case "alpaca": {
      const { AlpacaBrokerAdapter } = await import("../../design/code/adapters/AlpacaBrokerAdapter.js");
      _broker = new AlpacaBrokerAdapter({
        keyId: requireEnv("ALPACA_KEY_ID"),
        secret: requireEnv("ALPACA_SECRET_KEY"),
        mode: (process.env["ALPACA_MODE"] as "paper" | "live") ?? "paper",
      });
      return _broker;
    }
    case "ibkr": {
      const { IBKRBrokerAdapter } = await import("../../design/code/adapters/IBKRBrokerAdapter.js");
      _broker = new IBKRBrokerAdapter({
        host: process.env["IBKR_HOST"] ?? "127.0.0.1",
        port: Number(process.env["IBKR_PORT"] ?? 7497),
        clientId: Number(process.env["IBKR_CLIENT_ID"] ?? 1),
        mode: (process.env["IBKR_MODE"] as "paper" | "live") ?? "paper",
      });
      return _broker;
    }
    case "tradier": {
      const { TradierBrokerAdapter } = await import("../../design/code/adapters/TradierBrokerAdapter.js");
      _broker = new TradierBrokerAdapter({
        token: requireEnv("TRADIER_TOKEN"),
        accountId: requireEnv("TRADIER_ACCOUNT"),
        mode: (process.env["TRADIER_MODE"] as "paper" | "live") ?? "paper",
      });
      return _broker;
    }
    default:
      throw new Error(`Unknown BROKER="${choice}". Expected one of: synthetic, alpaca, ibkr, tradier.`);
  }
}

export async function getData(): Promise<DataAdapter> {
  if (_data) return _data;
  const choice = (process.env["DATA_REALTIME"] ?? "synthetic").toLowerCase();
  switch (choice) {
    case "synthetic":
      _data = new SyntheticDataAdapter();
      return _data;
    case "polygon": {
      const { PolygonDataAdapter } = await import("../../design/code/adapters/PolygonDataAdapter.js");
      _data = new PolygonDataAdapter({ apiKey: requireEnv("POLYGON_KEY") });
      return _data;
    }
    case "yfinance": {
      const { YFinanceDataAdapter } = await import("../../design/code/adapters/YFinanceDataAdapter.js");
      _data = new YFinanceDataAdapter({
        bridgeUrl: process.env["YFINANCE_BRIDGE_URL"] ?? "http://localhost:3000/api/yfinance",
      });
      return _data;
    }
    case "twelvedata": {
      const { TwelveDataDataAdapter } = await import("../../design/code/adapters/TwelveDataDataAdapter.js");
      _data = new TwelveDataDataAdapter({ apiKey: requireEnv("TWELVEDATA_KEY") });
      return _data;
    }
    default:
      throw new Error(
        `Unknown DATA_REALTIME="${choice}". Expected one of: synthetic, polygon, yfinance, twelvedata.`,
      );
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
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
