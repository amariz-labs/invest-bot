---
name: dashboard-build
description: Scaffold a Streamlit (or Dash) dashboard from a description — pages, sidebar filters, charts, data loaders — wired to this repo's `data/` and `reports/` conventions. Invoke when the user asks "build a dashboard", "Streamlit app", "make a UI for X".
---

# When to use

User wants an interactive UI to browse trades, portfolios, or backtests. For a static report, prefer `quant-tearsheet` (HTML).

# Upstream libraries / skills

- [Streamlit](https://github.com/streamlit/streamlit) + [`streamlit/agent-skills`](https://github.com/streamlit/agent-skills) (official meta-skill).
- [`squadbase/streamlit-claude-code-starter`](https://github.com/squadbase/streamlit-claude-code-starter) — template.
- Optional: [`danielrosehill/Claude-Data-Visualisation-And-Publishing-Plugin`](https://github.com/danielrosehill/Claude-Data-Visualisation-And-Publishing-Plugin) for non-Streamlit (Plotly/Bokeh/ECharts).

# Voltrex-grade reference (Next.js + Tailwind + Lightweight Charts path)

When the user wants a polished web dashboard (not a Streamlit BI app), read [`../../../design/DASHBOARD-BRIEF.md`](../../../design/DASHBOARD-BRIEF.md) first and reuse the components in [`../../../design/code/`](../../../design/code/) — `tokens.ts`, `tokens.css`, `LeaderCard.tsx`, `LockSlider.tsx`, `AnimatedNumber.tsx`, `HeroChart.tsx`. The brief is the synthesis of an 11-agent design teardown (Nixtio "Voltrex" Dribbble, May 2026); the visual-audit companion in `design/VISUAL-AUDIT.md` documents the data-integrity bugs to avoid copying.

# Recipe

```
/dashboard-build --name trading-cockpit --pages portfolio,trades,backtests \
  --data data/quotes,data/journal,reports/backtest --charts candles,equity_curve,drawdown
```

Scaffold `app/<name>/`:
```
app/<name>/
  app.py                # st.set_page_config + sidebar
  pages/
    1_portfolio.py
    2_trades.py
    3_backtests.py
  components/
    candles.py          # uses lightweight-charts-python via st.components
    equity_curve.py     # quantstats-derived
    drawdown.py
  data_loaders.py       # @st.cache_data wrappers around parquet/markdown reads
  README.md             # how to run
requirements.txt        # streamlit, pandas, pyarrow, plotly, lightweight-charts, quantstats
```

Each page reads from `data/` / `reports/` — never duplicates state.

# Output convention

`app/<name>/` and a runner: `streamlit run app/<name>/app.py`.

# Install on first use

```bash
uvx --with streamlit --with plotly --with pyarrow --with lightweight-charts python -c "import streamlit"
```

# Don't

- Don't fetch from APIs inside the dashboard render path — load from `data/` parquet only. Decouple ingestion from presentation.
- Don't store credentials in the page files — `st.secrets` only.
- Don't auto-deploy publicly — the dashboards expose personal trade data.

# Credits

- [streamlit/agent-skills](https://github.com/streamlit/agent-skills) — Streamlit's own meta-skill for agent-driven app dev.
