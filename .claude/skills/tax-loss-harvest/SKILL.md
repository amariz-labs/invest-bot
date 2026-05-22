---
name: tax-loss-harvest
description: Scan broker positions + closed trades for harvestable losses, project after-tax benefit, flag wash-sale risk across all accounts (incl. IRAs per Rev. Rul. 2008-5), and prepare Form 8949 data. Invoke when the user asks "any losses to harvest", "tax loss scan", "year-end tax", "/tax-loss-harvest scan|plan|reconcile|1099-prep".
---

> **DISCLAIMER — NOT TAX ADVICE.** This skill prepares data for review by the user and their CPA/EA. Every report must print this line at the top. The IRS has not ruled definitively on most "substantially identical" ETF questions; this skill emits citations and YES/MAYBE/NO classifications, never a unilateral YES.

# When to use

- **Quarterly check** — end of March / June / September / December.
- **December rush** — Dec 1 through Dec 31, before the year closes and the wash-sale 30-day window straddles year-end.
- **After any significant drawdown** — when a position is > 10% underwater and held > 31 days (so the prior-30 window is clear).
- **Before rebalancing** — surfaces "harvest while you're already trading" opportunities.

Companion to [`trade-journal`](../trade-journal/SKILL.md) (sources `data/journal/` + `data/trades/`) and [`etf-analyzer`](../etf-analyzer/SKILL.md) (substantially-identical adjudication).

# Upstream references

- **IRS Pub. 550** — Investment Income and Expenses; chapter on losses, wash sales, holding periods. Primary source.
- **IRS Pub. 564** — Mutual Fund Distributions (basis adjustment rules).
- **IRC §1091** — the wash-sale statute itself.
- **Rev. Rul. 2008-5** — wash-sale rule applies when the replacement is purchased in an IRA. The most-missed trap. Cite loudly.
- **Form 8949 + Schedule D instructions** — column layout this skill targets.
- **TradeNote schema** — `wash_disallowed_amount` field on closed trades ([`Eleven-Trading/TradeNote`](https://github.com/Eleven-Trading/TradeNote)).
- **Background reading** — Betterment and Wealthfront tax-loss-harvesting whitepapers (vendor research, not authority).

# Recipe

```
/tax-loss-harvest scan
/tax-loss-harvest plan --candidates AAPL,GOOG --replacement-mode strict|loose
/tax-loss-harvest reconcile --year 2026 --bracket 0.20 --state-bracket 0.093
/tax-loss-harvest 1099-prep --year 2026
```

### `scan`

Walk `getPositions()` (see [`design/code/BrokerAdapter.ts`](../../../design/code/BrokerAdapter.ts) — `Position.costBasis` + `unrealizedPnl`). Emit `reports/tax-loss-harvest/<year>/<ts>/candidates.csv` with columns: `symbol, qty, cost_basis, market_value, unrealized_loss, holding_period_days, st_vs_lt, days_to_lt_crossover, last_30d_buys, last_30d_buys_in_other_accounts, wash_risk_flag, suggested_action`.

### `plan`

Per symbol the user accepts: emit `plan.md` containing
- Sale lot selection (specific-ID vs FIFO — flag if broker default isn't specific-ID).
- The two wash-sale window dates: `sale_date - 30d` and `sale_date + 30d`.
- Replacement candidates from `references/substantially-identical-matrix.md`. Strict mode = same-index ETFs blocked. Loose mode = same-index different-issuer allowed with a warning.
- Projected loss × user bracket = estimated tax deferred (NOT "saved" — see Don't).

### `reconcile`

Year-to-date walk of `data/trades/` + `data/journal/`. Compute: total realized ST gains, total realized LT gains, total wash-disallowed amount, net realized, projected tax owed at user-supplied bracket, carryforward into next year. Emit `reconcile.md`.

### `1099-prep`

Emit `form_8949.csv` matching the Form 8949 columns exactly: **(a)** description, **(b)** date acquired, **(c)** date sold, **(d)** proceeds, **(e)** cost basis, **(f)** code (W for wash sale, etc.), **(g)** adjustment, **(h)** gain/(loss). Cross-foot to the user's broker 1099-B; mismatches > $1 emit a warning row.

# Substantially-identical heuristics

The IRS has been deliberately vague since 1936. This skill emits **rules + citations + a YES / MAYBE / NO label**, never a unilateral verdict.

| Pair type | Example | Default verdict | Basis |
|---|---|---|---|
| Same ETF / same CUSIP | SPY ↔ SPY | **YES (identical)** | Tautology; §1091 plain language. |
| Same index, different issuer | SPY ↔ IVV ↔ VOO (S&P 500) | **MAYBE → strict treats as YES** | IRS has never ruled. Pub. 550 silent. Most CPAs and Vanguard's own guidance say avoid. |
| Same broad asset class, different index | VTI (CRSP US Total) ↔ ITOT (S&P Total) | **MAYBE → strict treats as YES** | Holdings overlap ~99%. Loose mode allows; flag the gray area. |
| Same sector, different index methodology | XLK (S&P) ↔ VGT (MSCI) ↔ IYW (Russell) | **MAYBE → loose allows, strict warns** | Different underlying indices; case for "not identical" is stronger but not settled. |
| Individual stock ↔ ETF that holds it < 30% | AAPL ↔ QQQ | **NO** | Component weight too low; consistent with practitioner consensus. |
| Mutual fund ↔ its ETF share class | VTSAX ↔ VTI | **YES (identical)** | Same portfolio, same manager, share-class conversion is non-taxable. |
| Options on same underlying, same strike/expiry | long AAPL stock sold ↔ long AAPL call | **YES (identical) — see §1091(a)** | Statute explicitly covers options/contracts to acquire substantially identical securities. |

Every emitted recommendation must include the citation and the verdict label. See [`references/substantially-identical-matrix.md`](./references/substantially-identical-matrix.md) for the full working matrix.

# Wash-sale window logic

A **wash sale** occurs when, within **30 days before OR 30 days after** the loss sale, the taxpayer (or spouse, or a controlled entity) acquires a substantially identical security. **Total window = 61 days** (day of sale + 30 each side).

**Cross-account scope — flag loudly:**
- Same taxable brokerage account ✓ obvious.
- Different taxable brokerage account at the same or different broker ✓.
- A spouse's account (filing jointly or separately) ✓.
- **An IRA — Traditional or Roth — owned by the same taxpayer ✓** (Rev. Rul. 2008-5). The IRA purchase disallows the taxable-account loss AND the disallowed loss does NOT add to the IRA's basis — it vanishes. This is the worst-case scenario.
- A 401(k) — currently unsettled; this skill treats it as in-scope by default (conservative) and flags `IRS_UNCLEAR_401K`.

Options on the same underlying (puts written, calls held) are also in scope per §1091(a). See [`references/wash-sale-rules.md`](./references/wash-sale-rules.md).

# Wash-sale ledger

Persistent at `data/tax/wash-sale-ledger.csv`. When `trade-journal` logs a closing trade at a loss, this skill (via post-trade hook) scans the prior + next 30 days of `data/trades/` and `data/journal/` across all configured accounts. If a substantially identical buy is found:
1. Set `wash_disallowed_amount` on the closed trade.
2. Append the disallowed amount to the replacement lot's cost basis (`adjusted_basis = original_basis + wash_disallowed`).
3. Extend the replacement lot's holding period to include the sold lot's holding period (§1223(3)).
4. Log a row in the ledger with: sale order id, replacement order id, disallowed $, basis adjustment, account pair.

# Output convention

```
reports/tax-loss-harvest/<year>/<ts>/candidates.csv
reports/tax-loss-harvest/<year>/<ts>/plan.md
reports/tax-loss-harvest/<year>/<ts>/reconcile.md
reports/tax-loss-harvest/<year>/<ts>/form_8949.csv
data/tax/wash-sale-ledger.csv          # persistent
data/tax/config.yaml                   # user bracket, accounts, replacement-mode default
```

# Install on first use

```bash
uvx --with pyyaml --with pandas --with python-dateutil python -c "import pandas, yaml, dateutil"
```

# Don't

- **Don't** render a unilateral "YES, substantially identical" verdict on any ETF pair the IRS has not directly addressed. Emit the rule + the citation + a YES / MAYBE / NO label and the basis for it. The user owns the judgment.
- **Don't** compute a "tax saved" number without the user's marginal cap-gains bracket (and state bracket where relevant) as explicit input. Default-zero leads to silent garbage.
- **Don't** recommend harvesting a position that is **within 7 days of long-term holding-period crossover** (≥ 358 days held). Long-term losses are less valuable when offsetting short-term gains; flag and suggest waiting unless year-end timing forces the hand.
- **Don't** ignore the **$3,000/year net-capital-loss deduction cap** (§1211(b)) against ordinary income. Excess carries forward indefinitely but should be surfaced in `reconcile.md` so the user doesn't over-harvest into a wasted carryforward.
- **Don't** ignore the **$1,500 cap if married filing separately**.
- **Don't** generate or file tax forms. This skill PREPARES data for Form 8949 / Schedule D; the user or their CPA files.
- **Don't** suppress the disclaimer. Every emitted report begins with the NOT-TAX-ADVICE line.
- **Don't** omit the IRA cross-account check. Rev. Rul. 2008-5 is the single most-missed rule and the one with no basis-restoration remedy.
- **Don't** assume FIFO. If broker default isn't specific-lot-ID, surface that — it changes which lots get sold.
