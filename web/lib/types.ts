// Local copy of the BrokerAdapter / DataAdapter interfaces so this package
// has no cross-package import dependencies. The canonical definitions live
// in ../design/code/BrokerAdapter.ts and ../design/code/DataAdapter.ts —
// keep these in sync when the design evolves.

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
  // biome-ignore lint/suspicious/noExplicitAny: optional capability, broker SDKs vary
  getOptionsChain?(underlying: string, expiration?: string): Promise<any>;
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

// Connection-status channel. Mirrors design/code/DataAdapter.ts —
// keep these definitions byte-for-byte in sync. See
// design/code/adapters/README.md "Connection status protocol".
export type ConnectionStatus =
  | { state: "connected"; since: number }
  | { state: "reconnecting"; since: number; attempts: number }
  | { state: "stale"; since: number; lastTickAt?: number }
  | { state: "disconnected"; since: number; error?: string };

export function isStale(status: ConnectionStatus, maxQuietMs = 15_000): boolean {
  if (status.state === "reconnecting" || status.state === "disconnected") return true;
  if (status.state === "stale") return true;
  const maybeLast = (status as { lastTickAt?: number }).lastTickAt;
  if (typeof maybeLast === "number" && Date.now() - maybeLast > maxQuietMs) return true;
  return false;
}

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
  // Optional capabilities — provider-dependent. Matches design/code/DataAdapter.ts:133.
  // biome-ignore lint/suspicious/noExplicitAny: optional capability, provider SDKs vary
  getOptionsChain?(underlying: string, expiration?: string): Promise<any>;
  readonly rateLimit?: { limit: number; remaining: number; resetAt: number };
  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
  // Subscribe to the adapter's connection-status feed. The handler MUST
  // be called synchronously with the current status on subscribe, then on
  // every transition. Returns an unsubscribe function.
  subscribeStatus(handler: (s: ConnectionStatus) => void): () => void;
  // Unix-ms timestamp of the most recent quote seen for `symbol`, or null
  // if the adapter has never observed one.
  lastTickAt(symbol: string): number | null;
}
