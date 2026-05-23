---
name: iv-surface
description: Answer "is vol cheap or rich right now?" for any underlying. Computes IV rank, IV percentile (52-week), term-structure slope, 25-delta skew, ATM IV time series, and (optionally) a fitted SVI surface. Invoke when the user says "IV rank", "is vol cheap", "term structure", "vol skew", "SVI surface", or before scaffolding a non-trivial options structure.
---

# When to use

Before placing any non-trivial options trade (anything beyond a single long call/put) and as a weekly options-book review. Upstream of `options-strategy-builder` — the rank/percentile/skew triple is the single biggest input to "debit or credit?". Siblings: `options-chain` for raw strike pulls, `greeks-monitor` for the live book.

Read-only. Does not place orders, does not mutate broker state.

# Upstream sources

All chain pulls go through `DataAdapter.getOptionsChain(underlying, expiration?)` (see `design/code/DataAdapter.ts`). The per-source notes below cover the *IV* quality, not chain quality:

- `--source tradier` — **default**; free IV per option, decent for ATM-IV backfill via repeated EOD chain snapshots. Needs `TRADIER_TOKEN`.
- `--source orats` — paid premium IV product; clean SVI parameters delivered, skips fitting. Best when you need it daily.
- `--source cboe` — CBOE DataShop end-of-day implied vol files; canonical for index products (SPX, VIX term).
- `--source polygon` — paid; full historical chain replay for backfilling `atm_iv.parquet` from scratch.
- `--source yfinance` — degraded fallback for *underlying close only*. **Do not** use yfinance's option IVs — they're stale and frequently nonsensical past the front month.

# Recipe

```
/iv-surface rank    --symbol SPY
/iv-surface term    --symbol AAPL
/iv-surface skew    --symbol SPY --dte 30
/iv-surface surface --symbol QQQ --model svi
/iv-surface watch   --symbols SPY,QQQ,IWM,AAPL,NVDA --rank-threshold 60
```

What each subcommand emits:

- `rank` — single IV rank/percentile number + 52-week ATM-IV history chart.
- `term` — term-structure curve at 7 / 14 / 30 / 60 / 90 DTE ATM IV.
- `skew` — 25-delta put-call skew + smile plot at the chosen DTE.
- `surface` — fitted SVI surface as a 2D heatmap (DTE x moneyness).
- `watch` — interval loop; pings via `lib/notify.ts` when IV rank crosses `--rank-threshold` (rising or falling).

Default path:

```python
chain = getOptionsChain(symbol)                  # DataAdapter
atm   = pick_atm(chain, dte=30)                  # nearest-strike, nearest-expiry
iv_t  = load_parquet(f"data/iv/{symbol}/atm_iv.parquet")
iv_t  = append_today(iv_t, atm.iv, ts=today())
rank  = (atm.iv - iv_t.iv.min()) / (iv_t.iv.max() - iv_t.iv.min())  # 52w window
pct   = (iv_t.iv.tail(252) < atm.iv).mean()
```

# Math definitions (precise — these are NOT interchangeable)

- **IV rank** = `(current IV − 52w min) / (52w max − 52w min)`. Range `[0, 1]`. Sensitive to outliers.
- **IV percentile** = `% of last 252 trading days where IV < current IV`. Range `[0, 1]`. Robust to outliers. **Different number from IV rank** — quote both.
- **Term-structure slope** = `ATM IV(60d) − ATM IV(30d)`. Positive = contango (front cheap, back expensive — normal). Negative = backwardation (event premium up front).
- **25-delta skew** = `IV(put, |Δ|=0.25) − IV(call, Δ=0.25)` at the chosen DTE. Positive = puts richer (typical for equity indices). Quote in vol points, not %.

# Output convention

```
reports/iv-surface/<symbol>/<ts>/
  rank.json            # {iv, rank, percentile, atm_strike, dte, source, ts}
  term.png             # 7/14/30/60/90 ATM IV curve + slope value
  skew.png             # smile at --dte plus 25d skew number
  surface.parquet      # (dte, moneyness, iv) grid + svi_params if --model svi
  summary.md           # human card; the line options-strategy-builder reads
```

Persistent ATM IV history (one row per close, appended daily by `watch` or any subcommand):

```
data/iv/<symbol>/atm_iv.parquet
  ts (date), spot, atm_strike, dte, iv, source
```

# Library picks

- `arch` — vol math, EWMA/realized-vol references for rank context.
- `py_vollib` or `mibian` — Black-Scholes greeks/IV when the source omits them.
- `scipy.optimize.least_squares` — SVI calibration (see `references/svi-fitting.md`).
- `matplotlib` — term/skew/surface plots.
- `pandas-ta` — **not used here**; this is options vol, not price TA.

# Chain to downstream

`options-strategy-builder` reads `data/iv/<symbol>/atm_iv.parquet` and the latest `summary.md` to decide debit vs credit:

- IV rank `> 50` → prefer credit structures (sell premium).
- IV rank `< 30` → prefer debit structures (buy premium).
- Steep negative skew + high rank → put-credit spreads / put-ratio fades.
- Backwardated term → calendar spreads (sell front, buy back).

# Install on first use

```bash
uvx --with py_vollib --with arch --with pandas --with scipy --with matplotlib \
  python -c "import py_vollib"
```

# Don't

- Don't quote IV without DTE — "IV is 28" is meaningless; "30d ATM IV is 28" is a number.
- Don't fit SVI on fewer than 8 strikes per expiry — the 5-parameter form is underdetermined and you'll get arb-violating smiles.
- Don't compute IV percentile with less than 252 trading days of history — backfill or skip the metric.
- Don't trust yfinance's option IVs — pull underlying close from yfinance if you must, but recompute IV from the chain via `py_vollib`.
- Don't conflate IV rank with IV percentile — they answer different questions (range-position vs frequency-below). Show both side by side.
- Don't lump 0DTE into the 30-DTE surface — it's a different beast (gamma-dominated, no vega); bucket separately or exclude.
