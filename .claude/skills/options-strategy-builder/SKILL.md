---
name: options-strategy-builder
description: Scaffold and analyze multi-leg options strategies — long call/put, vertical (debit/credit) spreads, iron condor, iron butterfly, calendar, diagonal, straddle, strangle, collar, covered call, cash-secured put. Computes max profit, max loss, breakevens, prob-of-profit, payoff curves, Reg-T margin, and emits an OrderRequest with `option` legs. Invoke when the user says "build me a put credit spread", "iron condor on SPX", "what's the max loss on this calendar", or "scaffold a covered call".
---

# When to use

Strategy R&D + order preview. Chains upstream to `options-chain` for live strikes/IV and `market-data` for spot. Hands off to the BrokerAdapter only after the user approves the preview — this skill never auto-submits.

# Upstream libraries

- [`opstrat`](https://github.com/abhijith-git/opstrat) — MIT; payoff diagrams for stacks of legs.
- [`py_vollib`](https://github.com/vollib/py_vollib) — MIT; Black-Scholes + greeks for mid-life (pre-expiration) curves.
- [`mibian`](https://code.mibian.net/) — LGPL; quick BS sanity check.
- [`QuantLib-Python`](https://www.quantlib.org/) — BSD; only when American-exercise pricing matters (calendars on dividend names).

# Recipe

```
/options-strategy-builder --underlying SPY \
  --strategy iron-condor \
  --expiration 2026-06-20 \
  --strikes 540/545/575/580       # long-put/short-put/short-call/long-call
  --quantity 1
# vertical: --strikes 545/550 OR --width 5 --delta 0.30
# calendar: --expirations 2026-05-30,2026-06-20 --strike 555
```

Supported strategies map to leg templates in `lib/options/strategies.ts`:
`long-call`, `long-put`, `vertical-call-debit`, `vertical-call-credit`,
`vertical-put-debit`, `vertical-put-credit`, `iron-condor`, `iron-butterfly`,
`calendar`, `diagonal`, `straddle`, `strangle`, `collar`, `covered-call`,
`cash-secured-put`.

For each strategy, compute and report:
- `maxProfit`, `maxLoss`, `breakevens[]`
- `probProfit` — from short-strike delta (or BS N(d2) for single-leg)
- payoff at expiration plus at any user-supplied `--asof` date via BS
- Reg-T `marginRequirement` (cash-secured / spread-width / naked formulas)
- OCC symbols for each leg, ready to embed in `OrderRequest.option`

# Risk gate (required)

Before scaffolding, read `account = await broker.getAccount()` and check `account.optionsTier` against `requiredTier` per strategy:

| Strategy | Min tier |
|---|---|
| covered-call, cash-secured-put, long-call/put | 1 |
| vertical spreads, collar | 2 |
| iron condor, iron butterfly, calendar, diagonal, straddle, strangle | 3 |
| naked short call/put | 4 |

If `account.optionsTier < requiredTier`, refuse and tell the user which tier they need from their broker. Mirrors EQUITIES-DASHBOARD.md §7 ("Options approval tier").

# Order emission

Build a single composite `OrderRequest` whose `option` legs array is consumed by brokers that support multi-leg submissions (Tradier, Tastytrade native; IBKR via combo legs; Alpaca only on the new options endpoint with leg limits — fall back to sequential single-leg with `linkedTo` for unsupported brokers). The preview is written, *not* placed:

```
reports/options-strategy/<symbol>/<ts>/
  strategy.json        # legs, greeks, P/L summary
  payoff.png           # opstrat plot, at-expiry + at-asof curves
  summary.md           # human-readable risk card
  order_preview.json   # OrderRequest ready to POST
```

# Install on first use

```bash
uvx --with opstrat --with py_vollib --with QuantLib-Python --with pandas --with matplotlib \
  python -c "import opstrat, py_vollib, QuantLib"
```

# Don't

- Don't scaffold strategies the user's `optionsTier` doesn't authorize — refuse loudly, name the missing tier.
- Don't bury early-assignment risk on short legs — US equity options are American-style; short ITM calls before ex-div and short ITM puts near expiration get assigned. Surface this in `summary.md` for any strategy with a short leg.
- Don't quote `probProfit` as "win rate" — it's a one-touch probability of finishing OTM at expiration; the position can still be a loser intra-life. Label it "POP at expiration".
- Don't use the European-style BS price as the *exit* value for an American short — it understates assignment risk near dividends.
- Don't ignore commissions and the bid-ask spread in `maxProfit` — show net-of-fills numbers when source has them.

# Credits

- [agiprolabs/claude-trading-skills](https://github.com/agiprolabs/claude-trading-skills) — Black-Scholes / binomial / MC pricing (crypto-flavored).
- [staskh/trading_skills](https://github.com/staskh/trading_skills) — options-advisor sibling.
