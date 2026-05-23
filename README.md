# Financial-Planner

> A personal **US equities / ETF / index / options** trading research repo curated for **Claude Code** (and any other LLM-driven coding agent — Cursor, Codex CLI, Gemini CLI, Aider, ...). Crypto ships as a clearly-labeled **secondary** profile, not as a peer.

A single repo that bundles:

1. **35 LLM-callable skills** under `.claude/skills/` — screening, backtesting, journaling, options analytics, tilt-guard, pre-trade checklists, options chains, IV surfaces, FIRE simulations, tax-loss harvesting, …
2. **5 trading-style profiles** under `profiles/` — long-term, swing, day-trading, options, crypto (secondary). Each profile narrows the LLM tool surface and pins a tailored playbook.
3. **A runnable Next.js 15 host** under `web/` — UDF endpoint for the TradingView Charting Library, a hardened `/api/tv-webhook` receiver, and the Voltrex-styled dashboard scaffolding.
4. **An MCP server** under `mcp/` — exposes the `BrokerAdapter` + `DataAdapter` contracts as MCP tools so Cursor, Claude Desktop, Codex, and Gemini CLI can drive the same adapter layer.
5. **A design pack** under `design/` — universal `DASHBOARD-BRIEF.md` + per-profile `design/<persona>/UI-SPEC.md` so every profile lays out for its own attention budget.
6. **A discipline-gate stack** — `pre-trade-checklist` writes `data/state.yaml`; the day-trading profile's `.claude/settings.json` registers a `PreToolUse` hook (`.claude/skills/tilt-guard/check.py`) that **fail-CLOSED blocks every order-placement MCP tool** when state is missing, stale, or `BLOCKED`.

---

## Pick your trading style

Five profiles under [`profiles/`](./profiles/). Each is a curated *view* of the shared skills + adapters + design pack — no duplication.

| Hold horizon | Profile | Skills emphasized | UI-spec |
|---|---|---|---|
| Years (buy & hold) | [`long-term/`](./profiles/long-term/) | `etf-analyzer`, `portfolio-optimize`, `retire-fire`, `tax-loss-harvest` | [`design/long-term/UI-SPEC.md`](./design/long-term/UI-SPEC.md) |
| Days to weeks (swing) | [`swing/`](./profiles/swing/) | `equities-screener`, `backtest-runner`, `trade-journal`, `decision-card` | [`design/swing/UI-SPEC.md`](./design/swing/UI-SPEC.md) |
| Minutes to hours (intraday) | [`day-trading/`](./profiles/day-trading/) | `tilt-guard` (+ `PreToolUse` hook), `alert-webhook`, `broker-connect`, `daily-routine` | [`design/day-trading/UI-SPEC.md`](./design/day-trading/UI-SPEC.md) |
| Days to months (options) | [`options/`](./profiles/options/) | `iv-surface`, `options-strategy-builder`, `greeks-monitor`, `options-chain` | [`design/options/UI-SPEC.md`](./design/options/UI-SPEC.md) |
| Crypto (any horizon) | [`crypto/`](./profiles/crypto/) | **Secondary** — opt-in only; extraction threshold documented in [`EXTRACT.md`](./profiles/crypto/EXTRACT.md) | [`design/crypto/UI-SPEC.md`](./design/crypto/UI-SPEC.md) |

`cd profiles/<persona> && claude` — the persona's `CLAUDE.md` becomes operative LLM memory and narrows your tool surface. Every profile ships an `EXTRACT.md` recipe for spinning into its own dedicated repo when it becomes your primary workflow.

---

## Quick start

```bash
git clone https://github.com/AMCSQ/Financial-Planner.git
cd Financial-Planner

# Run the LLM-driven workflow inside the shared repo:
claude

# Or narrow to a single trading style:
cd profiles/swing && claude

# Optional — make all 35 skills globally callable from any project:
ln -s "$(pwd)/.claude/skills/"* ~/.claude/skills/

# Boot the runnable web dashboard:
cd web && npm install && npm run dev   # → http://localhost:3000

# Or expose the adapter layer over MCP to Cursor / Codex / etc.:
cd mcp && npm install && npm run build && npm start
```

Skills are passive markdown — no code is installed until you invoke one. Each `SKILL.md` tells Claude **which** library to shell out to, **when** to use it, and **what** output shape to produce.

---

## Discipline gate (read before live-trading)

Every order-placement path in this repo is gated against **`data/state.yaml`**, written by the [`pre-trade-checklist`](./.claude/skills/pre-trade-checklist/) skill. The three places that gate are:

1. **`web/lib/webhook/gates.ts`** — runs on every `POST /api/tv-webhook` (TradingView alerts).
2. **`mcp/src/gates.ts`** — runs on every `place_order` MCP tool call from any external agent.
3. **`.claude/skills/tilt-guard/check.py`** — `PreToolUse` hook registered in [`profiles/day-trading/.claude/settings.json`](./profiles/day-trading/.claude/settings.json); blocks Claude Code from invoking the order-placement MCP tools when the gate is closed.

**All three fail CLOSED** — meaning if `data/state.yaml` is missing, unparseable, missing an `updated_at` timestamp, or older than `MCP_STATE_MAX_AGE_MS` (default 4h), the order is **refused**. The same logic applies if `state.status == "BLOCKED"`, `state.trade_today == false`, or the optional `tilt_score >= tilt_threshold`.

Override path is auditable, never silent: log a markdown file under `data/journal/overrides/<minute>.md` in the same UTC minute as the order; the hook detects this and allows the call (still logged to `data/mcp-log/<date>.jsonl`).

See [`SECURITY.md`](./SECURITY.md) for the full attack-surface and threat model.

---

## What's here

| Path | What it is |
|---|---|
| [`profiles/`](./profiles/) | **Start here.** 5 trading-style personas. Each ships `README.md`, `PLAYBOOK.md`, `CLAUDE.md`, `EXTRACT.md`, and `.claude/{settings.json,CLAUDE.md}`. |
| [`AGENTS.md`](./AGENTS.md) | Cross-LLM advisor doc. Cursor/Codex/Gemini-CLI/Aider all read this first. |
| [`CLAUDE.md`](./CLAUDE.md) | Claude-Code-specific addendum on top of `AGENTS.md`. |
| [`.claude/skills/`](./.claude/skills/) | **35 SKILL.md entries** — see categories below. |
| [`design/`](./design/) | Universal dashboard brief + per-profile UI specs + ready-to-paste TS/React in [`design/code/`](./design/code/) (`BrokerAdapter`, `DataAdapter`, `HeroChart`, `LeaderCard`, `LockSlider`, `AnimatedNumber`, `TVEmbed`). |
| [`design/code/adapters/`](./design/code/adapters/) | 7 concrete adapters: `Synthetic`, `Alpaca`, `IBKR`, `Tradier`, `Polygon`, `YFinance`, `TwelveData`. |
| [`web/`](./web/) | Next.js 15 host. App Router, Tailwind v4, TradingView UDF endpoint, hardened `/api/tv-webhook` with `tilt-guard` gating. `cd web && npm install && npm run dev` to boot. |
| [`mcp/`](./mcp/) | MCP server — exposes `BrokerAdapter` + `DataAdapter` as MCP tools. Same gate stack as the web webhook. |
| [`SKILLS.md`](./SKILLS.md) | Categorized catalog of every open-source repo and Claude Code skill consulted. Equity-first ordering; crypto-specific frameworks called out as secondary. |
| [`FAVOURITE-REPOS.md`](./FAVOURITE-REPOS.md) | Curated favourites list with PORT / LINK / CHAIN / PARK / META verdicts. |
| [`data/`](./data/) | Runtime state (gitignored): `state.yaml`, `journal/`, `mcp-log/`. Never commit secrets here. |
| [`reports/`](./reports/) | Generated analyses (code reviews, monthly mistake-mine outputs, …). |

### Skill categories (35 SKILL.md files)

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

---

## For LLMs reading this repo

Read [`AGENTS.md`](./AGENTS.md) first (cross-LLM advisor), then [`CLAUDE.md`](./CLAUDE.md) (Claude-Code specifics). Short version: ask the user what their hold horizon is, route them to the matching profile, narrow the tool surface accordingly, and **never bypass the discipline gates** — fail-closed is the contract.

---

## Integration story

Swapping platforms is a **config change**, never a code change in app/component code:

- **Brokers** — every order flows through the `BrokerAdapter` interface ([`design/code/BrokerAdapter.ts`](./design/code/BrokerAdapter.ts)). Concrete adapters for Alpaca, IBKR, Tradier, Tastytrade, Schwab. `BROKER=alpaca` (or `synthetic`, `ibkr`, …) picks the active one.
- **Data** — every quote / bar / chain / calendar flows through `DataAdapter` ([`design/code/DataAdapter.ts`](./design/code/DataAdapter.ts)). Concrete adapters for Polygon, Tiingo, FMP, Twelve Data, yfinance, FRED, EDGAR, OpenBB MCP. `DATA_REALTIME` + `DATA_HISTORICAL` pick the active providers.
- **Charts** — three options, choose per page: TradingView Widgets (free, read-only), Lightweight Charts (Apache-2.0, default), TradingView Charting Library (free after application, full TV UI).
- **Alerts** — TradingView Premium POSTs to `/api/tv-webhook`; the receiver validates the shared secret, schema-checks the payload, dedupes via Upstash Redis (or in-memory LRU), gates against `tilt-guard` / PDT / buying-power / per-trade risk-ceiling, recomputes R-based size, and routes the order through the active `BrokerAdapter`.

### Migration ladder

| Step | Stack | $/mo | What's new |
|---|---|---|---|
| 1 | Synthetic broker + yfinance + FRED + EDGAR | $0 | Backtest-only, deterministic fixtures |
| 2 | + Alpaca paper | $0 | Live paper trading, no real money |
| 3 | + Polygon Starter | $29 | Real-time US equities |
| 4 | + Alpaca live | varies | Flip `BROKER=alpaca-live` |
| 5 | + TradingView Charting Library | $0 (after invite) | Full TV UI inside the dashboard |
| 6 | + TradingView alert webhook | $14.95+ (TV Premium) | Automated signals → gated → routed |
| 7 | + IBKR / Tradier / Tastytrade | varies | Multi-broker hedging or options-specific routing |

---

## Plugins worth installing

From [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official), once your profile is set:

| Plugin | Why for this repo |
|---|---|
| `skill-creator` | Analyzer + eval harness for SKILL.md authoring; one-shot upgrade pass across the 35 skills here. |
| `code-review` | Multi-agent PR review with confidence scoring; complements `.github/workflows/ci.yml`. |
| `hookify` | Generic `PreToolUse` rule engine; `tilt-guard/check.py` is a specialized variant of this pattern. |

Full list in [`FAVOURITE-REPOS.md §3`](./FAVOURITE-REPOS.md#3-plugins-from-anthropicsclaude-plugins-official-worth-installing).

---

## CI

Three jobs in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

- **`skills-lint`** — runs `scripts/lint-skills.ts --strict` against all 35 `SKILL.md` files. No installs needed (Node 22 `--experimental-strip-types`).
- **`web-check`** — `npx tsc --noEmit` + `biome check .` in `web/`.
- **`mcp-build`** — `npm run build` (`tsc`) in `mcp/`.

`reports/code-review-<date>.md` files capture multi-agent review passes — most recent at [`reports/code-review-2026-05-23.md`](./reports/code-review-2026-05-23.md).

---

## Use context & disclaimer

This repo is set up for **personal authorized trading research and execution**. Nothing here is financial advice. Backtests don't predict futures, and several included tools (sentiment classifiers, LLM agents, pattern detectors) produce signals that look more confident than they should. **Verify everything on paper before risking capital.**

The discipline-gate stack (`tilt-guard`, `pre-trade-checklist`) is not a substitute for self-knowledge — it's a tripwire that codifies rules *you* already decided to follow. Override path exists and is auditable; you'll know when you used it.

---

## License caveats (skills catalog)

Every entry in [`SKILLS.md`](./SKILLS.md) lists license + recent activity. The ones to know:

- **MlFinLab** is *not* truly open source — commercial license required. The catalog routes its techniques to `skfolio` + `timeseriescv` instead.
- **OpenAlgo** is AGPL-3.0 — fine for self-host, risky for SaaS.
- **TradingView Charting Library** is free for commercial use after an application but **not** OSS — the bundle is gated behind a private repo invite. Don't vendor.
- **everget pinescript indicators** and **BennyThadikaran/stock-pattern** are GPL-3.0 — keep as external invocations, don't vendor.
- Many Pine indicator repos ship without a `LICENSE` file ("all rights reserved" by default); skills flagged for that use them as reference only.

---

## Contributing

Development happens on feature branches off `main`. The current Claude-driven iteration lives on [`claude/financial-planner-overview-DFwnZ`](https://github.com/AMCSQ/Financial-Planner/tree/claude/financial-planner-overview-DFwnZ); PRs welcome. The repo uses Biome (web), `tsc --noEmit` (web + mcp), and a custom `scripts/lint-skills.ts` (skills) as the lint/typecheck gate — see CI above.
