# IV data providers

Where to source the IV that drives rank, term, skew, and the SVI fit. Coverage and latency matter much more than nominal accuracy — most providers compute IV from chain mids the same way (Black-Scholes inverted by Newton-Raphson on a clean mid). Pick the provider that solves your *backfill* and *latency* problem; the math at the end is identical.

## Comparison table

| Provider          | Cost            | Latency         | Coverage                          | API style              |
|-------------------|-----------------|-----------------|-----------------------------------|------------------------|
| Tradier           | Free w/ account | Real-time       | US equity options, full chain     | REST, JSON             |
| ORATS             | ~$100/mo        | EOD + intraday  | US equity + index options         | REST, CSV/JSON         |
| CBOE DataShop     | Paid per file   | EOD             | Index options canonical (SPX,VIX) | Bulk CSV download      |
| polygon.io        | ~$200/mo        | Real-time + hist| Full US options + history         | REST + WebSocket       |
| IB market data    | $/mo per bundle | Real-time       | Global (OPRA + indices)           | TWS / IB Gateway API   |
| MarketChameleon   | ~$70/mo         | EOD             | US equity options + earnings      | REST + screener UI     |
| Trade Alert       | Enterprise      | Real-time       | US + EU options, unusual activity | Desktop, Bloomberg-style |
| yfinance          | Free            | 15-min lag      | US equity options, shallow        | Python lib             |

## Per-provider notes

**Tradier.** Default for live work. Real-time greeks + IV per contract, no extra fee on top of brokerage. Single-account API key, modest rate limits. No historical surface — pair with polygon for backfill.

**ORATS.** Premium-cleaned IV product. Ships SVI parameters per slice, term-structure points, skew tables — lets you skip half the math in `svi-fitting.md`. Best path if budget allows and you don't want to maintain a fitter.

**CBOE DataShop.** Canonical for index products (SPX, NDX, RUT, VIX term). Bulk CSV per day; no live API. Use when you need defensible numbers (compliance, paper writeups) on indices.

**polygon.io.** The standard for historical chain replay — pulls 5-10 years of chain quotes per symbol. Use this to bootstrap `data/iv/<symbol>/atm_iv.parquet` from zero. IV may be missing in older files; recompute via `py_vollib`.

**IB market data.** Real-time global coverage; greeks come from IB's pricing model. Tight integration if you're already trading through IBKR. Crusty API surface and snapshot-quota gotchas — budget engineering time.

**MarketChameleon.** Pre-built IV rank, IV percentile, skew, term — great for dashboards and quick screens. Doesn't give you the raw chain, so you can't refit SVI from their feed.

**Trade Alert.** Buy-side desktop standard. Real-time flow + IV + unusual activity. Expensive, geared to desks; mention here only for completeness.

**yfinance.** Free fallback for the *underlying close* only. **Do not** trust its option IVs — they are stale, sparse beyond the front month, and frequently nonsensical. If you must use yfinance for chain data, throw away the `impliedVolatility` column and recompute IV from the mids with `py_vollib.iv`.

## Default stack for this skill

- Live chain + IV → Tradier (`--source tradier`).
- 252-day ATM IV backfill → polygon.io chain history → recompute ATM IV via `py_vollib`.
- Index canonical (SPX/VIX) → CBOE DataShop (manual, weekly).
- Production paid path → ORATS — pre-cleaned with SVI params, you skip the fitter entirely.

## Notes on "free"

The free path (Tradier live + yfinance close for spot + manual daily chain snapshots into `data/iv/<symbol>/atm_iv.parquet`) works, but only after you've collected ~252 daily snapshots. There is no shortcut to a 52-week IV percentile without 52 weeks of data — paid backfill via polygon is the realistic way to bootstrap the history file without waiting a year.

## API-key wiring

All keys live in `.env` and are surfaced to skills via `process.env`:

```
TRADIER_TOKEN=...
ORATS_TOKEN=...
POLYGON_API_KEY=...
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=7497
```

The active source for this skill is read from `--source` flag → `IV_SURFACE_DEFAULT_SOURCE` env var → `tradier`.
