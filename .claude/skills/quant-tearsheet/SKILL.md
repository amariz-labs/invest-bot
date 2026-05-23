---
name: quant-tearsheet
description: Produce an HTML or Markdown performance tearsheet (CAGR, Sharpe, Sortino, Calmar, max drawdown, monthly heatmap, benchmark comparison) for a returns series. Invoke when the user supplies a strategy NAV / returns CSV and asks for "tearsheet", "performance report", "Sharpe / Sortino", "drawdown analysis", or "compare vs SPY".
---

# When to use

Returns- or NAV-series in hand → user wants the standard institutional summary. If they only ask for one metric, use `risk-var` instead.

# Upstream libraries

- [`quantstats`](https://github.com/ranaroussi/quantstats) — Apache-2.0. Primary renderer.
- [`empyrical-reloaded`](https://github.com/stefan-jansen/empyrical-reloaded) — Apache-2.0. Atomic metrics if user wants JSON instead of HTML.
- Optional: [`pyfolio-reloaded`](https://github.com/stefan-jansen/pyfolio-reloaded) when positions+transactions are provided.

# Recipe

1. Load the returns: accept `--returns <path.csv>` (column `date,return`), or compute from NAV with `pct_change()`.
2. Resolve benchmark: default `SPY` via yfinance (use `market-data` skill); skip if `--no-benchmark`.
3. Render:
   ```python
   import quantstats as qs
   qs.reports.html(returns, benchmark=bench, output="reports/quant-tearsheet/<ts>/report.html")
   qs.reports.metrics(returns, benchmark=bench, display=False).to_markdown("reports/quant-tearsheet/<ts>/metrics.md")
   ```
4. If `--json`, emit `empyrical_reloaded` atoms (`sharpe_ratio`, `sortino_ratio`, `calmar_ratio`, `omega_ratio`, `max_drawdown`, `value_at_risk`, `conditional_value_at_risk`, `alpha`, `beta`, `tail_ratio`, `stability_of_timeseries`).
5. Print a 10-line markdown summary inline (CAGR, vol, Sharpe, Sortino, max-DD, win rate, best/worst month, exposure, beta, alpha).

# Output convention

```
reports/quant-tearsheet/<UTC timestamp>/
  report.html          # full quantstats tearsheet
  metrics.md           # table view
  metrics.json         # empyrical atoms (always)
```

# Install on first use

```bash
uvx --with quantstats --with empyrical-reloaded --with yfinance python -c "import quantstats"
```

# Don't

- Don't trust quantstats' "Risk-Free Rate" default — always pass `rf=` explicitly from a FRED 3M T-bill series if user gives one (use `market-data` with `--source fred`).
- Don't use original `empyrical` or original `pyfolio` (both unmaintained) — use the `-reloaded` forks.

# Upstream alternative

For users who want a turn-key tearsheet without touching our `reports/` convention, [`marketcalls/vectorbt-backtesting-skills`](https://github.com/marketcalls/vectorbt-backtesting-skills) ships a `quick-stats` skill that wraps QuantStats with sensible defaults. Install it alongside; route `/quant-tearsheet --quick` invocations to theirs and post-process their HTML into our `reports/quant-tearsheet/<ts>/` tree. Keep this skill for cases that need (a) explicit FRED-RF integration, (b) emit-JSON-atoms-too, or (c) chain into `mistake-miner` via the `metrics.json` artifact.
