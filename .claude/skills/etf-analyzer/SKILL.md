---
name: etf-analyzer
description: Decompose an ETF — expense ratio, top holdings, sector exposure, factor tilt, overlap with another ETF. Invoke when the user asks "what's in VTI", "overlap between SPY and IVV", "is QQQ tech-heavy", "factor exposure of SCHD".
---

# When to use

User has one or two ETF tickers and wants the X-ray. For broader portfolio composition, use `portfolio-optimize` on the underlying holdings.

# Upstream sources

- **ETF.com / ETFdb** scrapers (gentle) or aggregator APIs.
- [`OpenBB-finance/OpenBB`](https://github.com/OpenBB-finance/OpenBB) — `obb.etf.*` endpoints aggregate iShares + Vanguard + State Street.
- [`twelvedata-python`](https://github.com/twelvedata/twelvedata-python) — ETF endpoints in pro tier.
- iShares + Vanguard + State Street + Invesco publish daily holdings CSVs publicly; the canonical source.

# Recipe

```
/etf-analyzer --symbol QQQ                 # single ETF deep dive
/etf-analyzer --overlap SPY,IVV            # holdings overlap
/etf-analyzer --factor-tilt SCHD           # value/growth/momentum/quality/low-vol tilts vs SPY
/etf-analyzer --sector-exposure VTI vs SPY # sector deltas
```

### Single ETF mode

Emit:
- **Vitals:** expense ratio, AUM, inception, issuer, replication (full vs sampled), distribution frequency.
- **Top 25 holdings** with weight.
- **Sector breakdown** as a table + horizontal bar chart.
- **Country breakdown** (for international ETFs).
- **Performance:** 1m / 3m / 1y / 3y / 5y / 10y annualized, vs benchmark.
- **Risk:** std dev, max DD, Sharpe (via `quant-tearsheet` chain).
- **Tax efficiency:** turnover %, distributions YTD, qualified vs non-qualified.

### Overlap mode

Compute weight-overlap = `Σ min(w_A_i, w_B_i)` across union of holdings. Emit:
- Overlap percentage (single number).
- Top 20 shared holdings with their weights in A and B side-by-side.
- Holdings unique to each ETF (top 10).
- Visualization: stacked Venn or grouped bars.

### Factor tilt mode

Run cross-sectional regression of the ETF's holdings vs:
- **Size** (log market cap)
- **Value** (book/price, earnings/price)
- **Momentum** (12m - 1m return)
- **Quality** (ROE, debt/equity)
- **Low Vol** (260d std dev)

Standardize loadings (z-scores), report each as a number from -3 to +3. Useful for "is this really 'high dividend' or just 'utilities and REITs'?"

# Output convention

```
reports/etf-analyzer/<symbol>/<ts>/{vitals.json, holdings.csv, sectors.png, perf.md}
reports/etf-analyzer/overlap/<A>_<B>/<ts>/{overlap.md, shared.csv, venn.png}
reports/etf-analyzer/factor-tilt/<symbol>/<ts>/{loadings.json, ranks.md}
```

# Install on first use

```bash
uvx --with openbb --with pandas --with matplotlib python -c "from openbb import obb"
```

# Don't

- Don't compute overlap on stale holdings — re-pull when last fetch > 24h old.
- Don't trust issuer-reported "sector" for thematic ETFs (cybersecurity, AI, robotics) — they use their own taxonomies. Map to GICS when comparing across ETFs.
- Don't report a "factor tilt" on an ETF with < 30 holdings — small sample, unstable loadings.
- Don't recommend tax-loss harvesting between ETFs the IRS could deem substantially identical (VTI/ITOT, IVV/SPY trip wash sales).
