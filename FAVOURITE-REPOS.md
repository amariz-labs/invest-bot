# Favourite Repositories

A curated list of open-source repos we draw from, point to, or pair with. Each entry includes a one-line description and a verdict for **this** project — keep in mind that "tangential" doesn't mean bad; it means useful for an adjacent need.

Compiled from a parallel scout sweep (May 2026) of the user-pinned list at the top + supersession audit against the broader Claude-Code / trading-skills ecosystem.

> **How to read the verdicts.** PORT = vendor code from there into our repo (clean-room when license forbids). LINK = install via plugin marketplace or `npm/pip install`, don't vendor. CHAIN = our skill should invoke theirs as the actual workhorse. PARK = useful for a side-quest but not for our current scope. META = a curated list to consult, not a single repo to import from.

---

## §1. The 8 user-pinned repos

| Repo | What it is | Verdict | Use here |
|---|---|---|---|
| [vinta/awesome-python](https://github.com/vinta/awesome-python) | Canonical curated Python list | **META** | Source-of-truth for Python infra picks below (§4) |
| [awesome-selfhosted/awesome-selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | Self-hosted apps catalog | **META + LINK** | Pulls direct picks for self-hosted finance stack (§5) |
| [trimstray/the-book-of-secret-knowledge](https://github.com/trimstray/the-book-of-secret-knowledge) | Sysadmin / secrets / pentest cheatsheet | **META** | Reference for hardening the alert-webhook receiver (§6) |
| [sindresorhus/awesome](https://github.com/sindresorhus/awesome) | The meta-awesome list | **META** | Cite once for further exploration; map-of-maps |
| [Fincept-Corporation/FinceptTerminal](https://github.com/Fincept-Corporation/FinceptTerminal) | Bloomberg-clone Qt6/C++ desktop terminal with embedded Python; 22.8k stars; AGPL-3.0 + commercial dual-license | **PARK + clean-room CLONE 3 patterns** | DO NOT copy code (AGPL is MIT-poison). Clean-room: (1) MCP server wrapping our skills, (2) data-hub topic naming, (3) agent-persona prompts. Cite as power-user reference in `design/EQUITIES-DASHBOARD.md` |
| [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | Pre-indexed code knowledge graph for Claude Code / Codex / Cursor (TypeScript, MIT) | **LINK** + optional `code-map` skill wrapper | Cut Grep/Read token spend on the growing `web/` tree. Don't vendor — user installs |
| [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi) | Alternative terminal coding agent (Bun/TypeScript, MIT) | **PARK (tangential)** | Competitor harness to Claude Code, not a library. Useful only as a design reference for hash-anchored edits and subagent patterns |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official) | Curated plugin marketplace, 25 first-party + 15 vendor plugins, Apache-2.0 dominant | **LINK + ADOPT 1 today** | **Install `plugins/skill-creator` now** — it has an analyzer agent + eval harness for SKILL.md, a one-shot upgrade pass for our 35 skills. See §3 for the rest |

---

## §2. The Claude-Code trading-skill ecosystem (our peers)

These ship skills in our shape. Treat as "what does the rest of the field look like."

| Repo | Highlight | Verdict |
|---|---|---|
| [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) | "Trading OS" skill pack — market-analysis, screeners, journaling, post-mortems, session warm-up. Most mature peer. | **LINK + study**. Our `daily-routine`, `session-warmup`, `equities-screener`, `market-data` all echo their patterns; credit them inline |
| [agiprolabs/claude-trading-skills](https://github.com/agiprolabs/claude-trading-skills) | 62 skills across trading, DeFi, quant, **tax**, **options pricing** | **LINK**. Their wash-sale crypto handling + Black-Scholes/binomial/MC options are adjacent to our `tax-loss-harvest` + `options-strategy-builder` |
| [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) | 81 skills across 7 plugins — includes a **behavioral-finance** plugin | **LINK**. Closest peer for our discipline layer |
| [marketcalls/vectorbt-backtesting-skills](https://github.com/marketcalls/vectorbt-backtesting-skills) | 5 invocable skills, 12 strategy templates, walk-forward + optimize; wraps VectorBT + QuantStats | **CHAIN**. Our `backtest-runner` and `quant-tearsheet` now invoke this as the workhorse — see updated SKILL.md files |
| [staskh/trading_skills](https://github.com/staskh/trading_skills) | Claude advisor for options traders | **LINK** (lighter than ours) |
| [OctagonAI/skills](https://github.com/OctagonAI/skills) | Agentic financial research / equity research | **LINK** |
| [himself65/finance-skills](https://github.com/himself65/finance-skills) | General financial analysis | **LINK** |
| [cjpatten/canadian-finance-planner-skill](https://github.com/cjpatten/canadian-finance-planner-skill) | Interview-driven personal financial planner (Canada) | **LINK** — non-US complement |
| [anthropics/skills](https://github.com/anthropics/skills) | 17 official Anthropic skills (docs/design/dev/comms) | **LINK** for the foundation (`skill-creator`, `mcp-builder`, `artifacts-builder`) |
| [anthropics/financial-services](https://github.com/anthropics/financial-services) | Anthropic's enterprise finance examples | **LINK** for canonical patterns |

---

## §3. Plugins from `anthropics/claude-plugins-official` worth installing

All install via `/plugin install <name>@claude-plugins-official`. Apache-2.0 dominant.

| Plugin | Why install | Pairs with our |
|---|---|---|
| `skill-creator` | Analyzer agent + eval harness for SKILL.md. One-shot upgrade pass across our 35 skills | All skills |
| `code-review` | Multi-agent PR review with confidence scoring (operates on git diffs, not journal trades — no collision with `mistake-miner`) | Git workflow |
| `pr-review-toolkit` | Sibling to `code-review` | Git workflow |
| `commit-commands` | Git commit/push/PR helpers | Git workflow |
| `claude-code-setup` | `claude-automation-recommender` scans a codebase and recommends MCP servers / skills / hooks — useful one-shot audit | Repo bootstrapping |
| `frontend-design` | UI/UX implementation guidance | Chains from `dashboard-build` |
| `hookify` | Generic PreToolUse rule engine from `*.local.md` files. **Our `tilt-guard` is a specialized variant of this pattern** | `tilt-guard` |
| `mcp-tunnels` | Private MCP behind cloudflared tunnel | Could front `alert-webhook` |
| `plugin-dev` | 7 skills (skill-dev, plugin-structure, plugin-settings, hook-dev, mcp-integration, command-dev, agent-dev). Templates for `stdio`/`sse`/`http`-server JSON | Future: publishing our pack |

External MCP integrations worth knowing about (don't install all — they bloat the tool list): `github`, `linear`, `playwright`, `context7`, `firebase`, `gitlab`, `terraform`.

---

## §4. Python infra picks (from `vinta/awesome-python`)

Filling plumbing gaps in [`SKILLS.md`](./SKILLS.md):

| Library | Why for us | Slot |
|---|---|---|
| [Polars](https://github.com/pola-rs/polars) | Rust-backed columnar DataFrame; 5–50× faster than pandas on OHLCV pipelines | Replaces pandas in any hot-path; ETL for `data/quotes/` |
| [DuckDB](https://github.com/duckdb/duckdb) | In-process OLAP SQL over Parquet/CSV; ideal for journal analytics without Postgres | Backs `mistake-miner` clustering queries; ad-hoc joins across `data/trades/` |
| [Prefect](https://github.com/PrefectHQ/prefect) | Workflow orchestrator for scheduled jobs | Nightly EOD / screener / IV-surface refreshes |
| [Pydantic](https://github.com/pydantic/pydantic) + [pydantic-settings](https://github.com/pydantic/pydantic-settings) | Typed env/settings loader | Skill config + MCP server config |
| [httpx](https://github.com/encode/httpx) | Async HTTP client | Broker REST + webhook tests |
| [Typer](https://github.com/fastapi/typer) | FastAPI-style CLI builder | Skill entrypoints when they shell out |
| [Rich](https://github.com/Textualize/rich) | Terminal tables/progress | `daily-routine` formatted output |
| [cryptography](https://github.com/pyca/cryptography) | Fernet/AES at-rest encryption | Broker tokens in `data/credentials/` |

### Three finance libraries missing from SKILLS.md (worth adding)

- [zvtm/zvt](https://github.com/zvtm/zvt) — Pluggable multi-source quant framework (A-shares + US + crypto). Adjacent to our `market-data` skill.
- [microprediction/microprediction](https://github.com/microprediction/microprediction) — Live time-series prediction streams. Complements `vol-forecast`.
- [gerrymanoim/exchange_calendars](https://github.com/gerrymanoim/exchange_calendars) — Authoritative trading-session calendars for 60+ venues. Plugs into `daily-routine` and the chart's RTH/extended-hours shading.

---

## §5. Self-hosted finance stack (from `awesome-selfhosted`)

These pair with our skills as data sources, dashboards, or storage layers.

| Tool | What it solves | Pairs with |
|---|---|---|
| [Ghostfolio](https://github.com/ghostfolio/ghostfolio) | Open-source wealth + portfolio dashboard (AGPL-3.0) | Supplies the holdings UI our skills don't render; `quant-tearsheet` + `portfolio-optimize` |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | Double-entry personal finance manager (AGPL-3.0) | Cash/bank side ignored by trading-centric `trade-journal`; webhook API lets `debt-payoff` write back |
| [Actual Budget](https://github.com/actualbudget/actual) | Envelope/zero-based budgeting, local-first (MIT) | Personal cash flow alongside trading P&L |
| [Maybe](https://github.com/maybe-finance/maybe) | Net-worth + investment OS (AGPL-3.0, community-forked) | Cross-account view |
| [Beancount](https://github.com/beancount/beancount) + [Fava](https://github.com/beancount/fava) | Plain-text accounting + web UI | Tax-prep companion to `tax-loss-harvest` |
| [TradeNote](https://github.com/Eleven-Trading/TradeNote) | Self-hosted Vue + MongoDB trading journal | Our `trade-journal` skill emits TradeNote-compatible YAML frontmatter |
| [Vaultwarden](https://github.com/dani-garcia/vaultwarden) | Rust Bitwarden server | Storage for broker API keys outside `.env.local` |
| [Grafana](https://github.com/grafana/grafana) | Dashboards + observability | Live monitoring for `alert-webhook` |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | Self-hosted uptime monitor | Ensures the webhook receiver is alive when TradingView fires |

---

## §6. Secrets hygiene (from `the-book-of-secret-knowledge`)

For keeping broker/data API keys out of the repo and safe in transit.

| Tool | Use |
|---|---|
| [SOPS](https://github.com/getsops/sops) + [age](https://github.com/FiloSottile/age) | Encrypt `web/.env.local` → `web/.env.local.enc.yaml`, commit safely, decrypt in a pre-`next dev` hook |
| [gitleaks](https://github.com/gitleaks/gitleaks) | Pre-commit secret scanner — blocks `ALPACA_SECRET_KEY=...` from sneaking into commits |
| [trufflehog](https://github.com/trufflesecurity/trufflehog) | Verifies leaked keys are actually live (Alpaca, Polygon, etc.) |
| [HashiCorp Vault](https://github.com/hashicorp/vault) | Dynamic secrets / leases / transit-encrypt for broker tokens |
| [Caddy](https://github.com/caddyserver/caddy) | Auto-TLS reverse proxy in front of the Next.js webhook receiver |
| [mkcert](https://github.com/FiloSottile/mkcert) | Local-dev trusted certs |
| [lynis](https://github.com/CISOfy/lynis) | Host hardening audit before exposing the receiver |

---

## §7. "Use external instead" — chain pointers for our skills

Skills that overlap with a more mature upstream tool. Default behaviour kept; consider chaining to the upstream when scope grows.

| Our skill | When to chain to | Note |
|---|---|---|
| `quant-tearsheet` | [marketcalls/vectorbt-backtesting-skills](https://github.com/marketcalls/vectorbt-backtesting-skills) `quick-stats` | Already wraps QuantStats HTML + 30+ metrics — our SKILL.md now chains to theirs |
| `backtest-runner` | [marketcalls/vectorbt-backtesting-skills](https://github.com/marketcalls/vectorbt-backtesting-skills) | 12 strategy templates + walk-forward + optimize — our SKILL.md now chains |
| `risk-var` | [agiprolabs/claude-trading-skills](https://github.com/agiprolabs/claude-trading-skills) | Crypto-first; equities GARCH-conditional is ours |
| `ta-indicators` | marketcalls (TA-Lib helpers in backtests) | Standalone "enrich DataFrame" framing kept |
| `portfolio-optimize` | [OpenBB Portfolio Optimization](https://docs.openbb.co/platform/reference/portfolio) | OpenBB has its own UI; ours emits a file + adapter |
| `sentiment-scan` | [OpenBB](https://github.com/OpenBB-finance/OpenBB) behavioral menu, [FinceptTerminal](https://github.com/Fincept-Corporation/FinceptTerminal) | In-UI features there, portable skill here |
| `equities-screener` | [OpenBB equity/screener](https://docs.openbb.co/platform/reference/equity/screener), tradermonty CANSLIM/VCP/FinViz | Our Finviz-RVOL-earnings-proximity recipe is finer-grained |
| `daily-routine` | tradermonty "Core + Satellite routines" | Conceptual parent; our orchestrator chains our skills |
| `options-strategy-builder` | agiprolabs options pricing, staskh options advisor | Theirs are crypto/advisor flavored; ours is equities multi-leg + Reg-T |
| `tax-loss-harvest` | agiprolabs Tax & Compliance | Theirs covers crypto wash-sales; our cross-account IRA (Rev. Rul. 2008-5) is distinct |
| `market-data` | tradermonty market-data-pipeline | Theirs is more mature; ours is wired to our `DataAdapter` |
| `trade-journal` | [TradeNote](https://github.com/Eleven-Trading/TradeNote) | Our YAML frontmatter is schema-compatible |
| `pine-new` | [awesome-pinescript](https://github.com/pAulseperformance/awesome-pinescript), [TradersPost/pinescript-agents](https://github.com/TradersPost/pinescript-agents) | We use awesome-pinescript as ground-truth refs |
| `dashboard-build` | [streamlit/agent-skills](https://github.com/streamlit/agent-skills) | Streamlit's official meta-skill |
| `design/TRADINGVIEW-INTEGRATION.md` | [tradingview/awesome-tradingview](https://github.com/tradingview/awesome-tradingview) | Their index covers libs and widgets; ours adds UDF + webhook hardening |

---

## §8. Meta-sources (consult; don't quote per-link)

- [sindresorhus/awesome](https://github.com/sindresorhus/awesome) — Map of awesome lists. One anchor link per topic when you need to go broader.
- [wilsonfreitas/awesome-quant](https://github.com/wilsonfreitas/awesome-quant) — ~26k stars; the quant umbrella.
- [wangzhe3224/awesome-systematic-trading](https://github.com/wangzhe3224/awesome-systematic-trading) — Systematic trading.
- [merovinh/best-of-algorithmic-trading](https://github.com/merovinh/best-of-algorithmic-trading) — Ranked weekly.
- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — Subagent collections.
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — Skill collections.
- [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — MCP ecosystem.
- [tradingview/awesome-tradingview](https://github.com/tradingview/awesome-tradingview) — Charting libs and widgets.
- [pAulseperformance/awesome-pinescript](https://github.com/pAulseperformance/awesome-pinescript) — Pine idioms.
- [unicodeveloper/awesome-nextjs](https://github.com/unicodeveloper/awesome-nextjs) — Frontend stack for `web/`.

---

## §9. License reminder

Every external repo above has its own license. Special calls:

- **AGPL-3.0** (FinceptTerminal, OpenAlgo, Ghostfolio, Firefly III, Maybe): self-host is fine; **never vendor code** into our MIT repo — that flips the whole project to AGPL.
- **Commercial dual-license** (FinceptTerminal has `docs/COMMERCIAL_LICENSE.md`): treat AGPL terms strictly; the dual offer is for entities that want to escape AGPL.
- **GPL-3.0** (some Pine indicator collections, OpenAlgo plugins): same — keep as external CLI invocation, don't import.
- **Apache-2.0** (TradingView Lightweight Charts, many `claude-plugins-official` items): safe to use widely; preserve attribution.
- **MIT** (most TS/React deps, most awesome lists' members): default-safe.
- **No LICENSE file** ("all rights reserved" by default): reference only — never copy code.

When in doubt, run the external tool as a subprocess and consume its outputs over a clean boundary (JSON, files, stdout), rather than importing it.
