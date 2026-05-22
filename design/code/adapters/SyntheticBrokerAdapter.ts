// SyntheticBrokerAdapter — deterministic in-memory paper broker.
// Used by the backtest-runner skill so backtests and live trades share one
// code path. Market orders fill instantly at the price supplied via feed();
// limit / stop orders sit in `openOrders` until feed() walks them.

import {
  BrokerAdapter, OrderRequest, OrderResult, Position, Account, OrderEvent, Side,
} from "../BrokerAdapter";
import { BrokerError, num } from "./errors";

interface OpenOrder extends OrderResult {
  req: OrderRequest;
  lastPriceSeen?: number;
  trailAnchor?: number; // for trailing stops
  parentId?: string;
  childIds?: string[];
}

export interface SyntheticConfig {
  startingCash?: number;
  feePerShare?: number;    // commission model
  slippageBps?: number;    // applied to market fills
  defaultLastPrice?: number;
}

export class SyntheticBrokerAdapter implements BrokerAdapter {
  readonly name = "synthetic";
  readonly mode = "synthetic" as const;

  private cash: number;
  private startingCash: number;
  private positions = new Map<string, Position>();
  private orders = new Map<string, OpenOrder>();
  private lastPrice = new Map<string, number>();
  private feePerShare: number;
  private slippageBps: number;
  private defaultLastPrice: number;
  private orderSeq = 0;
  private handlers = new Set<(e: OrderEvent) => void>();
  private realizedSession = new Map<string, number>();

  constructor(cfg: SyntheticConfig = {}) {
    this.startingCash = cfg.startingCash ?? 100_000;
    this.cash = this.startingCash;
    this.feePerShare = cfg.feePerShare ?? 0;
    this.slippageBps = cfg.slippageBps ?? 0;
    this.defaultLastPrice = cfg.defaultLastPrice ?? 0;
  }

  // ---- price feed -------------------------------------------------------
  // Backtest runner calls feed() on each bar tick. Walking open orders here
  // keeps the data path single-threaded and deterministic.
  feed(quote: { symbol: string; last: number }): void {
    const last = num(quote.last);
    if (last <= 0) return;
    this.lastPrice.set(quote.symbol, last);
    this.refreshPositionMark(quote.symbol, last);
    for (const o of [...this.orders.values()]) {
      if (o.req.symbol !== quote.symbol) continue;
      if (o.status === "accepted" || o.status === "pending" || o.status === "partial") {
        this.tryMatch(o, last);
      }
    }
  }

  // ---- account ----------------------------------------------------------
  async getAccount(): Promise<Account> {
    const equity = this.cash + [...this.positions.values()].reduce((s, p) => s + p.marketValue, 0);
    return {
      accountId: "SYNTH-1",
      equity,
      cash: this.cash,
      buyingPower: this.cash * 2, // Reg-T overnight = 2x
      marginUsed: 0,
      daytradesUsed: 0,
      daytradesRemaining: null,
      patternDayTrader: false,
      isOptionsApproved: true,
      optionsTier: 2,
      cryptoEnabled: true,
      shortingEnabled: true,
      currency: "USD",
    };
  }

  async getPositions(): Promise<Position[]> {
    return [...this.positions.values()].map(p => ({ ...p }));
  }

  async getPosition(symbol: string): Promise<Position | null> {
    const p = this.positions.get(symbol);
    return p ? { ...p } : null;
  }

  // ---- orders -----------------------------------------------------------
  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    if (!req.symbol || req.qty <= 0) {
      throw new BrokerError(this.name, "bad_request", "symbol + positive qty required");
    }
    // Bracket orders: parent + 2 children, linked by parentId / childIds.
    const isBracket = !!(req.takeProfit || req.stopLoss);
    const parent = this.makeOrder(req);
    this.emit({ type: "new", order: this.stripInternal(parent), at: parent.submittedAt });

    if (isBracket) {
      const children: OpenOrder[] = [];
      const counterSide: Side = req.side === "buy" ? "sell" : "buy";
      if (req.takeProfit) {
        children.push(this.makeOrder({
          symbol: req.symbol, side: counterSide, type: "limit",
          qty: req.qty, limitPrice: req.takeProfit.limitPrice,
          timeInForce: "gtc", clientOrderId: req.clientOrderId ? `${req.clientOrderId}-tp` : undefined,
        }, parent.orderId));
      }
      if (req.stopLoss) {
        children.push(this.makeOrder({
          symbol: req.symbol, side: counterSide,
          type: req.stopLoss.limitPrice ? "stop_limit" : "stop",
          qty: req.qty, stopPrice: req.stopLoss.stopPrice, limitPrice: req.stopLoss.limitPrice,
          timeInForce: "gtc", clientOrderId: req.clientOrderId ? `${req.clientOrderId}-sl` : undefined,
        }, parent.orderId));
      }
      parent.childIds = children.map(c => c.orderId);
    }

    // Market orders fill immediately at last price if known.
    if (req.type === "market") {
      const lp = this.lastPrice.get(req.symbol) ?? this.defaultLastPrice;
      if (lp > 0) this.fill(parent, lp);
      else parent.status = "pending"; // no price yet — backtest may feed() later
    }

    return this.stripInternal(parent);
  }

  async cancelOrder(orderId: string): Promise<void> {
    const o = this.orders.get(orderId);
    if (!o) throw new BrokerError(this.name, "not_found", `order ${orderId} not found`);
    if (o.status === "filled" || o.status === "canceled") return;
    o.status = "canceled";
    this.emit({ type: "cancel", order: this.stripInternal(o), at: new Date().toISOString() });
    // Cancel bracket children if cancelling parent.
    if (o.childIds) for (const cid of o.childIds) await this.cancelOrder(cid).catch(() => undefined);
  }

  async replaceOrder(orderId: string, patch: Partial<OrderRequest>): Promise<OrderResult> {
    const o = this.orders.get(orderId);
    if (!o) throw new BrokerError(this.name, "not_found", `order ${orderId} not found`);
    if (o.status === "filled" || o.status === "canceled") {
      throw new BrokerError(this.name, "bad_state", `cannot replace ${o.status} order`);
    }
    o.req = { ...o.req, ...patch };
    return this.stripInternal(o);
  }

  async getOrders(opts?: { status?: "open" | "closed" | "all"; limit?: number }): Promise<OrderResult[]> {
    const status = opts?.status ?? "open";
    const limit = opts?.limit ?? 50;
    const all = [...this.orders.values()];
    const filtered = all.filter(o => {
      if (status === "all") return true;
      if (status === "open") return o.status === "accepted" || o.status === "pending" || o.status === "partial";
      return o.status === "filled" || o.status === "canceled" || o.status === "rejected";
    });
    return filtered.slice(-limit).map(o => this.stripInternal(o));
  }

  streamOrders(handler: (evt: OrderEvent) => void): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  async isShortable(_symbol: string) {
    return { shortable: true, feeRate: 0 };
  }

  async ping() {
    return { ok: true as const, latencyMs: 0 };
  }

  // ---- internals --------------------------------------------------------
  private makeOrder(req: OrderRequest, parentId?: string): OpenOrder {
    const orderId = `SYN-${++this.orderSeq}`;
    const o: OpenOrder = {
      orderId,
      clientOrderId: req.clientOrderId,
      status: "accepted",
      filledQty: 0,
      submittedAt: new Date().toISOString(),
      req,
      parentId,
      trailAnchor: req.type === "trailing_stop"
        ? (this.lastPrice.get(req.symbol) ?? this.defaultLastPrice)
        : undefined,
    };
    this.orders.set(orderId, o);
    return o;
  }

  private stripInternal(o: OpenOrder): OrderResult {
    return {
      orderId: o.orderId,
      clientOrderId: o.clientOrderId,
      status: o.status,
      filledQty: o.filledQty,
      avgFillPrice: o.avgFillPrice,
      submittedAt: o.submittedAt,
      message: o.message,
    };
  }

  private tryMatch(o: OpenOrder, last: number): void {
    const r = o.req;
    let shouldFill = false;
    let fillPx = last;
    switch (r.type) {
      case "market":
        shouldFill = true; break;
      case "limit":
        if (r.side === "buy" && r.limitPrice !== undefined && last <= r.limitPrice) {
          shouldFill = true; fillPx = Math.min(last, r.limitPrice);
        } else if (r.side === "sell" && r.limitPrice !== undefined && last >= r.limitPrice) {
          shouldFill = true; fillPx = Math.max(last, r.limitPrice);
        }
        break;
      case "stop":
        if (r.side === "buy" && r.stopPrice !== undefined && last >= r.stopPrice) {
          shouldFill = true; fillPx = last;
        } else if (r.side === "sell" && r.stopPrice !== undefined && last <= r.stopPrice) {
          shouldFill = true; fillPx = last;
        }
        break;
      case "stop_limit":
        if (r.side === "buy" && r.stopPrice !== undefined && last >= r.stopPrice
            && r.limitPrice !== undefined && last <= r.limitPrice) {
          shouldFill = true; fillPx = Math.min(last, r.limitPrice);
        } else if (r.side === "sell" && r.stopPrice !== undefined && last <= r.stopPrice
            && r.limitPrice !== undefined && last >= r.limitPrice) {
          shouldFill = true; fillPx = Math.max(last, r.limitPrice);
        }
        break;
      case "trailing_stop": {
        // Anchor tracks high-water (sell) or low-water (buy); trigger when price
        // reverses by trailPct / trailAmount.
        const trailAmt = r.trailAmount ?? (r.trailPct ? last * (r.trailPct / 100) : 0);
        if (o.trailAnchor === undefined) o.trailAnchor = last;
        if (r.side === "sell") {
          o.trailAnchor = Math.max(o.trailAnchor, last);
          if (last <= o.trailAnchor - trailAmt) { shouldFill = true; fillPx = last; }
        } else {
          o.trailAnchor = Math.min(o.trailAnchor, last);
          if (last >= o.trailAnchor + trailAmt) { shouldFill = true; fillPx = last; }
        }
        break;
      }
    }
    if (shouldFill) this.fill(o, fillPx);
  }

  private fill(o: OpenOrder, px: number): void {
    const slip = (this.slippageBps / 10_000) * px * (o.req.side === "buy" ? 1 : -1);
    const fillPx = px + slip;
    const qty = o.req.qty;
    const notional = qty * fillPx;
    const fees = qty * this.feePerShare;

    if (o.req.side === "buy") this.cash -= notional + fees;
    else this.cash += notional - fees;

    this.applyPositionDelta(o.req.symbol, o.req.side, qty, fillPx);
    o.filledQty = qty;
    o.avgFillPrice = fillPx;
    o.status = "filled";
    this.emit({ type: "fill", order: this.stripInternal(o), at: new Date().toISOString() });

    // OCO behavior for brackets: filling one child cancels the sibling.
    if (o.parentId) {
      const parent = this.orders.get(o.parentId);
      if (parent?.childIds) {
        for (const sib of parent.childIds) {
          if (sib !== o.orderId) this.cancelOrder(sib).catch(() => undefined);
        }
      }
    }
  }

  private applyPositionDelta(symbol: string, side: Side, qty: number, px: number): void {
    const existing = this.positions.get(symbol);
    const delta = side === "buy" ? qty : -qty;
    if (!existing) {
      this.positions.set(symbol, {
        symbol,
        qty: delta,
        avgEntryPrice: px,
        marketValue: delta * px,
        unrealizedPnl: 0,
        realizedPnl: this.realizedSession.get(symbol) ?? 0,
        side: delta >= 0 ? "long" : "short",
        costBasis: delta * px,
      });
      return;
    }
    const newQty = existing.qty + delta;
    // Closing/reducing the position realizes PnL.
    if (Math.sign(existing.qty) !== Math.sign(delta) && existing.qty !== 0) {
      const closedQty = Math.min(Math.abs(delta), Math.abs(existing.qty));
      const realized = closedQty * (px - existing.avgEntryPrice) * (existing.qty > 0 ? 1 : -1);
      const sess = (this.realizedSession.get(symbol) ?? 0) + realized;
      this.realizedSession.set(symbol, sess);
    }
    if (newQty === 0) {
      this.positions.delete(symbol);
      return;
    }
    // Weighted-avg entry only when adding to same side.
    const sameSide = Math.sign(newQty) === Math.sign(existing.qty);
    const avg = sameSide
      ? (existing.avgEntryPrice * existing.qty + px * delta) / newQty
      : px;
    this.positions.set(symbol, {
      symbol,
      qty: newQty,
      avgEntryPrice: avg,
      marketValue: newQty * px,
      unrealizedPnl: (px - avg) * newQty,
      realizedPnl: this.realizedSession.get(symbol) ?? 0,
      side: newQty >= 0 ? "long" : "short",
      costBasis: avg * newQty,
    });
  }

  private refreshPositionMark(symbol: string, px: number): void {
    const p = this.positions.get(symbol);
    if (!p) return;
    p.marketValue = p.qty * px;
    p.unrealizedPnl = (px - p.avgEntryPrice) * p.qty;
  }

  private emit(e: OrderEvent): void {
    for (const h of this.handlers) {
      try { h(e); } catch { /* listener errors must not break the loop */ }
    }
  }

  // Test helpers ---------------------------------------------------------
  reset(): void {
    this.cash = this.startingCash;
    this.positions.clear();
    this.orders.clear();
    this.lastPrice.clear();
    this.realizedSession.clear();
    this.orderSeq = 0;
  }
}
