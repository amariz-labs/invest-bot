# SVI fitting

Stochastic Volatility Inspired (SVI) is Gatheral's 5-parameter parametrization of the total implied variance smile per expiry. It is arbitrage-friendly when calibrated with the right constraints and is the de-facto standard for equity surface fitting.

## Raw-SVI form

For a single expiry, let `k = log(K / F)` be the log-moneyness against the forward `F`. Total variance `w(k) = sigma^2 * T` is:

```
w(k) = a + b * ( rho * (k - m) + sqrt( (k - m)^2 + sigma^2 ) )
```

Five parameters per expiry:

| param | meaning                              | typical bounds            |
|-------|--------------------------------------|---------------------------|
| `a`   | vertical level (minimum total var)   | `a >= 0`                  |
| `b`   | slope / angle between wings          | `b >= 0`                  |
| `rho` | asymmetry of the two wings           | `-1 < rho < 1`            |
| `m`   | horizontal translation of the smile  | unbounded; usually small  |
| `sig` | ATM curvature (smoothing knob)       | `sig > 0`                 |

Two textbook constraints to enforce **butterfly arbitrage** absence per slice:

1. `b * (1 + |rho|) < 4 / T`
2. `a + b * sig * sqrt(1 - rho^2) >= 0`

## scipy least_squares calibration

```python
import numpy as np
from scipy.optimize import least_squares

def svi(k, a, b, rho, m, sig):
    return a + b * (rho * (k - m) + np.sqrt((k - m) ** 2 + sig ** 2))

def residuals(params, k, w_obs, vega_w):
    a, b, rho, m, sig = params
    return (svi(k, a, b, rho, m, sig) - w_obs) * vega_w  # vega-weight to ignore far OTM noise

x0     = [w_obs.min(), 0.1, -0.3, 0.0, 0.1]              # warm start
bounds = ([0, 0, -0.999, -1.0, 1e-4],
          [1, 5,  0.999,  1.0, 1.0])

res = least_squares(residuals, x0, args=(k, w_obs, vega_w),
                    bounds=bounds, method="trf")
```

Inputs:

- `k` — log-moneyness array (one per observed strike for this expiry).
- `w_obs` — observed total variance, `sigma_market^2 * T`, *not* the bare IV.
- `vega_w` — vega weights (or `1 / spread_bp`) so the fit ignores wing noise.

## Calibration tips

- **Warm-start** with yesterday's `(a, b, rho, m, sig)` per expiry — daily moves are small and the optimizer converges in ~30 iterations vs hundreds cold.
- **Forward, not spot.** Use `F = S * exp((r - q) * T)` so the smile is centered correctly; otherwise `m` absorbs the rate-dividend drift.
- **Vega-weighted residuals** — far-OTM strikes have tiny prices and large IV-error sensitivity; weighting by Black-Scholes vega makes the fit care about ATM.
- **Refuse to fit fewer than 8 strikes per expiry** — the parameter space is too rich; you'll get a smile that interpolates noise.
- **Front-month sanity check** — if the fitted ATM IV differs from the observed ATM IV by more than 1 vol point, reject the slice.

## Butterfly arb check (per slice, post-fit)

Define `g(k) = (1 - k * w'(k) / (2 * w))^2 - (w'(k)^2 / 4) * (1 / w + 1/4) + w''(k) / 2`. Need `g(k) > 0` for all `k` in the support; sample on a dense grid. Negative `g` means the density implied by the smile is negative — arbitrage.

## Calendar arb check (across slices)

For any two expiries `T1 < T2`, need `w(k, T1) <= w(k, T2)` for all `k`. Sample the grid; if any crossing, the longer-dated total variance is below the shorter — calendar spread arb. Common when an earnings expiry inflates a near slice — refuse to publish the surface and emit a warning instead.

## SSVI (surface-level)

For a full surface fit (all expiries at once), use SSVI — same parametrization but with `(rho, theta)` functions of `T` instead of per-slice constants. Cleaner no-arb properties; the implementation cost is higher and per-slice raw-SVI is usually enough for the questions this skill answers.

## References

- Gatheral, J. (2004). *A Parsimonious Arbitrage-Free Implied Volatility Parametrization*.
- Gatheral & Jacquier (2014). *Arbitrage-free SVI volatility surfaces*. Quantitative Finance.
