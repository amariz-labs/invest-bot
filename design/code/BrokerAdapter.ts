// Abstract broker interface. Every screen, skill, and backtest in this repo
// speaks this — swapping Alpaca for IBKR is editing lib/brokers.ts.
// See ../PLATFORM-INTEGRATIONS.md for rationale.

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
  // Bracket orders — submitted as a single composite.
  takeProfit?: { limitPrice: number };
  stopLoss?: { stopPrice: number; limitPrice?: number };
  // OCO / OTO linkage by client order id.
  clientOrderId?: string;
  linkedTo?: string;
  // Options leg (single-leg only here; complex spreads = future work).
  option?: {
    underlying: string;
    expiration: string;     // "2026-06-19"
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
  submittedAt: string;     // ISO
  message?: string;        // broker-side rejection reason
}

export interface Position {
  symbol: string;
  qty: number;             // signed; negative = short
  avgEntryPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;     // session
  side: "long" | "short";
  costBasis: number;
}

export interface Account {
  accountId: string;
  equity: number;
  cash: number;
  buyingPower: number;
  marginUsed: number;
  daytradesUsed: number;       // last 5 sessions
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

  // Account
  getAccount(): Promise<Account>;
  getPositions(): Promise<Position[]>;
  getPosition(symbol: string): Promise<Position | null>;

  // Orders
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  replaceOrder(orderId: string, patch: Partial<OrderRequest>): Promise<OrderResult>;
  getOrders(opts?: { status?: "open" | "closed" | "all"; limit?: number }): Promise<OrderResult[]>;

  // Streaming
  streamOrders(handler: (evt: OrderEvent) => void): () => void;       // returns unsubscribe

  // Shortability / borrow
  isShortable?(symbol: string): Promise<{ shortable: boolean; feeRate?: number }>;

  // Options
  getOptionsChain?(underlying: string, expiration?: string): Promise<unknown>;

  // Rate limits (optional but recommended)
  readonly rateLimit?: { limit: number; remaining: number; resetAt: number };
  onRateLimit?(handler: (state: { remaining: number; resetAt: number }) => void): () => void;

  // Health
  ping(): Promise<{ ok: true; latencyMs: number } | { ok: false; error: string }>;
}

// Convenience guard for pre-trade gates.
export function canDayTrade(account: Account): boolean {
  if (!account.patternDayTrader) return true;
  if (account.daytradesRemaining === null) return true;
  return account.daytradesRemaining > 0;
}

export function affordableQty(
  account: Account,
  price: number,
  riskPct: number = 0.01,
  stopDistance?: number
): number {
  if (stopDistance && stopDistance > 0) {
    return Math.floor((account.equity * riskPct) / stopDistance);
  }
  return Math.floor(account.buyingPower / price);
}
