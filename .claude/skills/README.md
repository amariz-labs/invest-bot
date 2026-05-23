# `.claude/skills/` — Financial-Planner skill pack

35 SKILL.md entries, each a thin wrapper that tells Claude *which* well-known open-source library to use, *when* to use it, and *what* output shape to produce. Nothing is auto-installed — the first time you invoke a skill, Claude will pip-install or `uvx` the underlying library into the active venv.

The pack is **trading-frequency neutral** — same skills work for day-trading equities, swing trading ETFs, options spreads, and longer-term portfolio rebalancing.

## Index

### Quant analytics
- [`quant-tearsheet`](./quant-tearsheet/SKILL.md) — QuantStats HTML/Markdown performance report
- [`risk-var`](./risk-var/SKILL.md) — historical / parametric / GARCH VaR & CVaR
- [`vol-forecast`](./vol-forecast/SKILL.md) — GARCH(1,1) / EGARCH conditional vol forecast
- [`ta-indicators`](./ta-indicators/SKILL.md) — enrich an OHLCV DataFrame with `ta` / `pandas-ta` / TA-Lib
- [`regime-detect`](./regime-detect/SKILL.md) — HMM bull/bear/high-vol classifier
- [`statarb-scan`](./statarb-scan/SKILL.md) — cointegration-based pairs scanner

### Portfolio & personal planning
- [`portfolio-optimize`](./portfolio-optimize/SKILL.md) — PyPortfolioOpt + Riskfolio-Lib + skfolio
- [`retire-fire`](./retire-fire/SKILL.md) — historical-cycle + Monte Carlo FIRE simulator
- [`debt-payoff`](./debt-payoff/SKILL.md) — avalanche vs snowball schedule

### Strategy R&D
- [`backtest-runner`](./backtest-runner/SKILL.md) — Backtesting.py + VectorBT scaffolder
- [`smc-scan`](./smc-scan/SKILL.md) — Smart Money Concepts (FVG / OB / BOS / liquidity)
- [`pine-new`](./pine-new/SKILL.md) — Pine Script v5/v6 indicator/strategy generator
- [`pine-to-python`](./pine-to-python/SKILL.md) — translate Pine → Backtesting.py / vectorbt parity with divergence-trap checklist
- [`chart-render`](./chart-render/SKILL.md) — annotated lightweight-charts-python image
- [`sentiment-scan`](./sentiment-scan/SKILL.md) — FinBERT sentiment on RSS / headlines

### Options
- [`iv-surface`](./iv-surface/SKILL.md) — IV rank, IV percentile (52w), term-structure slope, 25-delta skew, optional SVI surface
- [`options-chain`](./options-chain/SKILL.md) — fetch/filter chain (moneyness, DTE, OI, IV) across Tradier / Polygon / Tastytrade
- [`options-strategy-builder`](./options-strategy-builder/SKILL.md) — multi-leg strategies (verticals / iron condor / calendar / collar) with payoff + margin + broker-tier gate
- [`greeks-monitor`](./greeks-monitor/SKILL.md) — live portfolio greeks (Δ Γ Θ ν) with threshold alerts

### Equities-specific
- [`equities-screener`](./equities-screener/SKILL.md) — Finviz-style screener with saved filter packs
- [`etf-analyzer`](./etf-analyzer/SKILL.md) — expense ratio, overlap, sector exposure, factor tilt
- [`daily-routine`](./daily-routine/SKILL.md) — pre-market / midday / EOD workflow orchestrator

### Data & dashboards
- [`market-data`](./market-data/SKILL.md) — fetch OHLCV via yfinance / ccxt / OpenBB / FRED / EDGAR
- [`dashboard-build`](./dashboard-build/SKILL.md) — scaffold Streamlit BI dashboard (now also links to the Voltrex-grade Next.js brief)
- [`tradingview-embed`](./tradingview-embed/SKILL.md) — TV Widgets / Lightweight Charts / Charting Library embed

### Integrations
- [`alert-webhook`](./alert-webhook/SKILL.md) — hardened TradingView-alert receiver wired to BrokerAdapter
- [`broker-connect`](./broker-connect/SKILL.md) — scaffold a concrete BrokerAdapter for Alpaca / IBKR / Tradier / Tastytrade / Schwab

### Dev tooling
- [`code-map`](./code-map/SKILL.md) — wrapper around `codegraph` for symbol/import graphs before multi-file refactors

### Tax
- [`tax-loss-harvest`](./tax-loss-harvest/SKILL.md) — wash-sale-aware loss harvesting + Schedule D / Form 8949 prep + cross-account IRA trap detection

### Discipline / psychology
- [`trade-journal`](./trade-journal/SKILL.md) — log a trade as YAML-frontmatter MD (TradeNote-compatible)
- [`tilt-guard`](./tilt-guard/SKILL.md) — behavioral circuit breaker with `PreToolUse` hook
- [`decision-card`](./decision-card/SKILL.md) — Annie Duke pre-mortem keyed to order ID
- [`pre-trade-checklist`](./pre-trade-checklist/SKILL.md) — go/no-go gate writing `state.yaml`
- [`mistake-miner`](./mistake-miner/SKILL.md) — embedding-clustered recurring failure modes
- [`session-warmup`](./session-warmup/SKILL.md) — pre-market cognitive priming

## Conventions

All skills share a few conventions to keep them composable:

- **Data lives in `data/`** at the repo root: `data/quotes/<symbol>.parquet`, `data/journal/YYYY-MM-DD.md`, `data/reviews/YYYY-MM.md`, `data/state.yaml`, `data/trades/YYYY-MM-DD/<id>.json`, `data/webhook-log/YYYY-MM-DD.jsonl`.
- **Cache lives in `~/.claude/cache/financial-planner/<skill>/`** so re-running is cheap.
- **Reports written to `reports/<skill>/<timestamp>/`** — never overwritten, so backtest history is preserved.
- **Python skills shell out via `uvx --with <lib>`** when possible so we never pollute the system Python.
- **TS/web skills emit files into `app/`, `components/`, `lib/`** of a Next.js host project; they don't bring up their own server.
- **License-flagged libraries (GPL, AGPL, no-LICENSE) are invoked as external CLIs** rather than imported, to avoid creating a derivative work.

## Hooks

Three discipline skills install settings.json hooks:

- `tilt-guard` registers a `PreToolUse` hook on order-placement MCP tools that reads `data/state.yaml` and blocks the call if the tilt score is too high.
- `pre-trade-checklist` writes `data/state.yaml` and refuses to proceed until the checklist is signed.
- `alert-webhook` enforces the same `state.yaml` gate plus PDT and buying-power checks before forwarding to the broker — so TradingView alerts can't bypass tilt-guard.

The hooks live in `.claude/settings.json` (created on first invocation of those skills).

## Adapter contracts

When skills need brokers or data they go through one of two abstract interfaces defined in [`../../design/code/`](../../design/code/):

- `BrokerAdapter` — orders, positions, account, streaming.
- `DataAdapter` — bars, quotes, options chains, fundamentals, calendars.

`broker-connect` scaffolds concrete adapters; everything else just imports `lib/brokers.ts` and `lib/data.ts`. Swap broker by changing one env var.
