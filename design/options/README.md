# `design/options/` — Options trader UI pack

Per-profile design container for the **US-equity / index options trader** persona. Companion to [`../DASHBOARD-BRIEF.md`](../DASHBOARD-BRIEF.md) (universal visual grammar) and [`../EQUITIES-DASHBOARD.md`](../EQUITIES-DASHBOARD.md) (equities feature set this profile diverges from).

This pack diverges from the parent more than any sibling profile because **options UX is strike-driven and vol-driven, not price-driven**. The candlestick chart that anchors `../day-trading/` and `../swing/` is demoted; the **options-chain viewer becomes the hero** and the **IV-surface heatmap is the showcase visualization**.

## What's inside

| File | What it is |
|---|---|
| [`UI-SPEC.md`](./UI-SPEC.md) | Full layout, component anatomy, motion, a11y, anti-patterns — the complete UX brief for the options profile dashboard. |
| [`code/`](./code/) | Component implementations land here as they are scaffolded by `/dashboard-build options`. |

## The two questions the dashboard answers

Every load:

1. **"Is vol cheap or rich right now?"** — IV/Vol panel (rank gauge + term + skew + optional SVI heatmap).
2. **"Where's my exposure across the greeks?"** — sticky-bottom portfolio greeks bar.

Everything else is in service of acting on those two answers via the canonical chain: **`/iv-surface` → chain → `/options-strategy-builder` → broker → `/greeks-monitor`**.

## Components unique to this profile

These do not appear in any other `design/<profile>/` pack:

- `OptionsChainGrid` — calls / strike / puts, OI-heatmap-tinted cells, ATM-highlighted, click-strike-adds-to-builder.
- `IVRankGauge`, `IVTermStructureChart`, `SkewChart`, `IVSurfaceHeatmap`.
- `PayoffDiagram` — at-expiry + at-asof BS curves, breakeven and POP markers.
- `StrategyBuilderForm` — template dropdown, leg editor, live max P/L + POP + margin, **broker-tier-gate badge**.
- `PortfolioGreeksBar` — sticky-bottom 4-bar Δ Γ Θ ν with 5-color band scheme.
- `RollSuggestionPanel` — in-row defensive-roll suggestions (tested side, 21 DTE).
- `EarningsRiskBadge` — flags any open position whose underlying has earnings inside the position's lifetime.

## Skill chains the UI surfaces

`/iv-surface rank|term|skew|surface|watch`, `/options-chain`, `/options-strategy-builder`, `/greeks-monitor`, `/vol-forecast`, `/decision-card`, `/journal log`, `/mistake-miner`, `/tax-loss-harvest scan|plan`.

## Cross-profile

- `../day-trading/` — intraday equities cockpit (chart-hero).
- `../swing/` — 2-20 day stock holds (chart-hero with multi-day context).
- Sibling profiles share `code/tokens.ts` / `code/tokens.css` from `../code/`; this profile only adds **components**, not tokens. The 5-color greek band scheme reuses existing palette entries (`success`, `warning`, `danger`, plus a `successDeep` constant the parent should add if it isn't there already).

## Updating

When a component lands in `code/`, mirror it into the component table in [`UI-SPEC.md`](./UI-SPEC.md) so the brief stays canonical. The brief is the source of truth; the code is the implementation.

## License posture

Same as the parent — MIT for this repo's contributions. External deps (Lightweight Charts, opstrat, py_vollib, Radix, framer-motion) carry their own MIT / Apache-2.0 / LGPL licenses; see [`../README.md`](../README.md) §"License posture".
