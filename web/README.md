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
- **Pages:** `/` home dashboard (KPI strip + hero placeholder + watchlist placeholder), `/vault/[symbol]` symbol detail.
- **TradingView UDF API** at `/api/udf/{config,symbols,search,history,time}` — point the Charting Library at `udfBaseUrl: "/api/udf"`.
- **TradingView webhook receiver** at `/api/tv-webhook` — Zod schema, shared-secret auth, kill switch, in-memory idempotency, JSONL audit log, pre-trade gates.
- **Broker + Data adapter slots** (`lib/brokers.ts`, `lib/data.ts`) with dynamic-import wiring; default is `synthetic`.
- **Components:** `Header`, `Sidebar`, `KpiStrip`, `KpiTile`, `Bloom`.
- **Format helpers** (`lib/format.ts`) — every numeric goes through `Intl.NumberFormat`.

## Conventions

- TypeScript strict, no `any` except where third-party SDKs require it (annotated `// SDK type`).
- Numeric display: always `lib/format.ts`. Never hand-roll thousand separators (the source Voltrex screenshot mixed EU/US — don't repeat the bug).
- `"use client"` only where genuinely interactive. Server components by default.
- Code style: Biome defaults — `npm run lint` / `npm run format`.

## What's not included (yet)

- Concrete broker adapters (Alpaca, IBKR, Tradier) — slots are stubbed with clear TODOs.
- Concrete data adapters (Polygon, yfinance) — same pattern.
- The TradingView Charting Library itself — gated by license. Drop your bundle in `public/charting_library/` (gitignored) once you have access.
- Redis-backed idempotency for the webhook — in-memory LRU works for single-instance; swap to Redis for multi-instance deployments.

## Project structure

```
app/
  layout.tsx            root shell + theme + fonts
  page.tsx              home dashboard
  globals.css           Tailwind v4 + design tokens
  vault/[symbol]/       symbol detail
  api/
    udf/                TradingView UDF datafeed endpoints
    tv-webhook/         hardened alert receiver
components/             Header, Sidebar, KpiStrip, KpiTile, Bloom
lib/
  brokers.ts            BrokerAdapter selection (env-driven)
  data.ts               DataAdapter selection
  format.ts             Intl.NumberFormat helpers
  webhook/
    schema.ts           Zod payload
    gates.ts            PDT / BP / risk pre-trade checks
    idempotency.ts      LRU dedup
    auditlog.ts         JSONL append-only log
```

See [`../design/DASHBOARD-BRIEF.md`](../design/DASHBOARD-BRIEF.md), [`../design/EQUITIES-DASHBOARD.md`](../design/EQUITIES-DASHBOARD.md), and [`../design/TRADINGVIEW-INTEGRATION.md`](../design/TRADINGVIEW-INTEGRATION.md) for the full spec.
