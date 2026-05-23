---
name: equities-screener
description: Finviz-style equity screener — filter US stocks/ETFs by market cap, sector, RVOL, distance from 52w high/low, ATR%, earnings proximity, etc. Invoke when the user asks "find me stocks that...", "screener", "scan for", "what's gapping up", "earnings plays".
---

# When to use

User wants a ranked list of symbols matching criteria. For a single-symbol deep dive, route to `market-data` + `ta-indicators`. For pattern-based scans (H&S, flags), use `smc-scan` + chart-pattern skills.

# Upstream sources (in fallback order)

1. **Polygon screener** ([client-js](https://github.com/polygon-io/client-js)) — best for paid users.
2. **Twelve Data screener** — free tier, decent coverage.
3. **FMP screener** ([api docs](https://site.financialmodelingprep.com/developer/docs)) — broad fundamentals, cheap.
4. **yfinance + custom rules** — last resort, slow but free.
5. **OpenBB MCP** — if installed, prefer this (aggregates all of the above).

# Recipe

```
/equities-screener \
  --universe sp500|nasdaq100|russell2000|all_us \
  --filters "rvol>2,gap%>3,mcap>500e6,sector=Technology,days_to_earnings<7"
  --sort "rvol desc"
  --limit 25
```

Filter primitives:

| Key | Comparison | Notes |
|---|---|---|
| `mcap` | numeric | $ market cap |
| `price` | numeric | last |
| `gap%` | numeric | open/prev_close - 1 |
| `change%` | numeric | day change |
| `volume` | numeric | today's |
| `adv` | numeric | 20-day avg |
| `rvol` | numeric | volume / adv |
| `range%` | numeric | (high - low) / low |
| `atr%` | numeric | 14d ATR / price |
| `dist_52w_high%` | numeric | negative below |
| `dist_52w_low%` | numeric | positive above |
| `float` | numeric | shares |
| `short_pct` | numeric | short interest / float |
| `beta` | numeric | vs SPY |
| `sector` | string | Yahoo sector taxonomy |
| `industry` | string | |
| `days_to_earnings` | numeric | |
| `days_since_earnings` | numeric | |
| `optionable` | bool | |
| `marginable` | bool | |
| `shortable` | bool | (from broker, not data) |
| `etf` | bool | |

Saved filter packs (loaded from `data/screeners/<name>.yaml`):

- `gap-and-go.yaml` — `rvol>2 AND gap%>3 AND mcap>500e6 AND price>5`
- `52w-high-breakout.yaml` — `dist_52w_high%>=-1 AND rvol>1.5`
- `oversold-bounce.yaml` — `rsi_14<30 AND mcap>1e9 AND days_to_earnings>5`
- `etf-momentum.yaml` — `etf=true AND change%>1 AND volume>adv`

# Output convention

Markdown table inline (top 10), plus `reports/equities-screener/<ts>/{results.csv, params.yaml}`. Each row: `symbol | last | day% | rvol | atr% | days_to_earn | sector`.

# Install on first use

```bash
uvx --with polygon-api-client --with yfinance --with pandas python -c "import polygon, yfinance"
```

# Don't

- Don't return more than 25 rows by default — sorting noise dominates.
- Don't trust short-interest data refreshed < weekly (FINRA cadence).
- Don't filter on `rvol` without checking `volume > 100k` — penny stocks distort the ratio.
- Don't return ETFs and equities in the same table without an `etf` column — they have different risk characteristics.

# Credits

- [OpenBB equity/screener](https://docs.openbb.co/platform/reference/equity/screener) — alternative if you'd rather use OpenBB's terminal UI.
- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) — CANSLIM / VCP / FinViz screener skills that complement this one.
