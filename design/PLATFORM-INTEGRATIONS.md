# Platform Integrations — Brokers, Data Sources, Adapters

A single abstraction for every external trading platform so swapping Alpaca for IBKR is a config change, not a rewrite. Built on two interfaces — `BrokerAdapter` and `DataAdapter` — implemented in [`code/BrokerAdapter.ts`](./code/BrokerAdapter.ts) and [`code/DataAdapter.ts`](./code/DataAdapter.ts).

## Integration matrix

### Brokers (US equities + options focus)

| Broker | API style | Best for | OSS SDK | License | Notes |
|---|---|---|---|---|---|
| **Alpaca** | REST + WS | Day-trading equities, commission-free | [`alpaca-py`](https://github.com/alpacahq/alpaca-py) (Py) · [`alpaca-trade-api-js`](https://github.com/alpacahq/alpaca-trade-api-js) | Apache-2.0 | Paper trading included, great DX |
| **Interactive Brokers (IBKR)** | Native socket (TWS / Gateway) | Pro / multi-asset / non-US | [`ib_async`](https://github.com/ib-api-reloaded/ib_async) (Py) · [`@stoqey/ib`](https://github.com/stoqey/ib) (TS) | BSD-2 / MIT | Need TWS/Gateway running; ~`ib_insync` retired, use `ib_async` |
| **Tradier** | REST + WS | Options, fast onboarding | first-party docs | n/a | Free brokerage account required |
| **Tastytrade** | REST + WS | Options-heavy traders | community Python wrappers | mixed | Cleanest options chain API |
| **Schwab / TD Ameritrade** | REST (OAuth2) | Mainstream US retail | [`schwab-py`](https://github.com/alexgolec/schwab-py) | MIT | TD's API was rolled into Schwab in 2024–25 |
| **Webull** | unofficial REST | Mobile-first retail | community wrappers | unofficial | Caution — no official API |
| **E*TRADE** | REST (OAuth1) | Legacy retail | community wrappers | mixed | Painful auth |

Crypto exchanges via [`ccxt`](https://github.com/ccxt/ccxt) (107+ exchanges) are still supported under the same `BrokerAdapter` interface — see the parent crypto brief.

### Data sources

| Provider | Coverage | Pricing | OSS client | Notes |
|---|---|---|---|---|
| **Polygon.io** (now Massive.com) | US equities + options + crypto + FX | $29–$200/mo | [`polygon-io/client-js`](https://github.com/polygon-io/client-js) MIT | Best free real-time tier |
| **Tiingo** | US equities + crypto + fundamentals | $10–$50/mo | community wrappers | Cheap historical |
| **Financial Modeling Prep (FMP)** | Equities + fundamentals + economic | $14–$70/mo | community wrappers | Broad coverage cheaply |
| **IEX Cloud** | US equities | Sunset late 2024 → migrate to **Twelve Data** or Polygon | — | RIP |
| **Twelve Data** | Stocks + FX + crypto + indices | free + tiers | [`twelvedata-python`](https://github.com/twelvedata/twelvedata-python) | Solid free tier |
| **yfinance** | Yahoo scrape | free | [`ranaroussi/yfinance`](https://github.com/ranaroussi/yfinance) Apache-2.0 | Rate-limited, no real-time |
| **FRED** | US macro | free | [`mortada/fredapi`](https://github.com/mortada/fredapi) BSD | API key required, generous limits |
| **SEC EDGAR** | Filings | free | [`dgunning/edgartools`](https://github.com/dgunning/edgartools) MIT | No key, no limits — gold |
| **Alpha Vantage** | Equities + FX + fundamentals | free key (25/day) | [`alpha_vantage`](https://github.com/RomelTorres/alpha_vantage) | Very limited free tier |
| **OpenBB MCP** | Aggregator | free | [`OpenBB-finance/OpenBB`](https://github.com/OpenBB-finance/OpenBB) | First-party MCP for Claude Code |
| **Finnhub** | Equities + alt data | free + tiers | community wrappers | Useful sentiment endpoints |

## Recommended default stack

Cheapest viable starting point:

| Need | Pick | Why |
|---|---|---|
| Real-time US equities | **Polygon Starter** ($29) or **Alpaca free** | Both fine; Alpaca is free if you trade with them |
| Historical daily | **yfinance** (free) | Good enough for screeners + backtests |
| Macro | **FRED** (free) | Industry standard |
| Filings | **EDGAR via edgartools** (free) | Best-in-class |
| Broker (paper) | **Alpaca paper account** (free) | One-click, full WS + REST |
| Broker (live) | **Alpaca / IBKR / Tradier** depending on use case | See matrix above |

## Abstract adapter pattern

The point of `BrokerAdapter` / `DataAdapter` is that **every screen, every skill, every backtest** in this repo speaks one interface. Swapping Alpaca for IBKR is editing `lib/brokers.ts`:

```ts
// lib/brokers.ts
import { AlpacaBrokerAdapter } from "./adapters/alpaca";
import { IBKRBrokerAdapter } from "./adapters/ibkr";

export const brokers = {
  active: process.env.BROKER === "ibkr"
    ? new IBKRBrokerAdapter({ host: "localhost", port: 7497, clientId: 1 })
    : new AlpacaBrokerAdapter({ keyId: process.env.ALPACA_KEY!, secret: process.env.ALPACA_SECRET! }),
};
```

Every component / route / skill does `import { brokers } from "@/lib/brokers"` and calls `brokers.active.placeOrder(...)`. The rest of the codebase is broker-agnostic.

Same pattern for data:

```ts
// lib/data.ts
import { PolygonDataAdapter } from "./adapters/polygon";
import { YFinanceDataAdapter } from "./adapters/yfinance";

export const data = {
  realtime: new PolygonDataAdapter({ apiKey: process.env.POLYGON_KEY! }),
  historical: new YFinanceDataAdapter(),
};
```

You can mix sources per layer. The UDF endpoint that feeds TradingView Charting Library proxies through `data.realtime` and `data.historical`.

## What's in the code/

- [`code/BrokerAdapter.ts`](./code/BrokerAdapter.ts) — the interface. Order types, account, positions, streaming.
- [`code/DataAdapter.ts`](./code/DataAdapter.ts) — bars, quotes, options chains, fundamentals, calendars.
- Concrete implementations (e.g. `code/adapters/alpaca.ts`) are templated but not included — they require live API keys to validate. See the SDK READMEs above.

## Auth patterns

- **Server-side credentials only.** Never ship broker keys to the client. Order placement always routes through your own API.
- **OAuth flows (Schwab, E*TRADE)** require a redirect URI registered with the broker. Use NextAuth.js with a custom provider.
- **Rotating tokens (Tastytrade, Schwab):** the adapter must implement `refresh()` and call it before each request if the token is < 60s from expiry.

## Rate-limit-aware adapters

Every adapter should expose:

```ts
adapter.rateLimit                  // { limit: 200, remaining: 187, resetAt: 1730000000 }
adapter.onRateLimit(handler)       // event when remaining < 10%
```

Use [`p-queue`](https://github.com/sindresorhus/p-queue) (MIT) inside each adapter to serialize requests under the documented limit. Don't expose this to the consumer — it should be transparent.

## Testing

- Unit-test adapters against **recorded fixtures** (use [`msw`](https://github.com/mswjs/msw)) — not live APIs in CI.
- Integration-test against **paper accounts** (Alpaca paper, IBKR paper TWS) on a nightly cron, not per-PR.
- Have a **synthetic broker** adapter for fast deterministic tests: it accepts every order, fills instantly at the next bar's open, tracks positions in-memory.

```ts
// code/adapters/synthetic.ts (sketch)
export class SyntheticBrokerAdapter implements BrokerAdapter {
  private positions = new Map<string, Position>();
  private cash = 100_000;
  // ...
  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    // instant fill at last known price; update positions + cash.
  }
}
```

The `backtest-runner` skill uses `SyntheticBrokerAdapter` so backtests and live trades go through the same code path — that's the highest-leverage testing decision in the whole stack.

## Compliance per broker

- **Alpaca:** Reg-T margin enforced server-side; PDT applies; can short, fractional shares supported.
- **IBKR:** Account-type matrix (cash / Reg-T / portfolio margin) affects everything; reads `accountSummary()` for live BP.
- **Tradier:** Options levels gated by your application tier.
- **Tastytrade:** Options-only ergonomics; not great for pure equities.
- **Schwab:** Strict OAuth; reads tax-lot info clearly.

Your adapter's `getAccount()` must surface enough fields for the order-ticket pre-trade gate (§3 of [`EQUITIES-DASHBOARD.md`](./EQUITIES-DASHBOARD.md)) to decide whether to allow the trade. If a broker doesn't expose a field, return `null` and let the UI render "Not available — check your broker's website" rather than guessing.

## Migration path

You don't need to integrate everything on day one. A realistic build order:

1. **Synthetic + yfinance + FRED + EDGAR** — full backtest + research stack, $0/month.
2. **+ Alpaca paper** — paper trading, $0/month.
3. **+ Polygon Starter** — real-time data, $29/month.
4. **+ Alpaca live** — flip the active broker key.
5. **+ TradingView Charting Library** — full TV UI inside your dashboard, free.
6. **+ TradingView alert webhook** — automate signals from TV strategies.
7. **+ IBKR / Tradier / Tastytrade** — add second broker for hedging, options-heavy strategies, or non-US markets.

Each step is a config change once the adapters are in place.
