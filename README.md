# Financial-Planner

A personal **stocks / ETF / index / multi-asset trading research repo** curated for use with **Claude Code**. Trading-frequency neutral (day-trading and longer-term welcome), with first-class hooks for **TradingView integration** and a clean abstraction over major US brokers.

The repo doubles as a Claude Code **skills pack**: drop the `.claude/skills/` folder into any project (or symlink it into `~/.claude/skills/`) to get a focused set of slash-commands for screening, backtesting, order routing, journaling, and trading discipline.

## What's here

- [`SKILLS.md`](./SKILLS.md) — exhaustive categorized catalog of open-source repos and Claude Code skills relevant to trading, quant finance, dashboards, GitHub workflow, and trading psychology. Compiled from a 10-agent research sweep of the 2026 ecosystem.
- [`FAVOURITE-REPOS.md`](./FAVOURITE-REPOS.md) — curated favourites list: the 8 user-pinned anchors (vinta/awesome-python, awesome-selfhosted, the-book-of-secret-knowledge, sindresorhus/awesome, FinceptTerminal, codegraph, oh-my-pi, anthropics/claude-plugins-official) plus our peer trading-skills packs, with PORT / LINK / CHAIN / PARK / META verdicts.
- [`design/`](./design/) — Voltrex-grade dashboard design pack:
  - [`DASHBOARD-BRIEF.md`](./design/DASHBOARD-BRIEF.md) — visual system, tokens, charts, IA, motion, a11y/perf/i18n (the universal layer)
  - [`EQUITIES-DASHBOARD.md`](./design/EQUITIES-DASHBOARD.md) — equities/ETF/index-specific adaptation (order ticket, PDT, wash-sale, sessions)
  - [`TRADINGVIEW-INTEGRATION.md`](./design/TRADINGVIEW-INTEGRATION.md) — Widgets / Lightweight Charts / Charting Library / alert webhook patterns
  - [`PLATFORM-INTEGRATIONS.md`](./design/PLATFORM-INTEGRATIONS.md) — broker + data-source integration matrix and abstract adapters
  - [`VISUAL-AUDIT.md`](./design/VISUAL-AUDIT.md) — direct pixel-level critique of the Nixtio reference
  - [`code/`](./design/code/) — ready-to-paste TS/React: tokens, BrokerAdapter, DataAdapter, HeroChart, LeaderCard, LockSlider, AnimatedNumber, TVEmbed
- [`.claude/skills/`](./.claude/skills/) — **35 SKILL.md entries** covering quant analytics, portfolio, strategy R&D, options, tax, data, dashboards, TradingView/broker integration, code-graph indexing, and trading discipline.
- [`web/`](./web/) — runnable Next.js 15 host scaffold (App Router, Tailwind v4, UDF endpoint for TradingView Charting Library, hardened tv-webhook receiver). 32 files; `cd web && npm install && npm run dev` to boot.
- [`design/code/adapters/`](./design/code/adapters/) — 7 concrete adapters: `Synthetic` (in-memory paper broker for backtests + tests), `Alpaca`, `IBKR`, `Tradier`, `Polygon`, `YFinance`, `TwelveData`.
- [`mcp/`](./mcp/) — MCP server exposing BrokerAdapter + DataAdapter as tools, for external agents (Cursor, Claude Desktop, Codex).

## Skill categories

- **Quant analytics** — `quant-tearsheet`, `risk-var`, `vol-forecast`, `ta-indicators`, `regime-detect`, `statarb-scan`
- **Portfolio & planning** — `portfolio-optimize`, `retire-fire`, `debt-payoff`
- **Strategy R&D** — `backtest-runner`, `smc-scan`, `pine-new`, `pine-to-python`, `chart-render`, `sentiment-scan`
- **Equities-specific** — `equities-screener`, `etf-analyzer`, `daily-routine`
- **Options** — `options-chain`, `options-strategy-builder`, `greeks-monitor`, `iv-surface`
- **Dev tooling** — `code-map` (codegraph wrapper for refactors)
- **Tax** — `tax-loss-harvest`
- **Data & dashboards** — `market-data`, `dashboard-build`, `tradingview-embed`
- **Integrations** — `alert-webhook`, `broker-connect`
- **Discipline / psychology** — `trade-journal`, `tilt-guard`, `decision-card`, `pre-trade-checklist`, `mistake-miner`, `session-warmup`

## Quick start

```bash
# clone the repo (already done if you're reading this locally)
git clone https://github.com/AMCSQ/Financial-Planner.git
cd Financial-Planner

# option A: use skills only in this repo (recommended for sandboxing)
#   skills auto-discovered from ./.claude/skills/

# option B: install globally for any project
ln -s "$(pwd)/.claude/skills/"* ~/.claude/skills/

# launch Claude Code in the repo
claude
```

Skills are passive markdown — no code is installed until you actually invoke one. Most skills shell out to well-known Python libraries; the SKILL.md tells Claude *which* library, *when* to use it, and *what* output shape to produce.

## Integration story

The repo is designed so swapping platforms is a config change:

- **Brokers** — every order goes through the `BrokerAdapter` interface ([`design/code/BrokerAdapter.ts`](./design/code/BrokerAdapter.ts)). Concrete adapters for Alpaca, IBKR, Tradier, Tastytrade, Schwab. `lib/brokers.ts` picks one based on `BROKER` env var.
- **Data** — every quote / bar / chain / calendar goes through `DataAdapter` ([`design/code/DataAdapter.ts`](./design/code/DataAdapter.ts)). Concrete adapters for Polygon, Tiingo, FMP, Twelve Data, yfinance, FRED, EDGAR, OpenBB MCP.
- **Charts** — three options, decide per page: TV Widgets (free, read-only), Lightweight Charts (Apache-2.0, default), TradingView Charting Library (free after application, full TV UI).
- **Alerts** — TradingView Premium can POST to `/api/tv-webhook`; the receiver validates, gates, recomputes risk-based size, and routes through the active `BrokerAdapter`.

Migration path (each step is a config change once adapters are in place):

1. Synthetic broker + yfinance + FRED + EDGAR — $0/mo backtest stack
2. + Alpaca paper — $0/mo paper trading
3. + Polygon Starter — $29/mo real-time
4. + Alpaca live — flip the active broker
5. + TradingView Charting Library — full TV UI inside your dashboard
6. + TradingView alert webhook — automate signals
7. + IBKR / Tradier / Tastytrade — second broker for hedging or options

## Use context

Set up for **personal authorized trading research and execution**. None of this is financial advice; backtests don't predict futures, and several included tools (sentiment classifiers, LLM agents, pattern detectors) produce signals that look more confident than they should. Verify everything on paper before risking capital.

## License caveats embedded in the catalog

Every entry in [`SKILLS.md`](./SKILLS.md) lists license + recent activity. Hot ones to know:
- **MlFinLab** is *not* truly open source — commercial license required. The catalog routes its techniques to `skfolio` + `timeseriescv` instead.
- **OpenAlgo** is AGPL-3.0 — fine for self-host, risky for SaaS.
- **TradingView Charting Library** is free for commercial use after an application but is **not** OSS — the bundle is gated behind a private repo invite. Don't vendor.
- **everget pinescript indicators** and **BennyThadikaran/stock-pattern** are GPL-3.0 — keep as external invocations, don't vendor.
- Many Pine indicator repos ship without a LICENSE file ("all rights reserved" by default); skills flagged for that use them as reference only.

## Branch

Development happens on `claude/financial-planner-overview-DFwnZ`.
