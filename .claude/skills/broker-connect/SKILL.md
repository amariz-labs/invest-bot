---
name: broker-connect
description: Scaffold a `BrokerAdapter` implementation for a US broker (Alpaca, Interactive Brokers, Tradier, Tastytrade, Schwab) wired to this repo's abstract interface. Invoke when the user says "connect Alpaca", "wire up IBKR", "broker integration", or wants paper trading.
---

# When to use

Once per broker. Output is a concrete class implementing the `BrokerAdapter` interface in [`design/code/BrokerAdapter.ts`](../../../design/code/BrokerAdapter.ts), so the rest of the codebase stays broker-agnostic.

# Upstream SDKs

| Broker | OSS SDK | License | Modes |
|---|---|---|---|
| **Alpaca** | [`alpaca-py`](https://github.com/alpacahq/alpaca-py) / [`alpaca-trade-api-js`](https://github.com/alpacahq/alpaca-trade-api-js) | Apache-2.0 | paper + live |
| **Interactive Brokers** | [`ib_async`](https://github.com/ib-api-reloaded/ib_async) (Py) / [`@stoqey/ib`](https://github.com/stoqey/ib) (TS) | BSD-2 / MIT | paper + live (need TWS / Gateway running) |
| **Tradier** | first-party REST docs | n/a | paper + live |
| **Tastytrade** | community Python wrappers | mixed | live (options-focused) |
| **Schwab / TD** | [`schwab-py`](https://github.com/alexgolec/schwab-py) | MIT | live (OAuth) |

# Recipe

```
/broker-connect --broker alpaca --mode paper
/broker-connect --broker ibkr --mode paper --host 127.0.0.1 --port 7497
/broker-connect --broker tradier --mode paper --token $TRADIER_TOKEN
```

Scaffolds `lib/adapters/<broker>.ts` implementing every method on `BrokerAdapter`:

```ts
import { BrokerAdapter, OrderRequest, OrderResult, Position, Account } from "@/design/code/BrokerAdapter";
import Alpaca from "@alpacahq/alpaca-trade-api";

export class AlpacaBrokerAdapter implements BrokerAdapter {
  readonly name = "alpaca";
  readonly mode: "paper" | "live";
  private client: Alpaca;

  constructor(cfg: { keyId: string; secret: string; mode: "paper" | "live" }) {
    this.mode = cfg.mode;
    this.client = new Alpaca({
      keyId: cfg.keyId,
      secretKey: cfg.secret,
      paper: cfg.mode === "paper",
    });
  }

  async getAccount(): Promise<Account> {
    const a = await this.client.getAccount();
    return {
      accountId: a.id,
      equity: Number(a.equity),
      cash: Number(a.cash),
      buyingPower: Number(a.buying_power),
      marginUsed: Number(a.initial_margin),
      daytradesUsed: Number(a.daytrade_count),
      daytradesRemaining: a.pattern_day_trader ? Math.max(0, 3 - Number(a.daytrade_count)) : null,
      patternDayTrader: !!a.pattern_day_trader,
      isOptionsApproved: a.options_approved_level > 0,
      optionsTier: a.options_approved_level as any,
      shortingEnabled: !!a.shorting_enabled,
      currency: a.currency,
    };
  }

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const r = await this.client.createOrder({
      symbol: req.symbol,
      side: req.side,
      type: req.type === "stop_limit" ? "stop_limit" : req.type,
      qty: req.qty,
      time_in_force: req.timeInForce ?? "day",
      limit_price: req.limitPrice,
      stop_price: req.stopPrice,
      extended_hours: req.extendedHours,
      client_order_id: req.clientOrderId,
      // Bracket via order_class
      order_class: req.takeProfit || req.stopLoss ? "bracket" : "simple",
      take_profit: req.takeProfit && { limit_price: req.takeProfit.limitPrice },
      stop_loss: req.stopLoss && { stop_price: req.stopLoss.stopPrice, limit_price: req.stopLoss.limitPrice },
    });
    return {
      orderId: r.id,
      clientOrderId: r.client_order_id,
      status: r.status as any,
      filledQty: Number(r.filled_qty),
      avgFillPrice: r.filled_avg_price ? Number(r.filled_avg_price) : undefined,
      submittedAt: r.submitted_at,
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.client.cancelOrder(orderId);
  }

  async replaceOrder(orderId: string, patch: Partial<OrderRequest>): Promise<OrderResult> {
    const r = await this.client.replaceOrder(orderId, {
      qty: patch.qty,
      limit_price: patch.limitPrice,
      stop_price: patch.stopPrice,
      time_in_force: patch.timeInForce,
    });
    return { orderId: r.id, status: r.status as any, filledQty: Number(r.filled_qty), submittedAt: r.submitted_at };
  }

  async getOrders(opts?: { status?: "open" | "closed" | "all"; limit?: number }): Promise<OrderResult[]> {
    const orders = await this.client.getOrders({
      status: opts?.status ?? "open",
      limit: opts?.limit ?? 50,
    });
    return orders.map((o: any) => ({
      orderId: o.id, clientOrderId: o.client_order_id,
      status: o.status, filledQty: Number(o.filled_qty),
      avgFillPrice: o.filled_avg_price ? Number(o.filled_avg_price) : undefined,
      submittedAt: o.submitted_at,
    }));
  }

  async getPositions(): Promise<Position[]> {
    const positions = await this.client.getPositions();
    return positions.map((p: any) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      avgEntryPrice: Number(p.avg_entry_price),
      marketValue: Number(p.market_value),
      unrealizedPnl: Number(p.unrealized_pl),
      realizedPnl: Number(p.unrealized_intraday_pl),
      side: Number(p.qty) >= 0 ? "long" : "short",
      costBasis: Number(p.cost_basis),
    }));
  }

  async getPosition(symbol: string): Promise<Position | null> {
    try {
      const p = await this.client.getPosition(symbol);
      return {
        symbol: p.symbol, qty: Number(p.qty),
        avgEntryPrice: Number(p.avg_entry_price),
        marketValue: Number(p.market_value),
        unrealizedPnl: Number(p.unrealized_pl),
        realizedPnl: Number(p.unrealized_intraday_pl),
        side: Number(p.qty) >= 0 ? "long" : "short",
        costBasis: Number(p.cost_basis),
      };
    } catch { return null; }
  }

  streamOrders(handler: (evt: any) => void): () => void {
    const ws = this.client.trade_ws;
    ws.connect();
    ws.subscribe(["trade_updates"]);
    ws.onTradeUpdate((u: any) => handler({ type: u.event, order: u.order, at: new Date().toISOString() }));
    return () => ws.disconnect();
  }

  async isShortable(symbol: string) {
    const a = await this.client.getAsset(symbol);
    return { shortable: !!a.shortable, feeRate: a.borrow_rate ? Number(a.borrow_rate) : undefined };
  }

  async ping() {
    const t0 = Date.now();
    try {
      await this.client.getClock();
      return { ok: true as const, latencyMs: Date.now() - t0 };
    } catch (err: any) {
      return { ok: false as const, error: err.message };
    }
  }
}
```

For non-Alpaca brokers, the same skeleton applies — the inside of each method changes, the outside (the `BrokerAdapter` contract) stays exact.

# Output convention

```
lib/adapters/<broker>.ts
lib/brokers.ts                  # wires the active adapter based on env
.env.example                    # adds the broker's keys
```

# Install on first use

```bash
# Alpaca
npm i @alpacahq/alpaca-trade-api
# IBKR (TS)
npm i @stoqey/ib
# IBKR (Python)
pip install ib_async
# Schwab (Python)
pip install schwab-py
```

# Don't

- Don't run `live` mode without verifying paper-mode works first for at least a week.
- Don't store broker keys in committed files — `.env.local` only, gitignored.
- Don't share one adapter instance across multiple users — each user has their own credentials and account context.
- Don't catch broker errors silently — surface them to the webhook receiver and audit log.
- Don't assume buying power on margin = 4× cash — depends on regulation and time (overnight margin is typically 2×, day-trade margin 4×).
- Don't ping live brokers in CI — use the `SyntheticBrokerAdapter` for tests.
