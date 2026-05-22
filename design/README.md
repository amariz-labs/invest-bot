# `design/` — Trading Dashboard Brief

Reference design pack for building a Voltrex-grade (Nixtio Dribbble, May 2026) **stocks / ETF / index / multi-asset trading dashboard** with first-class TradingView integration and easy swapping between US brokers.

The visual language is universal; the feature set is equity-trader-first with crypto support retained as a parallel pattern.

## What's inside

### Briefs

| File | What it is |
|---|---|
| [`DASHBOARD-BRIEF.md`](./DASHBOARD-BRIEF.md) | The universal visual brief — tokens, type, charts, IA, motion, a11y/perf/i18n. Applies to any asset class. |
| [`EQUITIES-DASHBOARD.md`](./EQUITIES-DASHBOARD.md) | Equities/ETF/index adaptation — order ticket, position sizer, PDT counter, wash-sale tracker, sessions (pre/RTH/post), watchlist + screener row. |
| [`TRADINGVIEW-INTEGRATION.md`](./TRADINGVIEW-INTEGRATION.md) | TradingView Widgets / Lightweight Charts / Charting Library decision tree + UDF endpoint contract + alert webhook hardening. |
| [`PLATFORM-INTEGRATIONS.md`](./PLATFORM-INTEGRATIONS.md) | Broker + data-source matrix + the abstract `BrokerAdapter` / `DataAdapter` pattern + migration path. |
| [`VISUAL-AUDIT.md`](./VISUAL-AUDIT.md) | Direct pixel-level audit of the Nixtio reference — bugs, locale inconsistencies, micro-craft. |

### Code (ready to paste)

| File | What it is |
|---|---|
| [`code/tokens.ts`](./code/tokens.ts) | TypeScript token export — colors, type scale, spacing, motion. |
| [`code/tokens.css`](./code/tokens.css) | CSS custom properties + bloom keyframes. |
| [`code/BrokerAdapter.ts`](./code/BrokerAdapter.ts) | The broker interface — orders, account, positions, streaming. |
| [`code/DataAdapter.ts`](./code/DataAdapter.ts) | The data interface — bars, quotes, options, fundamentals, calendars. |
| [`code/HeroChart.tsx`](./code/HeroChart.tsx) | TradingView Lightweight Charts wrapper — amber line + yellow pill + crosshair tooltip. Apache-2.0 default. |
| [`code/TVEmbed.tsx`](./code/TVEmbed.tsx) | TradingView Charting Library wrapper — full TV UI when you've applied for and installed the bundle. |
| [`code/LeaderCard.tsx`](./code/LeaderCard.tsx) | Copy-trade leader card with capacity disable, missing-Sharpe state, colorblind-safe trend encoding. |
| [`code/LockSlider.tsx`](./code/LockSlider.tsx) | Radix discrete slider with derived boost output and SR-friendly `aria-valuetext`. |
| [`code/AnimatedNumber.tsx`](./code/AnimatedNumber.tsx) | framer-motion count-up tween that respects `prefers-reduced-motion`. |

## How to use

This pack is **reference + ready-to-paste**, not a runnable project. The `code/` files compile under Next.js 15 + Tailwind 4 + shadcn + Radix once those deps are installed.

The `dashboard-build`, `tradingview-embed`, `broker-connect`, and `alert-webhook` skills all point here when scaffolding new code.

## License posture

The brief itself: original analysis, MIT-licensed under this repo.

External dependencies:
- TradingView Lightweight Charts: **Apache-2.0** — safe to use everywhere.
- TradingView Charting Library: **free for commercial use after application**, *not* open source. Don't vendor.
- TradingView Widgets: **free, attribution required** per TV brand guidelines.
- Radix UI, shadcn, framer-motion, viem, wagmi, alpaca-py, ib_async: all MIT or Apache-2.0.
- OpenAlgo (referenced as a webhook design template): **AGPL-3.0** — fine for self-host, risky for SaaS. Don't vendor — call as external CLI if used.

## Updating

When you change a token, update both `code/tokens.ts` and `code/tokens.css`. When you change an interface, update `code/BrokerAdapter.ts` or `code/DataAdapter.ts` plus all concrete adapters scaffolded by `broker-connect`.
