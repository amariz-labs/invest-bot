# Adapters

Concrete implementations of `BrokerAdapter` and `DataAdapter`. **No SDK is bundled** — install only what you actually use. Every adapter is a thin shim over a third-party SDK / REST API that conforms to the abstract interface in [`../BrokerAdapter.ts`](../BrokerAdapter.ts) and [`../DataAdapter.ts`](../DataAdapter.ts).

## Brokers

| Adapter | Class | SDK / dep | Install | Modes | Env required |
|---|---|---|---|---|---|
| Synthetic (in-memory) | `SyntheticBrokerAdapter` | none | — | synthetic | — |
| Alpaca | `AlpacaBrokerAdapter` | `@alpacahq/alpaca-trade-api` | `npm i @alpacahq/alpaca-trade-api` | paper / live | `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` |
| Interactive Brokers | `IBKRBrokerAdapter` | `@stoqey/ib` + TWS or IB Gateway | `npm i @stoqey/ib` | paper (7497) / live (7496) | TWS / Gateway running locally |
| Tradier | `TradierBrokerAdapter` | REST + `ws` | `npm i ws` | paper / live | `TRADIER_TOKEN`, `TRADIER_ACCOUNT` |

## Data sources

| Adapter | Class | SDK / dep | Install | Tier | Env required |
|---|---|---|---|---|---|
| Polygon.io (Massive.com) | `PolygonDataAdapter` | REST + `ws` | `npm i ws` (optional: `@polygon.io/client-js`) | starter+ | `POLYGON_KEY` |
| Yahoo Finance (via Python bridge) | `YFinanceDataAdapter` | `yfinance` Python pkg + server `/api/yfinance` route | `pip install yfinance pandas` | free | bridge route only |
| Twelve Data | `TwelveDataDataAdapter` | REST + `ws` | `npm i ws` | free / starter / pro | `TWELVEDATA_KEY` |

## Usage pattern

```ts
// lib/brokers.ts
import {
  AlpacaBrokerAdapter, IBKRBrokerAdapter, SyntheticBrokerAdapter,
} from "@/design/code/adapters";

export const brokers = {
  active:
    process.env.BROKER === "ibkr"
      ? new IBKRBrokerAdapter({ host: "127.0.0.1", port: 7497, clientId: 1, mode: "paper" })
    : process.env.BROKER === "synthetic"
      ? new SyntheticBrokerAdapter({ startingCash: 100_000 })
      : new AlpacaBrokerAdapter({
          keyId: process.env.ALPACA_KEY_ID!,
          secret: process.env.ALPACA_SECRET_KEY!,
          mode: (process.env.ALPACA_MODE as "paper" | "live") ?? "paper",
        }),
};
```

```ts
// lib/data.ts
import { PolygonDataAdapter, YFinanceDataAdapter } from "@/design/code/adapters";

export const data = {
  realtime: new PolygonDataAdapter({ apiKey: process.env.POLYGON_KEY! }),
  historical: new YFinanceDataAdapter({ bridgeUrl: "/api/yfinance" }),
};
```

## Paper vs live

- **Always validate in paper for at least a week** before flipping to live. Alpaca and IBKR both have first-class paper accounts.
- **Synthetic** is the right choice for tests, backtests, and CI. Backtests and live trades share one code path — that's the highest-leverage testing decision in this stack.
- **Live mode credentials should never be committed.** Use `.env.local` (gitignored) and pass through the constructor.
- **Don't ping live brokers in CI.** Use `SyntheticBrokerAdapter` for unit tests; use paper accounts on a nightly cron for integration tests.

## Rate limits

Every concrete adapter exposes a `rateLimit` snapshot and serializes requests internally with a small `SerialQueue` (concurrency = 1, minimum spacing per provider). You don't need to manage this on the caller side. Polygon and Tradier surface `X-RateLimit-*` headers and update the snapshot live. Alpaca and Twelve Data only expose a usage endpoint, so the snapshot is best-effort.

If you want hard scheduling, replace `SerialQueue` with [`p-queue`](https://github.com/sindresorhus/p-queue) in each adapter's constructor — it's API-compatible for our `enqueue` use.

## Idempotency

`OrderRequest.clientOrderId` is passed through to every broker (Alpaca: `client_order_id`, Tradier: `tag`, IBKR: `orderRef`). Brokers reject duplicates server-side — that's the safe default. Always set this in production.

## Error handling

All adapter calls wrap third-party failures in `BrokerError` / `DataError` with a `broker`/`provider` name and an operation `code`. The original error is preserved on `.cause`. The expected handling pattern is:

```ts
try {
  await brokers.active.placeOrder(req);
} catch (err) {
  if (err instanceof BrokerError) auditLog(err.broker, err.code, err.message);
  throw err; // surface to UI
}
```

## RecordingAdapter (VCR for adapters)

[`RecordingAdapter.ts`](./RecordingAdapter.ts) wraps any concrete `BrokerAdapter` / `DataAdapter` and persists every request/response pair to `data/adapter-fixtures/<adapterName>/<method>/<argsHash>.json` (and JSONL session files for `streamOrders` / `streamQuotes`). Three modes — `"record"` (calls inner + saves), `"replay"` (no inner call, reads fixture; missing fixture is a hard error with a "run with mode='record' first" suggestion), `"passthrough"` (pure delegate). Args are hashed with sha256-of-stable-stringified-JSON (12 hex chars). `Date` and `BigInt` round-trip safely via tagged markers (`__date__`, `__bigint__`). All writes go through atomic write-via-temp-rename so half-written fixtures never get committed.

Example: wrap Alpaca, record once, then run tests offline alongside [`msw`](https://mswjs.io/) for any non-adapter HTTP:

```ts
// tests/setup.ts
import { AlpacaBrokerAdapter, RecordingBrokerAdapter } from "@/design/code/adapters";

const real = new AlpacaBrokerAdapter({
  keyId: process.env.ALPACA_KEY_ID!, secret: process.env.ALPACA_SECRET_KEY!, mode: "paper",
});

export const broker = new RecordingBrokerAdapter(real, {
  mode: process.env.RECORD === "1" ? "record" : "replay",
  fixturesDir: "data/adapter-fixtures",
});

// Run once with RECORD=1 npm test to capture fixtures, then in CI:
// fixtures live in git, no network calls happen, msw handles any
// non-adapter HTTP (e.g. webhook callbacks) the test triggers.
```

**Caveat:** time-sensitive responses (`getAccount()` equity, `getQuote().last`, `submittedAt`) will drift between record-time and replay-time. Assert on shape, not exact numbers — or freeze the clock during recording.

## "unsupported" stubs

Several methods are stubbed with `throw new Error("unsupported: ...")` where the underlying SDK doesn't expose the capability — e.g. `IBKRBrokerAdapter.getOptionsChain` (would require `reqSecDefOptParams` plumbing not yet built), `AlpacaBrokerAdapter.getOptionsChain` (SDK doesn't surface the options-snapshot endpoints yet), `YFinanceDataAdapter.getEarningsCalendar` (yfinance is per-symbol only). Mix-and-match adapters: if you need options chains on IBKR, layer in `PolygonDataAdapter` for that one call.

## Connection status protocol

Every `DataAdapter` exposes a `subscribeStatus(handler)` channel that emits a `ConnectionStatus` discriminated union — `connected`, `reconnecting` (with `attempts`), `stale` (with optional `lastTickAt`), or `disconnected` (with optional `error`). Handlers are called **synchronously with the current status on subscribe** so a UI mounting mid-session never sits blank, then on every subsequent transition. The `lastTickAt(symbol)` method returns the unix-ms timestamp of the most recent quote observed for a given symbol, or `null` if none yet — consumers (e.g. `Watchlist`) compare it to `Date.now()` to dim individual rows that have gone quiet while the connection itself is still healthy.

WebSocket-backed adapters (`PolygonDataAdapter`, `TwelveDataDataAdapter`) emit `connected` on socket open, `reconnecting` with an incrementing attempt counter on close (exponential backoff 1s/2s/4s/8s/30s, capped at 8 attempts), `stale` when the socket is open but no ticks arrived in 15s, and `disconnected` after giving up. After every successful reconnect they re-fetch the latest daily bar for every still-subscribed symbol — debounced by 500ms so a flapping connection doesn't slam the REST API — so consumers' `prevClose` and `dayΔ` correct themselves automatically. REST-only adapters (`YFinanceDataAdapter`) treat each successful `getBars`/`getQuote` as a heartbeat and flip to `stale` after 60s of quiet. The `isStale(status, maxQuietMs)` helper exported from `DataAdapter.ts` is the single source of truth for whether a UI should show a degraded indicator.

## Adding a new adapter

1. Create `<Name>BrokerAdapter.ts` or `<Name>DataAdapter.ts` implementing every method on the interface.
2. Wrap third-party calls in `this.call("opName", async () => {...})` for queueing + error wrapping.
3. Coerce SDK numeric fields with `num(value, fallback)` from `./errors`.
4. Re-export from `index.ts`.
5. Add a row to the table above.

The interfaces in `../BrokerAdapter.ts` and `../DataAdapter.ts` are the contract. Don't widen them — every consumer (backtest runner, screener, dashboard, webhook receiver) depends on the existing shape.
