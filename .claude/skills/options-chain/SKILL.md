---
name: options-chain
description: Fetch and display an options chain (calls + puts across one or more expirations) for a given underlying, filterable by moneyness, DTE, open interest, volume, and bid-ask spread. Invoke when the user asks for "show me SPY calls", "AAPL options chain", "weekly chain", "0DTE chain", or chains a strategy skill that needs strike data.
---

# When to use

Foundation skill for anything options. `options-strategy-builder` and `greeks-monitor` both chain to this for current strike/IV data. If the user only wants a single quote, use `market-data` instead — chains are heavy.

# Upstream sources (selected by `--source`)

- `--source tradier` → [Tradier API](https://documentation.tradier.com/) — **default**; best free tier for options, real-time greeks included. Needs `TRADIER_TOKEN`.
- `--source polygon` → [`polygon-io/client-python`](https://github.com/polygon-io/client-python) — paid, full historical chain replay.
- `--source tastytrade` → [`tastyware/tastytrade`](https://github.com/tastyware/tastytrade) — free with brokerage account; greeks + IV rank.
- `--source yfinance` → degraded fallback; chain data is 15-min lagged and frequently sparse beyond front month. Flag the output as `stale: true`.

All sources are normalized to `DataAdapter.getOptionsChain(underlying, expiration?)` → `OptionsChain` (see `design/code/DataAdapter.ts`).

# Recipe

```
/options-chain --underlying SPY \
  --expirations 2026-05-30,2026-06-20,2026-09-19 \
  --moneyness 0.10 \
  --dte-min 1 --dte-max 60 \
  --min-oi 100 --min-volume 10 --max-spread 0.10 \
  --source tradier
```

Default path:

```python
from lib.data import getOptionsChain   # wraps the active DataAdapter
chain = getOptionsChain(underlying, expirations=exps)
df = pd.DataFrame([c.__dict__ for c in chain.contracts])
spot = getQuote(underlying).last
df = df[(df.strike.between(spot*(1-mny), spot*(1+mny)))
        & (df.openInterest >= min_oi)
        & (df.volume >= min_vol)
        & ((df.ask - df.bid) <= max_spread)]
```

# Output

One markdown table per expiration (calls block, puts block) with columns:
`strike  bid  ask  mid  last  vol  OI  Δ  Γ  Θ  ν  IV`.
Render numerics with `font-feature-settings: tnum` for tabular alignment.
Greek columns hidden if the source returned `undefined` (yfinance fallback).

```
reports/options-chain/<symbol>/<ts>/
  chain.json           # raw OptionsChain
  calls.md             # one ## heading per expiration
  puts.md
  meta.json            # spot, source, filters, stale flag
```

# Install on first use

```bash
uvx --with requests --with pandas --with tastytrade --with polygon-api-client \
  python -c "import pandas, requests"
```

# Don't

- Don't trust Friday-after-close quotes — bid/ask freeze mid-day Friday for many low-volume strikes; mark `session: closed` chains explicitly.
- Don't filter on `volume` alone — today's volume tells you nothing about a 45-DTE strike that traded heavily last week. Filter on `openInterest` first, `volume` as a tiebreaker.
- Don't quote the mid as a "fair" fill price without showing the half-spread alongside — for illiquid strikes the mid is fiction.
- Don't forget to multiply by 100 when converting premium to dollars; the chain is per-share.
