// Local copy of the BrokerAdapter / DataAdapter interfaces so this package
// has no cross-package import dependencies (would violate tsconfig rootDir).
// The canonical definitions live in ../../design/code/{BrokerAdapter,DataAdapter}.ts —
// keep these in sync when the design evolves. Same pattern as web/lib/types.ts.

// ---------------------------------------------------------------------------
// Broker
// ---------------------------------------------------------------------------

export type Side = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "trailing_stop";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok" | "opg" | "cls";

export interface OrderRequest {
  symbol: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  stopPrice?: number;
  trailPct?: number;
  trailAmount?: number;
  timeInForce?: TimeInForce;
  extendedHours?: boolean;
  takeProfit?: { limitPrice: number };
  stopLoss?: { stopPrice: number; limitPrice?: number };
  clientOrderId?: string;
  linkedTo?: string;
  option?: {
    underlying: string;
    expiration: string;
    strike: number;
    right: "call" | "put";
  };
}

export interface OrderResult {
  orderId: string;
  clientOrderId?: string;
  status: "accepted" | "rejected" | "pending" | "filled" | "partial" | "canceled";
  filledQty: number;
  avgFillPrice?: number;
  submittedAt: string;
  message?: string;
}

export interface Position {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  side: "long" | "short";
  costBasis: number;
}

export interface Account {
  accountId: string;
  equity: number;
  cash: number;
  buyingPower: number;
  marginUsed: number;
  daytradesUsed: number;
  daytradesRemaining: number | null;
  patternDayTrader: boolean;
  isOptionsApproved: boolean;
  optionsTier?: 1 | 2 | 3 | 4;
  cryptoEnabled?: boolean;
  shortingEnabled?: boolean;
  currency: "USD" | "EUR" | "GBP" | string;
}

export interface OrderEvent {
  type: "new" | "fill" | "partial_fill" | "cancel" | "reject" | "expire";
  order: OrderResult;
  at: string;
}

export interface BrokerAdapter {
  readonly name: string;
  readonly mode: "paper" | "live" | "synthetic";
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  getPosition(symbol: string): Promise<Position | null>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  replaceOrder(orderId: string, patch: Partial<OrderRequest>): Promise<OrderResult>;
  getOrders(opts?: { status?: "open" | "closed" | "all"; limit?: number }): Promise<OrderResult[]>;
  streamOrders(handler: (evt: OrderEvent) => void): () => void;
  isShortable?(symbol: string): Promise<{ shortable: boolean; feeRate?: number }>;
  getOptionsChain?(underlying: string, expiration?: string): Promise<unknown>;
  readonly rateLimit?: { limit: number; remaining: number; resetAt: number };
  onRateLimit?(handler: (state: { remaining: number; resetAt: number }) => void): () => void;
  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export type Resolution = "1" | "5" | "15" | "30" | "60" | "240" | "D" | "W" | "M";

export interface Bar {
  time: number;
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
  timestamp: number;
  session?: "pre" | "rth" | "post" | "closed";
}

export interface SymbolInfo {
  symbol: string;
  name: string;
  type: "stock" | "etf" | "index" | "futures" | "forex" | "crypto" | "option";
  exchange: string;
  currency: string;
  timezone: string;
  hasIntraday: boolean;
  minTick: number;
  pricescale: number;
  session: string;
  marginable?: boolean;
  shortable?: boolean;
  optionable?: boolean;
}

export type ConnectionStatus =
  | { state: "connected"; since: number }
  | { state: "reconnecting"; since: number; attempts: number }
  | { state: "stale"; since: number; lastTickAt?: number }
  | { state: "disconnected"; since: number; error?: string };

export interface DataAdapter {
  readonly name: string;
  readonly tier: "free" | "starter" | "pro";
  getBars(opts: {
    symbol: string;
    resolution: Resolution;
    from: number;
    to: number;
    extendedHours?: boolean;
  }): Promise<Bar[]>;
  getQuote(symbol: string): Promise<Quote>;
  streamQuotes(symbols: string[], handler: (q: Quote) => void): () => void;
  getSymbol(symbol: string): Promise<SymbolInfo>;
  search(query: string, opts?: { type?: SymbolInfo["type"]; limit?: number }): Promise<SymbolInfo[]>;
  getSessions(exchange: string, from: string, to: string): Promise<{ date: string; open: number; close: number }[]>;
  // Optional capabilities — provider-dependent. Matches design/code/DataAdapter.ts:133.
  getOptionsChain?(underlying: string, expiration?: string): Promise<unknown>;
  readonly rateLimit?: { limit: number; remaining: number; resetAt: number };
  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
  subscribeStatus?(handler: (s: ConnectionStatus) => void): () => void;
  lastTickAt?(symbol: string): number | null;
}
