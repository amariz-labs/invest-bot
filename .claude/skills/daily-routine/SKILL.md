---
name: daily-routine
description: Equity day-trader's daily workflow — pre-market scan, intraday game plan, end-of-day review. Chains together other skills (session-warmup, market-data, equities-screener, trade-journal, mistake-miner). Invoke when the user says "morning routine", "daily game plan", "pre-market", "EOD review", "wrap up the day".
---

# When to use

Once or twice per trading day. Has three modes — `morning`, `midday`, `eod` — each chains a specific subset of other skills.

# What it does

```
/daily-routine morning      # 07:00 - 09:30 ET — pre-market prep
/daily-routine midday        # ~12:00 ET — re-evaluate vs morning plan
/daily-routine eod           # after 16:00 ET — review, journal, prep for tomorrow
```

# Recipe — morning

1. `session-warmup brief` → macro overnight + headlines + open positions briefing.
2. `pre-trade-checklist run` → go/no-go gate writes `data/state.yaml`.
3. `market-data --symbols SPY,QQQ,IWM,VIX --timeframe 1d --years 1` → indexes + vol cache.
4. `equities-screener --filter-pack gap-and-go --limit 25` → watchlist candidates.
5. Earnings calendar today via `market-data --source edgar` or `--source yahoo`.
6. Economic calendar today (FOMC/CPI/Jobless Claims) via FRED + economic API.
7. Compose `data/journal/YYYY-MM-DD-plan.md`:
   - Indices state: SPY trend, QQQ trend, VIX level, futures.
   - Watchlist: 5-10 symbols with thesis, key level, R-size.
   - Avoid list: high-impact news at 8:30, FOMC at 14:00 → avoid trading 13:45-15:00.
   - Targets: P&L goal, max loss cutoff, max number of trades.

# Recipe — midday

1. Read morning plan.
2. Read closed trades since open.
3. Compare to plan: which thesis worked, which didn't?
4. Recompute `state.yaml` — has tilt score moved? sleep/residue still valid?
5. Output: 5-line decision card on whether to continue trading the afternoon, scale back, or stop.

# Recipe — eod

1. Pull all fills from broker via `broker-connect` (or import from `data/trades/`).
2. For each trade: call `trade-journal --action review` (filling realized R, lessons placeholder).
3. Compute day stats: trades, win rate, total R, biggest win, biggest loss, longest hold.
4. Compare to morning targets.
5. Update `data/journal/expectancy.json` rolling windows.
6. Identify single biggest lesson via prompt to the user (one sentence).
7. If end of month, suggest running `mistake-miner`.
8. Write `data/journal/YYYY-MM-DD-eod.md`:
   - Day stats table.
   - Adherence to plan (per-trade ✓/✗).
   - Lessons list.
   - Plan adjustments for tomorrow.

# Output convention

```
data/journal/YYYY-MM-DD-plan.md
data/journal/YYYY-MM-DD-midday.md
data/journal/YYYY-MM-DD-eod.md
data/journal/expectancy.json
data/state.yaml
```

# Install on first use

No new deps beyond the chained skills.

# Don't

- Don't auto-run `eod` before 16:00 ET on a US weekday — partial day data is misleading.
- Don't write `plan.md` if `pre-trade-checklist` set `trade_today: false`. Instead write `data/journal/YYYY-MM-DD-rest.md` recording why.
- Don't compute win rate from < 5 trades.
- Don't moralize in the lessons — the user writes lessons, the skill just provides the form.

# Credits

- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) "Core + Satellite routines" — conceptual parent; our orchestrator chains our own skills end-to-end.
