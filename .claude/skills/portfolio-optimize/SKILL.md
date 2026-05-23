---
name: portfolio-optimize
description: Build an optimal portfolio from a ticker list using PyPortfolioOpt (efficient frontier / Black-Litterman / HRP), Riskfolio-Lib (CVaR / risk-parity), or skfolio (cross-validated). Invoke when the user asks for "optimize my portfolio", "min variance", "max Sharpe", "HRP", "Black-Litterman", "risk parity", "CVaR portfolio".
---

# When to use

User has a basket and wants weights. For sizing a single position, use `vol-forecast` + Kelly inside `trade-journal`.

# Upstream libraries

- [`PyPortfolioOpt`](https://github.com/robertmartin8/PyPortfolioOpt) — MIT. **Default** for max-Sharpe, min-vol, Black-Litterman, HRP.
- [`Riskfolio-Lib`](https://github.com/dcajasn/Riskfolio-Lib) — BSD-3. When user wants CVaR / EVaR / CDaR or risk-parity with custom budgets.
- [`skfolio`](https://github.com/skfolio/skfolio) — BSD-3. When user wants cross-validated / walk-forward weights.

# Recipe

```
/portfolio-optimize --tickers AAPL,MSFT,GOOG,NVDA,SPY \
  --method efficient-frontier|hrp|black-litterman|cvar|risk-parity|skfolio \
  --objective max-sharpe|min-vol|max-return \
  --lookback 5y \
  [--views "AAPL:0.05,MSFT:-0.02"]
```

Default path (`efficient-frontier` / `max-sharpe`):

```python
from pypfopt import EfficientFrontier, expected_returns, risk_models
mu = expected_returns.mean_historical_return(prices)
S  = risk_models.CovarianceShrinkage(prices).ledoit_wolf()
ef = EfficientFrontier(mu, S)
w  = ef.max_sharpe()
ef.portfolio_performance(verbose=True)
```

HRP path: `from pypfopt.hierarchical_portfolio import HRPOpt; HRPOpt(returns).optimize()`.

CVaR/risk-parity path uses `Riskfolio-Lib`:
```python
import riskfolio as rp
port = rp.Portfolio(returns=returns)
port.assets_stats(method_mu='hist', method_cov='hist')
w = port.optimization(model='Classic', rm='CVaR', obj='Sharpe', hist=True)
```

# Output convention

`reports/portfolio-optimize/<ts>/{weights.csv, frontier.png, perf.json}` + inline weights table.

# Install on first use

```bash
uvx --with pyportfolioopt --with riskfolio-lib --with skfolio --with yfinance python -c "import pypfopt, riskfolio, skfolio"
```

# Don't

- Don't use raw covariance — always Ledoit-Wolf or OAS shrinkage for ≥ 30 assets.
- Don't claim "optimal" without holdout testing — chain with `quant-tearsheet` on a walk-forward.
- Don't pass `mlfinlab` HRP — license is restrictive; PyPortfolioOpt and skfolio both have free HRP.

# Credits

- [OpenBB Portfolio Optimization](https://docs.openbb.co/platform/reference/portfolio) — full UI alternative for users who want the menu, not the file output.
