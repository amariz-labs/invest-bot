---
name: greeks-monitor
description: Live monitor of net portfolio greeks (delta, gamma, theta, vega, charm, vanna) across all open option positions. Refreshes on a configurable interval via the broker's position stream and the data adapter's options chain, emits alerts on threshold breach, and writes a state file the dashboard reads. Invoke when the user says "watch my greeks", "monitor portfolio delta", "alert me if vega blows out", or "start greeks tracker".
---

# When to use

Read-only observer. Reads from `BrokerAdapter.getPositions()` + `BrokerAdapter.streamOrders()` to detect new fills, and from `DataAdapter.getOptionsChain()` / `streamQuotes()` for live greeks and underlying spots. **Does not trade.** When the monitor flags an imbalance the human (or a manual `options-strategy-builder` invocation) decides what to do.

# Upstream libraries

- [`py_vollib`](https://github.com/vollib/py_vollib) — MIT; computes greeks locally when the chain source omits them (e.g. yfinance fallback).
- [`py_vollib_vectorized`](https://github.com/marcdemers/py_vollib_vectorized) — MIT; vectorized recomputation across a portfolio in one call.
- [`rich`](https://github.com/Textualize/rich) — MIT; tabular live terminal output.
- [`watchfiles`](https://github.com/samuelcolvin/watchfiles) — MIT; cheap interval loop.

# Recipe

```
/greeks-monitor start \
  --interval 5s \
  --alert-delta-pct 25 \      # |portfolio Δ| > 25% of equity → notify
  --alert-theta-min -250 \    # theta < -$250/day → notify (paying too much for gamma)
  --alert-vega-pct 15         # |vega| > 15% of equity → notify
/greeks-monitor stop
/greeks-monitor snapshot      # one-shot, no loop
```

Loop body (pseudo):

```python
positions = [p for p in broker.getPositions() if is_option(p.symbol)]
chain     = {u: data.getOptionsChain(u) for u in {underlying(p) for p in positions}}
rows      = [enrich(p, chain) for p in positions]   # adds Δ Γ Θ ν χ vanna
totals    = aggregate(rows)                          # net + dollar-greeks + ratios
write_state(rows, totals)
maybe_alert(totals, account.equity)
```

# Surfaces

Per-position table (rendered via `rich.Table`) and portfolio totals strip:

| field | meaning |
|---|---|
| `Δ`, `Γ`, `Θ`, `ν` | per-contract greeks × signed qty × 100 |
| `dollarDelta` | `Δ × spot` (the equivalent stock exposure) |
| `dollarGamma` | `Γ × spot²` (P&L convexity per 1% move) |
| `thetaPerDay` | `Σ Θ`, in USD/day, negative = bleeding |
| `gammaThetaRatio` | proxy for "are we being paid enough for the gamma" |
| `charm`, `vanna` | second-order; bucket by DTE so 0DTE doesn't dominate |

# Alerts

Threshold breaches are appended to `data/greeks/alerts.jsonl` and pushed to the same notification channel `tilt-guard` and `alert-webhook` use (`notify(level, message)` in `lib/notify.ts`). Cooldown: 5 minutes per alert key to avoid flapping.

# Output

```
data/greeks/state.json       # latest snapshot — dashboard widget polls this
data/greeks/history.jsonl    # one line per minute, for replay & post-mortem
data/greeks/alerts.jsonl     # threshold breaches with timestamp + cause
~/.claude/cache/financial-planner/greeks-monitor/<underlying>_chain.json
```

The dashboard's Greeks tile reads `data/greeks/state.json` directly — no API needed.

# Install on first use

```bash
uvx --with py_vollib --with py_vollib_vectorized --with rich --with watchfiles --with pandas \
  python -c "import py_vollib, rich"
```

# Don't

- Don't compute greeks from a delayed chain without setting `stale: true` in `state.json` — a 15-min lag on theta during a vol spike is misleading.
- Don't assume European-style on equity options — they're American; use `py_vollib.ref_python.american` (or QuantLib) for short ITM legs near dividends, not the Black-Scholes closed form.
- Don't aggregate 0-DTE vega into a long-horizon vega number — bucket by DTE (`<7`, `7-30`, `30-90`, `>90`); 0DTE vega is mathematically tiny but P&L-dominant on the day.
- Don't treat a flat net delta as "delta-neutral" if dollar-gamma is large — you're one move away from a big delta.
- Don't trade from this skill. Acting on greeks goes through `options-strategy-builder` and an explicit broker call.
