---
name: trade-journal
description: Log a trade as a YAML-frontmatter markdown file under `data/journal/`, schema-compatible with TradeNote. Computes per-trade R, % of account, and rolling expectancy. Invoke when the user says "journal this trade", "log my trade", "/journal log".
---

# When to use

User has just opened, closed, or wants to review a trade. Companion to `decision-card` (pre-trade reasoning) and `mistake-miner` (retrospective).

# Upstream references

- [`Eleven-Trading/TradeNote`](https://github.com/Eleven-Trading/TradeNote) — schema reference + future sync target.
- [`Simple-Rich-Trading-Journal`](https://github.com/Simple-Rich-Trading-Journal/Simple-Rich-Trading-Journal) — stat ideas.
- [`wdm0006/keeks`](https://github.com/wdm0006/keeks) — Kelly sizing reference for the `r_planned` field.

# Recipe

```
/trade-journal --action open|close|review --symbol AAPL --side long --entry 192.30 \
  --stop 188.00 --target 200.00 --size 100 --account-value 50000 \
  --setup "earnings_gap" --thesis "Q1 beat + raised guidance, volume confirmation"
```

On `open`, write `data/journal/YYYY-MM-DD/<order_id>.md`:
```markdown
---
order_id: 20260522-AAPL-1
symbol: AAPL
side: long
status: open
opened_at: 2026-05-22T14:31:00Z
entry: 192.30
stop: 188.00
target: 200.00
size: 100
risk_dollars: 430.00          # (entry - stop) * size
risk_pct_account: 0.86        # risk_dollars / account_value
r_planned: 1.79               # (target - entry) / (entry - stop)
setup: earnings_gap
thesis: |
  Q1 beat + raised guidance, volume confirmation
mood: focused
sleep_hours: 7
nlp_sentiment: null           # filled by tilt-guard
---
```

On `close`, append:
```markdown
closed_at: 2026-05-23T19:55:00Z
exit: 198.40
pnl: 610.00
r_realized: 1.42
hold_minutes: 1764
exit_reason: target_partial
lessons: ""                  # to be filled later by mistake-miner
```

After every close, recompute and emit `data/journal/expectancy.json`:
- win_rate, avg_win_R, avg_loss_R, expectancy_R, profit_factor over last 20 / 50 / 100 trades.

# Output convention

```
data/journal/YYYY-MM-DD/<order_id>.md
data/journal/expectancy.json
```

# Install on first use

```bash
uvx --with pyyaml --with pandas python -c "import yaml"
```

# Don't

- Don't overwrite a closed trade — append; if user wants to amend a number, write a `corrections:` block.
- Don't compute "win rate" without flagging sample size — < 30 trades is noise.
- Don't auto-classify `lessons` — that's `mistake-miner`'s job and needs more context than one trade.

# Credits

- [Eleven-Trading/TradeNote](https://github.com/Eleven-Trading/TradeNote) — our YAML frontmatter is schema-compatible; route exports there for the Vue/Mongo UI.
- [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills) — sibling journal skill with a richer lifecycle.
