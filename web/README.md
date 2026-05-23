# Financial Planner — Web

Next.js 15 host for the Voltrex-styled equities dashboard. Implements the design pack in [`../design/`](../design/).

## Quick start

```bash
npm install
cp .env.example .env.local
# Edit .env.local — at minimum, the default BROKER=synthetic works with no keys.
npm run dev
```

Open <http://localhost:3000>.

## What's scaffolded

- **App Router** with PPR (`experimental.ppr: "incremental"`) — static shell + dynamic chart/account holes.
- **Tailwind v4** wired to the design tokens in `app/globals.css` (`@theme` block mirrors `../design/code/tokens.css`).
- **Pages:** `/` home dashboard (KPI strip + live `HeroChart` + live `Watchlist`), `/vault/[symbol]` symbol detail.
- **Hero chart** — Lightweight Charts wrapper with candles + volume, crosshair, amber current-value pill, dynamic-import for bundle hygiene.
- **Watchlist** — sortable table with sparkline column, color-by-sign + glyph, 1Hz stale-row scanner, `aria-live` throttled to ≥0.25% deltas.
- **Connection-status pill** — top-right overlay on the chart and table-top on the watchlist; subscribes to `data.realtime.subscribeStatus`; amber for `reconnecting`, red for `stale`, fades on `connected`.
- **TradingView UDF API** at `/api/udf/{config,symbols,search,history,time}` — point the Charting Library at `udfBaseUrl: "/api/udf"`.
- **TradingView webhook receiver** at `/api/tv-webhook` — Zod schema, shared-secret auth, kill switch, idempotency (memory or Upstash Redis via the `IdempotencyStore` strategy), JSONL audit log, pre-trade gates.
- **Idempotency store** — `MemoryIdempotencyStore` (default) and `RedisIdempotencyStore` (active when `UPSTASH_REDIS_REST_URL` is set), selected automatically by `getDefaultStore()`.
- **Broker + Data adapter slots** (`lib/brokers.ts`, `lib/data.ts`) with dynamic-import wiring; default is `synthetic`.
- **Components:** `Header`, `Sidebar`, `KpiStrip`, `KpiTile`, `Bloom`, `HeroChart`, `Watchlist`.
- **Format helpers** (`lib/format.ts`) — every numeric goes through `Intl.NumberFormat`.
- **UDF verify script** — `npm run verify-udf` hits each UDF route with a synthetic payload and asserts the contract.

## Conventions

- TypeScript strict, no `any` except where third-party SDKs require it (annotated `// SDK type`).
- Numeric display: always `lib/format.ts`. Never hand-roll thousand separators (the source Voltrex screenshot mixed EU/US — don't repeat the bug).
- `"use client"` only where genuinely interactive. Server components by default.
- Code style: Biome defaults — `npm run lint` / `npm run format`.

## What's not included (yet)

- Live wiring of the concrete broker adapters into `lib/brokers.ts` — the implementations exist in `../design/code/adapters/` (Alpaca, IBKR, Tradier, Synthetic). Wire by switching the dynamic-import target and setting `BROKER=` + the relevant API keys.
- Live wiring of the concrete data adapters into `lib/data.ts` — same pattern (Polygon, YFinance, TwelveData, Synthetic in `../design/code/adapters/`).
- The TradingView Charting Library itself — gated by license. Drop your bundle in `public/charting_library/` (gitignored) once you have access.

## Project structure

```
app/
  layout.tsx            root shell + theme + fonts
  page.tsx              home dashboard (KpiStrip + HeroChart + Watchlist)
  globals.css           Tailwind v4 + design tokens
  vault/[symbol]/       symbol detail
  api/
    udf/                TradingView UDF datafeed endpoints
    tv-webhook/         hardened alert receiver
components/
  Header.tsx            top bar + nav + wallet/broker chip
  Sidebar.tsx           left icon rail
  KpiStrip.tsx          5-tile KPI ribbon
  KpiTile.tsx           single-tile primitive
  Bloom.tsx             violet bloom backdrop
  HeroChart.tsx         lightweight-charts candle+volume + status pill
  Watchlist.tsx         sortable table + sparkline + stale-row scanner
lib/
  brokers.ts            BrokerAdapter selection (env-driven)
  data.ts               DataAdapter selection (placeholder with connected status)
  format.ts             Intl.NumberFormat helpers
  types.ts              local mirror of BrokerAdapter / DataAdapter / ConnectionStatus
  webhook/
    schema.ts           Zod payload
    gates.ts            PDT / BP / risk pre-trade checks (reads ../data/state.yaml)
    idempotency.ts      Memory / Redis strategy + getDefaultStore() factory
    auditlog.ts         JSONL append-only log
scripts/
  verify-udf.ts         UDF contract smoke-test
  README.md             how to run the verify script
```

See [`../design/DASHBOARD-BRIEF.md`](../design/DASHBOARD-BRIEF.md), [`../design/EQUITIES-DASHBOARD.md`](../design/EQUITIES-DASHBOARD.md), and [`../design/TRADINGVIEW-INTEGRATION.md`](../design/TRADINGVIEW-INTEGRATION.md) for the full spec.
