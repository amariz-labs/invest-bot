// AlpacaBrokerAdapter — concrete Alpaca implementation.
// SDK: `@alpacahq/alpaca-trade-api` (Apache-2.0). Install:  npm i @alpacahq/alpaca-trade-api
// Env: ALPACA_KEY_ID, ALPACA_SECRET_KEY. Paper mode is free.
// Docs: https://docs.alpaca.markets/

import {
  BrokerAdapter, OrderRequest, OrderResult, Position, Account, OrderEvent,
} from "../BrokerAdapter";
import { BrokerError, num } from "./errors";
import { SerialQueue } from "./queue";

// SDK type — we use `any` here because `@alpacahq/alpaca-trade-api` ships
// loose types and depends on the installed version.
type AlpacaClient = any;

export interface AlpacaConfig {
  keyId: string;
  secret: string;
  mode: "paper" | "live";
  feeder?: "iex" | "sip";
}

export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly name = "alpaca";
  readonly mode: "paper" | "live";
  private client: AlpacaClient;
  private queue = new SerialQueue({ minSpacingMs: 50 }); // 200 req/min default
  private rateState = { limit: 200, remaining: 200, resetAt: 0 };
  private rateHandlers = new Set<(s: { remaining: number; resetAt: number }) => void>();

  constructor(cfg: AlpacaConfig) {
    this.mode = cfg.mode;
    // Lazy SDK import — keeps the interface package free of optional deps.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Alpaca = require("@alpacahq/alpaca-trade-api");
    this.client = new Alpaca({
      keyId: cfg.keyId,
      secretKey: cfg.secret,
      paper: cfg.mode === "paper",
      feeder: cfg.feeder ?? "iex",
    });
  }

  get rateLimit() { return { ...this.rateState }; }

  onRateLimit(handler: (s: { remaining: number; resetAt: number }) => void): () => void {
    this.rateHandlers.add(handler);
    return () => { this.rateHandlers.delete(handler); };
  }

  // ---- account ----------------------------------------------------------
  async getAccount(): Promise<Account> {
    return this.call("getAccount", async () => {
      const a = await this.client.getAccount();
      const dtCount = num(a.daytrade_count);
      return {
        accountId: String(a.id),
        equity: num(a.equity),
        cash: num(a.cash),
        buyingPower: num(a.buying_power),
        marginUsed: num(a.initial_margin),
        daytradesUsed: dtCount,
        daytradesRemaining: a.pattern_day_trader ? Math.max(0, 3 - dtCount) : null,
        patternDayTrader: !!a.pattern_day_trader,
        isOptionsApproved: num(a.options_approved_level) > 0,
        optionsTier: num(a.options_approved_level) as 1 | 2 | 3 | 4,
        cryptoEnabled: !!a.crypto_status && a.crypto_status === "ACTIVE",
        shortingEnabled: !!a.shorting_enabled,
        currency: a.currency ?? "USD",
      };
    });
  }

  async getPositions(): Promise<Position[]> {
    return this.call("getPositions", async () => {
      const ps = await this.client.getPositions();
      return ps.map((p: any) => this.mapPosition(p));
    });
  }

  async getPosition(symbol: string): Promise<Position | null> {
    return this.call("getPosition", async () => {
      try {
        const p = await this.client.getPosition(symbol);
        return this.mapPosition(p);
      } catch (err: any) {
        // SDK throws 404 for unknown positions — that's not an error to surface.
        if (err?.response?.status === 404 || /not found/i.test(err?.message)) return null;
        throw err;
      }
    });
  }

  // ---- orders -----------------------------------------------------------
  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    if (req.option) {
      // Options on Alpaca need the OCC symbol, not the legs.
      throw new BrokerError(this.name, "unsupported",
        "Alpaca options require pre-resolved OCC symbol; pass it as `symbol` and `type=market|limit`");
    }
    return this.call("placeOrder", async () => {
      const orderClass = (req.takeProfit || req.stopLoss) ? "bracket" : "simple";
      const r = await this.client.createOrder({
        symbol: req.symbol,
        side: req.side,
        type: req.type,
        qty: req.qty,
        time_in_force: req.timeInForce ?? "day",
        limit_price: req.limitPrice,
        stop_price: req.stopPrice,
        trail_percent: req.trailPct,
        trail_price: req.trailAmount,
        extended_hours: req.extendedHours,
        client_order_id: req.clientOrderId, // idempotency token
        order_class: orderClass,
        take_profit: req.takeProfit ? { limit_price: req.takeProfit.limitPrice } : undefined,
        stop_loss: req.stopLoss
          ? { stop_price: req.stopLoss.stopPrice, limit_price: req.stopLoss.limitPrice }
          : undefined,
      });
      return this.mapOrder(r);
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.call("cancelOrder", () => this.client.cancelOrder(orderId));
  }

  async replaceOrder(orderId: string, patch: Partial<OrderRequest>): Promise<OrderResult> {
    return this.call("replaceOrder", async () => {
      const r = await this.client.replaceOrder(orderId, {
        qty: patch.qty,
        limit_price: patch.limitPrice,
        stop_price: patch.stopPrice,
        trail: patch.trailPct ?? patch.trailAmount,
        time_in_force: patch.timeInForce,
        client_order_id: patch.clientOrderId,
      });
      return this.mapOrder(r);
    });
  }

  async getOrders(opts?: { status?: "open" | "closed" | "all"; limit?: number }): Promise<OrderResult[]> {
    return this.call("getOrders", async () => {
      const orders = await this.client.getOrders({
        status: opts?.status ?? "open",
        limit: opts?.limit ?? 50,
      });
      return orders.map((o: any) => this.mapOrder(o));
    });
  }

  // ---- streaming --------------------------------------------------------
  streamOrders(handler: (evt: OrderEvent) => void): () => void {
    const ws = this.client.trade_ws ?? this.client.tradeWs;
    if (!ws) throw new BrokerError(this.name, "no_ws", "trade_updates WS unavailable on this SDK version");
    try {
      ws.connect();
      ws.subscribe(["trade_updates"]);
      ws.onTradeUpdate((u: any) => {
        const mapped: OrderEvent = {
          type: this.mapEventType(u.event),
          order: this.mapOrder(u.order),
          at: new Date().toISOString(),
        };
        handler(mapped);
      });
    } catch (err: any) {
      throw new BrokerError(this.name, "ws_subscribe_failed", err?.message ?? "subscribe failed", err);
    }
    return () => { try { ws.disconnect(); } catch { /* idempotent close */ } };
  }

  // ---- shortability -----------------------------------------------------
  async isShortable(symbol: string) {
    return this.call("isShortable", async () => {
      const a = await this.client.getAsset(symbol);
      return {
        shortable: !!a.shortable && !!a.easy_to_borrow,
        feeRate: a.borrow_rate ? num(a.borrow_rate) : undefined,
      };
    });
  }

  // Options chain — Alpaca rolled this out in 2024 but the SDK exposure is
  // partial; this is a stub until the SDK adds first-class methods.
  async getOptionsChain(_underlying: string, _expiration?: string): Promise<unknown> {
    throw new BrokerError(this.name, "unsupported",
      "Alpaca options chain not yet exposed by @alpacahq/alpaca-trade-api; use the data adapter or REST endpoint /v1beta1/options/snapshots/{symbol}");
  }

  async ping() {
    const t0 = Date.now();
    try {
      await this.client.getClock();
      return { ok: true as const, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "ping failed" };
    }
  }

  // ---- internals --------------------------------------------------------
  private async call<T>(op: string, fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(async () => {
      try {
        const out = await fn();
        // Alpaca returns rate-limit headers on the underlying axios response;
        // the SDK doesn't surface them directly. Best-effort decrement.
        if (this.rateState.remaining > 0) this.rateState.remaining--;
        if (this.rateState.remaining < this.rateState.limit * 0.1) {
          for (const h of this.rateHandlers) h({ ...this.rateState });
        }
        return out;
      } catch (err: any) {
        throw new BrokerError(this.name, op, err?.message ?? "alpaca call failed", err);
      }
    });
  }

  private mapOrder(o: any): OrderResult {
    return {
      orderId: String(o.id),
      clientOrderId: o.client_order_id,
      status: this.mapStatus(o.status),
      filledQty: num(o.filled_qty),
      avgFillPrice: o.filled_avg_price ? num(o.filled_avg_price) : undefined,
      submittedAt: o.submitted_at ?? o.created_at ?? new Date().toISOString(),
      message: o.failed_at ? "rejected" : undefined,
    };
  }

  private mapPosition(p: any): Position {
    const qty = num(p.qty);
    return {
      symbol: p.symbol,
      qty,
      avgEntryPrice: num(p.avg_entry_price),
      marketValue: num(p.market_value),
      unrealizedPnl: num(p.unrealized_pl),
      realizedPnl: num(p.unrealized_intraday_pl),
      side: qty >= 0 ? "long" : "short",
      costBasis: num(p.cost_basis),
    };
  }

  private mapStatus(s: string): OrderResult["status"] {
    switch (s) {
      case "new": case "accepted": case "pending_new": return "accepted";
      case "filled": return "filled";
      case "partially_filled": return "partial";
      case "canceled": case "expired": return "canceled";
      case "rejected": case "suspended": return "rejected";
      default: return "pending";
    }
  }

  private mapEventType(e: string): OrderEvent["type"] {
    switch (e) {
      case "new": return "new";
      case "fill": return "fill";
      case "partial_fill": return "partial_fill";
      case "canceled": return "cancel";
      case "rejected": return "reject";
      case "expired": return "expire";
      default: return "new";
    }
  }
}
