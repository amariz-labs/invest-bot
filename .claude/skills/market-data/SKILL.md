---
name: market-data
description: Fetch OHLCV, fundamentals, macro series, or news for any symbol via yfinance / ccxt / OpenBB MCP / FRED / EDGAR. Invoke when any other skill needs quote data and the user hasn't supplied a CSV.
---

# When to use

Foundation skill. Other skills (`backtest-runner`, `quant-tearsheet`, `smc-scan`, `regime-detect`) chain to this when no path is provided.

# Upstream libraries (selected by source flag)

- `--source yfinance` → [`yfinance`](https://github.com/ranaroussi/yfinance) — Apache-2.0; no key; rate-limited.
- `--source ccxt --exchange binance` → [`ccxt`](https://github.com/ccxt/ccxt) — MIT; 107+ exchanges.
- `--source openbb` → [OpenBB MCP](https://github.com/OpenBB-finance/OpenBB) (preferred if installed).
- `--source fred` → [`mortada/fredapi`](https://github.com/mortada/fredapi) — needs `FRED_API_KEY`.
- `--source edgar` → [`dgunning/edgartools`](https://github.com/dgunning/edgartools) — no key, no limits.
- `--source polygon` → [`polygon-io/client-python`](https://github.com/polygon-io/client-python) — needs key.
- `--source alpaca` → [`alpaca-py`](https://github.com/alpacahq/alpaca-py) — needs key.

# Recipe

```
/market-data --symbol SPY --timeframe 1d --years 5 --source yfinance
/market-data --symbol BTC/USDT --timeframe 1h --exchange binance --source ccxt --days 90
/market-data --series CPIAUCSL --source fred
/market-data --ticker AAPL --filing 10-K --source edgar
```

Default yfinance path:
```python
import yfinance as yf
df = yf.download(symbol, period=f"{years}y", interval=timeframe, auto_adjust=True)
df.to_parquet(f"data/quotes/{symbol}_{timeframe}.parquet")
```

ccxt path:
```python
import ccxt, pandas as pd
ex = getattr(ccxt, exchange)(); raw = ex.fetch_ohlcv(symbol, timeframe, limit=1000)
df = pd.DataFrame(raw, columns=['ts','open','high','low','close','volume'])
```

# Output convention

```
data/quotes/<symbol>_<timeframe>.parquet
data/macro/<series_id>.parquet
data/filings/<ticker>/<accession>.json
~/.claude/cache/financial-planner/market-data/<key>.parquet
```

# Install on first use

```bash
uvx --with yfinance --with ccxt --with fredapi --with edgartools --with pandas python -c "import yfinance, ccxt"
```

# Don't

- Don't hammer yfinance in a loop — it 429s after ~360 req/hr per IP. Cache aggressively.
- Don't trust the `Adj Close` column without confirming `auto_adjust=True`.
- Don't use `tvDatafeed` for anything redistributable — TradingView ToS gray area.

# Credits

- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) `market-data-pipeline` — more mature peer; ours is wired to our `DataAdapter` contract.
