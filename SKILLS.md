# Open-Source GitHub Repositories & Claude Code Skills — Trading-Focused Catalog

Curated May 2026 from a parallel research sweep across 10 sub-agents. Star counts and activity dates are point-in-time snapshots; treat any external repo as untrusted code until reviewed (see "Security Notes" at the bottom).

The five mega-collections referenced in the Analytics Vidhya March 2026 article "Top 5 GitHub Repositories to get Free Claude Code Skills (1000+ Skills)" are listed first; everything else is grouped by use case.

---

## §0. The Five Mega-Collections (Analytics Vidhya, Mar 2026)

| # | Repo | Scope | License | Install |
|---|---|---|---|---|
| 1 | [anthropics/skills](https://github.com/anthropics/skills) | 17 official Anthropic skills (docx, xlsx, pdf, pptx, artifacts-builder, frontend-design, theme-factory, skill-creator, mcp-builder, claude-api, webapp-testing, internal-comms, doc-coauthoring, algorithmic-art, slack-gif-creator, brand-guidelines, canvas-design) | MIT | `/plugin marketplace add anthropics/skills` → `/plugin install document-skills@anthropic-agent-skills` |
| 2 | [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) | 1,400+ skills incl. `quant-analyst`, `business-analyst`, `startup-analyst`, `financial-analyst`, role-based bundles, workflows | Mixed | `npx antigravity-awesome-skills --claude` |
| 3 | [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | 1,000+ curated production skills + Composio API integrations | Mixed (per-folder) | `git clone` and copy into `~/.claude/skills/` |
| 4 | [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | 313+ skills across 12 domains (engineering, finance, commercial, c-level, marketing, ...) | MIT | `/plugin marketplace add alirezarezvani/claude-skills` |
| 5 | [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | 200+ curated incl. official Coinbase/Binance/Stripe/Sentry/Trail-of-Bits/CodeRabbit packs | MIT | Awesome-list — install each linked skill per its own README |

Companion mega-collections worth knowing:
- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — 100+ specialist subagents.
- [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) — 135 agents + 35 curated skills + 42 commands + 150+ plugins + 19 hooks + 14 MCP configs.
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) (ECC) — research-first harness, 60 subagents, 232 skills.
- [obra/superpowers](https://github.com/obra/superpowers) — TDD-enforced 7-phase workflow plugin (~202k stars).
- [yusufkaraaslan/Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) — convert docs/repos/PDFs into SKILL.md bundles.

---

## §1. Trading Strategy Frameworks (Backtesting + Live)

| Repo | Asset focus | License | Active? | Notes |
|---|---|---|---|---|
| [Backtrader](https://github.com/mementum/backtrader) | Multi-asset event-driven | GPL-3.0 | Stale upstream; forks live | 122+ indicators; pin a maintained fork like `smalinin/backtrader_next` |
| [Freqtrade](https://github.com/freqtrade/freqtrade) | Crypto spot + futures | GPL-3.0 | Very active | Built-in `new-strategy`, `hyperopt` (Optuna), live + paper |
| [Jesse](https://github.com/jesse-ai/jesse) | Crypto spot/perp + DEX | MIT | Very active | Web UI, 300+ indicators, Optuna+Ray optimizer, JesseGPT 2.0 |
| [vectorbt](https://github.com/polakowo/vectorbt) | Anything in a DataFrame | Apache-2.0 + Commons Clause | Active | Numba-fast parameter sweeps; PRO adds purged WFO |
| [zipline-reloaded](https://github.com/stefan-jansen/zipline-reloaded) | US equities | Apache-2.0 | Active (3.1.1 Jul 2025) | Pipeline API + factor research |
| [Backtesting.py](https://github.com/kernc/backtesting.py) | Single-asset OHLC | AGPL-3.0 | Active | Bokeh plots, `optimize()` grid/SAMBO + `MultiBacktest` walk-forward |
| [NautilusTrader](https://github.com/nautechsystems/nautilus_trader) | Multi-venue, nanosecond | LGPL-3.0 | Very active | Rust core; backtest = live |
| [QuantConnect Lean](https://github.com/QuantConnect/Lean) | Multi-asset, multi-broker | Apache-2.0 | Very active | Cloud-parity via `lean-cli` |

Pre-built Claude integrations:
- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) — full "Trading OS" skill pack: backtest-expert, market-data-pipeline, risk-management, screeners, charting, economic calendar, journaling, post-mortems.
- [whchien/ai-trader](https://github.com/whchien/ai-trader) — Backtrader + MCP server, 20+ strategies.
- [HKUDS/Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) — multi-agent LLM personal trader.

Discovery lists:
- [wilsonfreitas/awesome-quant](https://github.com/wilsonfreitas/awesome-quant) — ~26k stars
- [wangzhe3224/awesome-systematic-trading](https://github.com/wangzhe3224/awesome-systematic-trading)
- [merovinh/best-of-algorithmic-trading](https://github.com/merovinh/best-of-algorithmic-trading) — ranked weekly

Additional finance libraries added in the May-2026 awesome-lists sweep:
- [zvtm/zvt](https://github.com/zvtm/zvt) — multi-source pluggable quant framework (A-shares + US + crypto)
- [microprediction/microprediction](https://github.com/microprediction/microprediction) — live time-series prediction streams; complements `vol-forecast`
- [gerrymanoim/exchange_calendars](https://github.com/gerrymanoim/exchange_calendars) — authoritative trading-session calendars for 60+ venues

---

## §2. Quant Statistics, TA, Risk, Tearsheets

### Technical analysis
- [TA-Lib/ta-lib-python](https://github.com/ta-lib/ta-lib-python) — BSD-2; 150+ indicators + 60+ candlestick patterns; needs C library.
- [twopirllc/pandas-ta](https://github.com/twopirllc/pandas-ta) — MIT; pandas accessor; **maintenance flagged inactive Jul 2026 — prefer the `pandas-ta-classic` fork**.
- [bukosabino/ta](https://github.com/bukosabino/ta) — MIT; pure pandas/numpy; safest default for sandboxed skills.

### Return / risk metrics + tearsheets
- [stefan-jansen/empyrical-reloaded](https://github.com/stefan-jansen/empyrical-reloaded) — Apache-2.0; atomic ratios (Sharpe/Sortino/Calmar/Omega/VaR/CVaR/alpha/beta).
- [ranaroussi/quantstats](https://github.com/ranaroussi/quantstats) — Apache-2.0; one-call HTML tearsheets, 80+ metrics.
- [stefan-jansen/pyfolio-reloaded](https://github.com/stefan-jansen/pyfolio-reloaded) — Apache-2.0; positions/transactions tearsheets.
- [stefan-jansen/alphalens-reloaded](https://github.com/stefan-jansen/alphalens-reloaded) — Apache-2.0; factor analysis (IC, quantile spreads, decay).

### Econometrics & volatility
- [statsmodels](https://github.com/statsmodels/statsmodels) — BSD-3; ARIMA/SARIMAX/VAR/cointegration/unit roots.
- [bashtage/arch](https://github.com/bashtage/arch) — NCSA; GARCH family + parametric VaR + bootstrap.
- [scikit-learn](https://github.com/scikit-learn/scikit-learn) — BSD-3; `Pipeline`, `TimeSeriesSplit`.

### Marcos Lopez de Prado techniques
- [hudson-and-thames/mlfinlab](https://github.com/hudson-and-thames/mlfinlab) — **NOT open source** (commercial license required). Use [skfolio](https://github.com/skfolio/skfolio) (HRP/NCO/HERC, BSD-3) + [timeseriescv](https://github.com/sam31415/timeseriescv) (purged K-fold) instead.

### Macro / event studies
- [cuemacro/finmarketpy](https://github.com/cuemacro/finmarketpy) — Apache-2.0; FX/macro event studies, vol-targeted sizing.

---

## §3. Portfolio Optimization & Personal Planning

| Repo | One-liner | License |
|---|---|---|
| [PyPortfolioOpt](https://github.com/robertmartin8/PyPortfolioOpt) | Efficient frontier, Black-Litterman, HRP, CLA | MIT |
| [Riskfolio-Lib](https://github.com/dcajasn/Riskfolio-Lib) | 20+ convex risk measures, CVaR/CDaR/EVaR | BSD-3 |
| [skfolio](https://github.com/skfolio/skfolio) | sklearn-style portfolio optimization with CV | BSD-3 |
| [Marigold/universal-portfolios](https://github.com/Marigold/universal-portfolios) | OLPS (Universal, ONS, EG, Anticor, OLMAR) | MIT |
| [convexfi/riskparity.py](https://github.com/convexfi/riskparity.py) | Fast risk-parity solvers | MIT |
| [fortitudo-tech/fortitudo.tech](https://github.com/fortitudo-tech/fortitudo.tech) | Entropy Pooling + CVaR | BSD-3 |
| [domokane/FinancePy](https://github.com/domokane/FinancePy) | Derivatives pricing & Greeks | GPL-3.0 |

### Retirement / FIRE
- [boknows/cFIREsim-open](https://github.com/boknows/cFIREsim-open) — historical-cycle simulator.
- [theFIcalculator/advanced-fire-calculator](https://github.com/theFIcalculator/advanced-fire-calculator) — VPW, Guyton-Klinger, CAPE.
- [carlchizhang/fireCalc](https://github.com/carlchizhang/fireCalc) — MIT Monte Carlo FIRE.
- [MikePiper/open-social-security](https://github.com/MikePiper/open-social-security) — claim-age optimizer.
- [mdlacasse/Owl](https://github.com/mdlacasse/Owl) — tax-aware withdrawal LP.

### Net worth & budgeting
- [Firefly III](https://github.com/firefly-iii/firefly-iii) — AGPL-3.0; self-hosted double-entry.
- [Actual Budget](https://github.com/actualbudget/actual) — MIT; envelope budgeting.
- [maybe-finance/maybe](https://github.com/maybe-finance/maybe) — AGPL-3.0; net worth + investments.

### Debt payoff
- [jkugler/debt_snowball](https://github.com/jkugler/debt_snowball), [skaramicke/python-avalanche](https://github.com/skaramicke/python-avalanche), [emberfeather/yeti](https://github.com/emberfeather/yeti).

Existing financial planner skills:
- [cjpatten/canadian-finance-planner-skill](https://github.com/cjpatten/canadian-finance-planner-skill)
- [anthropics/financial-services](https://github.com/anthropics/financial-services)
- [LobeHub mrelph retirement-planner](https://lobehub.com/skills/mrelph-claude-agents-skills-retirement-planner)

---

## §4. Tactical / Advanced Strategy Repos

### Order flow / microstructure
- [bmoscon/cryptofeed](https://github.com/bmoscon/cryptofeed) — async L2/L3 across 30+ exchanges, the de-facto standard.
- [Azhagesan-dev/OrderFlowMap](https://github.com/Azhagesan-dev/OrderFlowMap) — single-HTML Bookmap-style heatmap.
- [srlcarlg/srl-python-indicators](https://github.com/srlcarlg/srl-python-indicators) — CVD/delta/TPO/Weis-Wyckoff for mplfinance.
- [pfei-sa/binance-LOB](https://github.com/pfei-sa/binance-LOB) — Binance LOB recorder → ClickHouse.
- [OctopusTakopi/binance_l3_est](https://github.com/OctopusTakopi/binance_l3_est) — L3 estimation from L2 deltas.

### SMC / ICT / FVG / Order Blocks
- [joshyattridge/smart-money-concepts](https://github.com/joshyattridge/smart-money-concepts) — MIT; FVG, OB, BOS/CHoCH, liquidity, swings. Most-starred Python SMC lib.
- [smtlab/smartmoneyconcepts](https://github.com/smtlab/smartmoneyconcepts) — alt Python SMC.
- [Ahmed-GoCode/Quant-Edge-Indicators](https://github.com/Ahmed-GoCode/Quant-Edge-Indicators) — Pine v5 SMC suite (no LICENSE — reference only).
- [sonnyparlin/fvg_pinescript](https://github.com/sonnyparlin/fvg_pinescript) — minimal FVG finder in Pine.

### Wyckoff
- [zixihong/wyckoff-det-2](https://github.com/zixihong/wyckoff-det-2), [Eesita/Wyckoff-AI-Assistant](https://github.com/Eesita/Wyckoff-AI-Assistant), [Gifted87/TradingBot](https://github.com/Gifted87/TradingBot).

### Volume / Market Profile
- [bfolkens/py-market-profile](https://github.com/bfolkens/py-market-profile) — MIT-style; VAH/VAL/POC.
- [beinghorizontal/tpo_project](https://github.com/beinghorizontal/tpo_project) — TPO with plotly/dash.
- [letianzj/QuantResearch](https://github.com/letianzj/QuantResearch) — TPO/VP notebook walkthrough.

### Stat arb / pairs
- [hudson-and-thames/arbitragelab](https://github.com/hudson-and-thames/arbitragelab) — industrial-grade (cointegration, copula, OU, ML pairs).
- [hudson-and-thames/arbitrage_research](https://github.com/hudson-and-thames/arbitrage_research) — companion notebooks.

### Regime detection / changepoints
- [kieranjwood/slow-momentum-fast-reversion](https://github.com/kieranjwood/slow-momentum-fast-reversion).
- [kieranjwood/trading-momentum-transformer](https://github.com/kieranjwood/trading-momentum-transformer).
- [Sakeeb91/market-regime-detection](https://github.com/Sakeeb91/market-regime-detection), [taylorjmellon/market-regime-detection](https://github.com/taylorjmellon/market-regime-detection), [yvesdhondt/MarketMoodRing](https://github.com/yvesdhondt/MarketMoodRing).

### Sentiment / NLP
- [AI4Finance-Foundation/FinGPT](https://github.com/AI4Finance-Foundation/FinGPT) — MIT; FinGPT + FinNLP + RAG.
- [Laurenz-Thuemmler/nlp-sentiment-quant-monitor](https://github.com/Laurenz-Thuemmler/nlp-sentiment-quant-monitor) — live RSS → FinBERT.
- [KushyKernel/financial_news_sentiment](https://github.com/KushyKernel/financial_news_sentiment) — VADER/TextBlob/FinBERT ensemble.

### On-chain analytics
- [blockchain-etl/ethereum-etl](https://github.com/blockchain-etl/ethereum-etl) — MIT; production-grade exporter.
- [citp/BlockSci](https://github.com/citp/BlockSci) — GPL; Princeton CITP forensics.

---

## §5. TradingView / Pine Script / Charting

### Official + libraries
- [tradingview/lightweight-charts](https://github.com/tradingview/lightweight-charts) — Apache-2.0; canvas charting.
- [tradingview/awesome-tradingview](https://github.com/tradingview/awesome-tradingview) — curated index.
- [louisnw01/lightweight-charts-python](https://github.com/louisnw01/lightweight-charts-python) — MIT; Python wrapper with live updates.

### Pine Script
- [pAulseperformance/awesome-pinescript](https://github.com/pAulseperformance/awesome-pinescript) — MIT idioms ref.
- [everget/tradingview-pinescript-indicators](https://github.com/everget/tradingview-pinescript-indicators) — GPL-3.0 indicator collection.
- [QuantForgeOrg/PineTS](https://github.com/QuantForgeOrg/PineTS) — TS transpiler+runtime for Pine syntax.
- [TradersPost/pinescript-agents](https://github.com/TradersPost/pinescript-agents) — official Claude Code toolset for Pine.
- [lgbarn/trading-indicator-plugins](https://github.com/lgbarn/trading-indicator-plugins) — Pine/NinjaScript/Tradovate plugin marketplace.

### TradingView bridges & MCPs
- [marketcalls/openalgo](https://github.com/marketcalls/openalgo) — AGPL-3.0; multi-broker webhook ingestion.
- [robswc/tradingview-webhooks-bot](https://github.com/robswc/tradingview-webhooks-bot) — GPL-3.0; Flask actions.
- [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) — desktop CDP bridge (~78 tools).
- [atilaahmettaner/tradingview-mcp](https://github.com/atilaahmettaner/tradingview-mcp) — multi-exchange live screener.
- [victornpb/tradingview-backup](https://github.com/victornpb/tradingview-backup) — chart template export.

### Pattern recognition
- [keithorange/PatternPy](https://github.com/keithorange/PatternPy) — H&S, double tops, S/R.
- [BennyThadikaran/stock-pattern](https://github.com/BennyThadikaran/stock-pattern) — GPL-3.0; H&S, triangles, harmonics + backtest.
- [white07S/TradingPatternScanner](https://github.com/white07S/TradingPatternScanner) — H&S, wedges, channels.
- [zeta-zetra/chart_patterns](https://github.com/zeta-zetra/chart_patterns) — ascending triangles, flags.

---

## §6. Data Sources, Broker SDKs, Finance MCP Servers

### Equities & general
- [yfinance](https://github.com/ranaroussi/yfinance), [alpha_vantage](https://github.com/RomelTorres/alpha_vantage), [polygon-io/client-python](https://github.com/polygon-io/client-python), [tvDatafeed](https://github.com/rongardF/tvdatafeed), [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB).

### Brokers
- [alpaca-py](https://github.com/alpacahq/alpaca-py) (replaces older `alpaca-trade-api-python`).
- [ib_async](https://github.com/ib-api-reloaded/ib_async) (fork of `ib_insync` after its maintainer passed; the original is unmaintained).

### Crypto
- [ccxt](https://github.com/ccxt/ccxt) — 107+ exchanges.
- [python-binance](https://github.com/sammchardy/python-binance), [pybit](https://github.com/bybit-exchange/pybit), [hyperliquid-python-sdk](https://github.com/hyperliquid-dex/hyperliquid-python-sdk).

### Macro / filings
- [mortada/fredapi](https://github.com/mortada/fredapi), [pyfredapi](https://github.com/gw-moore/pyfredapi).
- [dgunning/edgartools](https://github.com/dgunning/edgartools), [jadchaar/sec-edgar-downloader](https://github.com/jadchaar/sec-edgar-downloader).

### News
- [areed1192/finance-news-aggregator](https://github.com/areed1192/finance-news-aggregator), [janlukasschroeder/realtime-newsapi](https://github.com/janlukasschroeder/realtime-newsapi).

### Finance MCP servers (install with `claude mcp add`)
- [OpenBB MCP](https://github.com/OpenBB-finance/OpenBB) — flagship.
- [financial-datasets/mcp-server](https://github.com/financial-datasets/mcp-server) — statements + prices + news.
- [Alex2Yang97/yahoo-finance-mcp](https://github.com/Alex2Yang97/yahoo-finance-mcp), [twolven/mcp-stockflow](https://github.com/twolven/mcp-stockflow), [wshobson/maverick-mcp](https://github.com/wshobson/maverick-mcp).
- [lazy-dinosaur/ccxt-mcp](https://github.com/lazy-dinosaur/ccxt-mcp), [doggybee/mcp-server-ccxt](https://github.com/doggybee/mcp-server-ccxt), [Nayshins/mcp-server-ccxt](https://github.com/Nayshins/mcp-server-ccxt).
- [Jaldekoa/mcp-fredapi](https://github.com/Jaldekoa/mcp-fredapi).
- [DidierRLopes/openbb-widgets-json-mcp](https://github.com/DidierRLopes/openbb-widgets-json-mcp) — OpenBB Workspace widgets.

Aggregators: [TensorBlock/awesome-mcp-servers](https://github.com/TensorBlock/awesome-mcp-servers), [tolkonepiu/best-of-mcp-servers](https://github.com/tolkonepiu/best-of-mcp-servers).

Best practice: cap installed MCP servers at 3–5 to keep tool-selection sharp.

---

## §7. GitHub Management Skills

### PR review / code review
- Official `code-review` plugin bundled with Claude Code.
- [aidankinzett/claude-git-pr-skill](https://github.com/aidankinzett/claude-git-pr-skill) — pending-review with explicit approval.
- [awesome-skills/code-review-skill](https://github.com/awesome-skills/code-review-skill) — 14k+ lines of language-specific guidelines.
- [praneybehl/code-review-mcp](https://github.com/praneybehl/code-review-mcp) — multi-model second opinion via OpenAI/Google.

### Triage / CI / releases
- [prime-radiant-inc/github-triage](https://github.com/prime-radiant-inc/github-triage) — issue + PR triage + security-gated review.
- [steeef/claude-skill-github-actions](https://github.com/steeef/claude-skill-github-actions) — GH Actions YAML + `gh run` knowledge.
- [doug-skinner/github-cli-claude-skill](https://github.com/doug-skinner/github-cli-claude-skill) — `gh` CLI wrapper (foundational).
- [ComposioHQ changelog-generator](https://github.com/ComposioHQ/awesome-claude-skills/blob/master/changelog-generator/SKILL.md) — clean release notes.

### Security
- [trailofbits/skills](https://github.com/trailofbits/skills) — security research + audit workflows.
- [github/github-mcp-server](https://github.com/github/github-mcp-server) — first-party MCP for PRs, Dependabot, secret scanning, branch protection.

---

## §8. Dashboards & Observability

### Streamlit / Dash / Panel
- [streamlit/agent-skills](https://github.com/streamlit/agent-skills) — official meta-skill; pair with `pip install streamlit>=1.57`.
- [squadbase/streamlit-claude-code-starter](https://github.com/squadbase/streamlit-claude-code-starter) — BI dashboard template.

### Visualization
- [danielrosehill/Claude-Data-Visualisation-And-Publishing-Plugin](https://github.com/danielrosehill/Claude-Data-Visualisation-And-Publishing-Plugin) — broad dataviz scaffolder (Plotly/Bokeh/ECharts/D3).
- [rohitg00 data-visualization agent](https://github.com/rohitg00/awesome-claude-code-toolkit/blob/main/agents/data-ai/data-visualization.md).
- [hmohamed01/Claude-Code-Scaffolding-Skill](https://github.com/hmohamed01/Claude-Code-Scaffolding-Skill).

### Grafana / Prometheus
- [grafana/mcp-grafana](https://github.com/grafana/mcp-grafana) — first-party MCP.

### Trading-specific
- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) — full trading OS skill bundle.
- [agiprolabs/claude-trading-skills](https://github.com/agiprolabs/claude-trading-skills) — 62 skills (trading + DeFi + quant + tax).
- [OctagonAI/skills](https://github.com/OctagonAI/skills) — equity research.
- [staskh/trading_skills](https://github.com/staskh/trading_skills) — options advisor.
- [ginlix-ai/LangAlpha](https://github.com/ginlix-ai/langalpha) — Bloomberg-style dashboard.

---

## §9. Trading Psychology, Journaling, Discipline

### Open-source journals
- [Eleven-Trading/TradeNote](https://github.com/Eleven-Trading/TradeNote) — GPL-3.0; Vue + MongoDB; broker CSV importers + dashboards.
- [Simple-Rich-Trading-Journal](https://github.com/Simple-Rich-Trading-Journal/Simple-Rich-Trading-Journal) — Python CLI journal.
- [NixTS/stock-trading-journal](https://github.com/NixTS/stock-trading-journal) — terminal journal → Google Sheets.

### Position sizing / risk-of-ruin
- [wdm0006/keeks](https://github.com/wdm0006/keeks) — MIT; fractional/drawdown-constrained Kelly.
- [thk3421-models/KellyPortfolio](https://github.com/thk3421-models/KellyPortfolio) — Kelly weights with forecasts.
- [Wito1d/risk-of-ruin-calculator](https://github.com/Wito1d/risk-of-ruin-calculator).
- [adrian-13/Risk-Management-Calculator](https://github.com/adrian-13/Risk-Management-Calculator) — Streamlit risk app.

### Sentiment / tilt building blocks
- [danielle707/Quantitative-Trading-with-Sentiment-Analysis](https://github.com/danielle707/Quantitative-Trading-with-Sentiment-Analysis) — emotion categories on text.
- [anthonyng2/trading-with-sentiment-analysis](https://github.com/anthonyng2/trading-with-sentiment-analysis).

### Templates
- [dastergon/postmortem-templates](https://github.com/dastergon/postmortem-templates) — SRE post-mortems, portable to trade reviews.
- [counteractive/incident-response-plan-template](https://github.com/counteractive/incident-response-plan-template) — after-action templates.
- [busterbenson/public cognitive-bias-cheat-sheet.json](https://github.com/busterbenson/public/blob/master/cognitive-bias-cheat-sheet.json) — 175 biases as structured JSON.

### Habit / mindset
- [forgottosave/Obsidian-Journal-Template](https://github.com/forgottosave/Obsidian-Journal-Template).
- [ArctykDev/obsidian-habit-tracker](https://github.com/ArctykDev/obsidian-habit-tracker).
- [pyrochlore/obsidian-tracker](https://github.com/pyrochlore/obsidian-tracker).
- [makalin/Daily-Markdown-Journal](https://github.com/makalin/Daily-Markdown-Journal).

### Trading-psychology Claude skills
- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) — covers journaling, post-mortem, session warm-up.
- [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) — includes a **behavioral-finance** plugin.

### Ecosystem gaps (opportunities to build)
1. **Tilt-guard with enforcement hooks** — uses `PreToolUse` to block order-placement MCPs when behavioral score is high. *(Scaffolded as `tilt-guard` in this repo.)*
2. **Decision-card pre-mortem** — Annie Duke style cards keyed to order IDs. *(Scaffolded as `decision-card`.)*
3. **Mistake-miner** — embedding-based clustering of recurring failure modes across journal history. *(Scaffolded as `mistake-miner`.)*
4. **Session-warmup go/no-go gate** — emits `state.yaml` that other skills read. *(Folded into `pre-trade-checklist`.)*
5. **Accountability-cohort** — opt-in peer benchmarking via signed Git commits.

---

## §10. Agentic Frameworks (foundation layer)

- [anthropics/claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) — canonical primitives.
- [obra/superpowers](https://github.com/obra/superpowers) — TDD-enforced 7-phase workflow plugin.
- [affaan-m/everything-claude-code](https://github.com/affaan-m/everything-claude-code) — research-first harness.
- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) — GitHub Actions runner.
- [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) + [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) — graph topologies wrapping Claude SDK.
- [yusufkaraaslan/Skill_Seekers](https://github.com/yusufkaraaslan/Skill_Seekers) — docs/repos/PDFs → SKILL.md ETL.

---

## §11. Security Notes

Treat every third-party skill as untrusted code until reviewed.

- **ToxicSkills (Snyk, Feb 2026):** ~36% of community-published agent skills on ClawHub contained injection payloads; 1,467 malicious payloads catalogued. ~13% of recent installs flagged critical.
- **Indirect prompt injection** is the dominant 2026 attack vector. Hostile PR bodies, issue comments, or fetched URLs can hijack `claude-code-action` (see Lasso research, Feb 2026).
- Hardening defaults: scope `allowed_tools`, run first invocation in `--permission-mode plan`, prefer official marketplace items (`anthropics/skills`, Superpowers, VoltAgent curated), audit any community skill's `Bash` and hook usage before enabling.
- License gotchas already noted inline above (MlFinLab, OpenAlgo, GPL-3 Pine indicators, "no LICENSE" Pine SMC repos).

---

## §12. The Skills Scaffolded in This Repo

See [`.claude/skills/`](./.claude/skills) — 22 SKILL.md entries covering quant analytics, portfolio, strategy R&D, data, dashboards, and discipline. Each entry links back to the upstream open-source libraries listed in this catalog.
