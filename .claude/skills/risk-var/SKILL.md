---
name: risk-var
description: Compute Value-at-Risk and Conditional VaR (Expected Shortfall) for a returns series via three methods — historical, parametric, and GARCH-conditional. Invoke when the user asks for "VaR", "CVaR", "expected shortfall", "downside risk", or "how much can I lose".
---

# When to use

Single-number risk question on a returns series. Don't use for full performance reports — that's `quant-tearsheet`.

# Upstream libraries

- [`empyrical-reloaded`](https://github.com/stefan-jansen/empyrical-reloaded) — `value_at_risk`, `conditional_value_at_risk` (historical & parametric).
- [`arch`](https://github.com/bashtage/arch) — GARCH-conditional VaR via fitted vol + Student-t residuals.
- [`fortitudo-tech`](https://github.com/fortitudo-tech/fortitudo.tech) — only when user requests CVaR optimization with views/stress.

# Recipe

```
/risk-var --returns <csv> --alpha 0.05 --method historical|parametric|garch [--horizon 1|5|21]
```

1. **historical**: `empyrical.value_at_risk(returns, cutoff=alpha)` and `conditional_value_at_risk`.
2. **parametric**: fit Normal or Student-t to returns, then z-score × σ √h.
3. **garch**: fit `arch_model(returns, vol='GARCH', dist='studentst').fit(disp='off')`, project σ_{t+h}, compute parametric VaR on conditional vol.

Always report three rows:
| Method | 1-day VaR (α=5%) | 1-day CVaR (α=5%) |

If `--horizon` > 1, scale via square-root-time for historical/parametric, and via arch's `forecast(horizon=h)` for GARCH (no √t cheat).

# Output convention

Inline markdown table + `reports/risk-var/<ts>/var.json`.

# Install on first use

```bash
uvx --with empyrical-reloaded --with arch --with pandas python -c "import arch"
```

# Don't

- Don't quote a single "VaR number" without naming the method — methods can differ by 3×.
- Don't extrapolate daily VaR to annual with √252 if returns are non-iid — use the GARCH path.
- Don't use `mlfinlab` for advanced risk — it requires a commercial license.

# Credits

- [agiprolabs/claude-trading-skills](https://github.com/agiprolabs/claude-trading-skills) — adjacent VaR + Kelly tooling (crypto-first).
