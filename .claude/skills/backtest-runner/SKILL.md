---
name: backtest-runner
description: Scaffold and run a strategy backtest using Backtesting.py (single-asset, fast iteration) or VectorBT (massive parameter sweeps). Generates strategy file + run script + Bokeh plot. Invoke when the user describes a strategy idea and wants "backtest it", "Sharpe / win rate / drawdown", or "optimize the parameters".
---

# When to use

User has a strategy idea (entry/exit rules) and OHLCV. For multi-asset event-driven, route to a sibling skill that wraps Backtrader or Lean. For crypto bot lifecycle (research → paper → live), use Freqtrade or Jesse.

# Upstream libraries

- [`kernc/backtesting.py`](https://github.com/kernc/backtesting.py) — AGPL-3.0 (personal use OK). `optimize(method='grid'|'sambo')`, `MultiBacktest` for walk-forward. **Default**.
- [`polakowo/vectorbt`](https://github.com/polakowo/vectorbt) — Apache-2.0 + Commons Clause; Numba-fast parameter sweeps.

# Recipe — Backtesting.py path

```
/backtest-runner --strategy "sma_cross" --symbol SPY --timeframe 1d --years 10 \
  --params "fast=10,slow=50" [--optimize] [--walk-forward 5]
```

Scaffolds `strategies/sma_cross/strategy.py`:

```python
from backtesting import Strategy
from backtesting.lib import crossover
from backtesting.test import SMA

class SmaCross(Strategy):
    fast = 10
    slow = 50
    def init(self):
        self.f = self.I(SMA, self.data.Close, self.fast)
        self.s = self.I(SMA, self.data.Close, self.slow)
    def next(self):
        if crossover(self.f, self.s):  self.buy()
        elif crossover(self.s, self.f): self.position.close()
```

Runner `strategies/sma_cross/run.py`:
```python
from backtesting import Backtest
bt = Backtest(df, SmaCross, cash=100_000, commission=0.0005)
print(bt.run())
bt.plot(filename="reports/backtest/sma_cross/<ts>/plot.html")
```

With `--optimize`, expose params as class-level ints and call `bt.optimize(fast=range(5,30,5), slow=range(30,200,10), maximize='Sharpe Ratio', method='sambo')`.

With `--walk-forward 5`, use `MultiBacktest` on 5 non-overlapping splits.

# Recipe — VectorBT path (for sweeps)

```python
import vectorbt as vbt
fast_ma = vbt.MA.run(price, range(5, 30, 5)); slow_ma = vbt.MA.run(price, range(30, 200, 10))
entries = fast_ma.ma_crossed_above(slow_ma); exits = fast_ma.ma_crossed_below(slow_ma)
pf = vbt.Portfolio.from_signals(price, entries, exits, fees=0.0005)
pf.stats().to_markdown("reports/backtest/<name>/<ts>/sweep.md")
```

# Output convention

```
strategies/<name>/{strategy.py, run.py, README.md}
reports/backtest/<name>/<UTC ts>/{plot.html, stats.json, sweep.md?}
```

# Install on first use

```bash
uvx --with backtesting --with vectorbt --with yfinance --with bokeh python -c "import backtesting, vectorbt"
```

# Don't

- Don't claim profitability from a single backtest — always chain `quant-tearsheet` on out-of-sample data and report MAR/MAR-ratio.
- Don't optimize > 4 parameters without warning about overfitting — bias goes up roughly with `2^k`.
- Don't use Backtesting.py for portfolio-level multi-asset — it's single-instrument by design.

# Upstream alternative

[`marketcalls/vectorbt-backtesting-skills`](https://github.com/marketcalls/vectorbt-backtesting-skills) ships 5 invocable skills + 12 strategy templates + native walk-forward + optimize, all built around VectorBT. When the user wants something off the shelf (golden-cross, mean-reversion, breakout) at scale, route to theirs and post-process the output. Keep this skill for: (a) Backtesting.py path (better Bokeh review), (b) custom strategies that need our `strategies/<name>/` repo convention, (c) chain into `pine-to-python` for Pine-parity validation.
