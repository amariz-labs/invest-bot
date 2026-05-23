# Options Profile — UI Specification

Companion to [`../DASHBOARD-BRIEF.md`](../DASHBOARD-BRIEF.md) and [`../EQUITIES-DASHBOARD.md`](../EQUITIES-DASHBOARD.md). The visual grammar carries over (tokens, type, motion, a11y) — but the **information architecture inverts**. This profile's dashboard is **strike-driven and vol-driven**, not price-driven, so the candlestick chart that anchors every other profile is demoted to a corner and the **options-chain viewer becomes the hero**.

Target deployment: Next.js dashboard at 1920×1080+, with the IV-surface heatmap as the showcase visualization.

---

## §0. The persona-bound UX premise

The dashboard answers two questions on every load:

1. **"Is vol cheap or rich right now?"** — answered by the IV/Vol panel (IV rank gauge, term structure, skew, optional SVI heatmap).
2. **"Where is my exposure across the greeks?"** — answered by the sticky portfolio greeks bar at the bottom of the viewport.

Everything else is secondary. If a screen element does not contribute to answering one of those two questions or to **acting on the answer** (chain → builder → broker), it does not earn its pixels.

This is why we do not put a candlestick chart on the page by default. The underlying price is a single number on the symbol selector; the OHLCV story does not move a vol-first trader's decision more than the IV/Vol panel does. If a user wants chart context they switch profiles (`cd ../swing` or `cd ../day-trading`).

---

## §1. Visual density

High, but in a different shape than the day-trading profile. Day-trading wants screen real estate dominated by **one big chart with overlays**; options wants screen real estate dominated by **one big numbers table** (the chain) plus **one big heatmap** (the IV surface) plus **one big bar chart** (the greeks budget).

Information lanes:

| Lane | Density target | Refresh cadence |
|---|---|---|
| KPI strip (5 tiles) | 5 numbers, no charts | 1 Hz (account equity, BP); 5 s (IV rank, net Δ) |
| Options chain | ~30 visible rows × 18 columns = ~540 cells | Throttled to ≤1 Hz |
| IV/Vol panel | 1 gauge + 3 charts stacked | 5 s (gauge), 60 s (term/skew), on-demand (surface) |
| Payoff diagram | 1 line plot, 2 series (at-expiry, at-asof) | On builder change |
| Strategy builder | Form, 10–20 inputs | Interactive |
| Open positions | 1 row per position, ~10 columns | 30 s |
| Portfolio greeks bar | 4 horizontal bars | 30 s |

Total visible numeric cells on a typical load: **~700**. That is high. The 5-color greek band scheme and the OI heatmap tinting on the chain are the mechanisms that prevent the eye from drowning.

---

## §2. Top-level layout (Tailwind grid, 1920×1080 default)

Twelve-column grid, `gap-3` (12px), `p-4` (16px) outer padding. Rows are explicit heights — this is a cockpit, not a marketing page.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Row 1 — KPI strip (h-20)                                                    │
│  [Equity] [Tier] [BP] [IV Rank: SPY] [Net Δ]                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│  Row 2a — Symbol + expiration selector (h-12, col-span-12)                   │
├────────────────────────────────────────────────┬─────────────────────────────┤
│  Row 2b — OptionsChainGrid (col-span-7, h-[480px])                          │
│    calls │ strike │ puts        OI-tinted, ATM hi-lit                       │
│                                                │ IV/Vol Panel (col-span-5)  │
│                                                │  [IV Rank Gauge]            │
│                                                │  [52w ATM IV mini-chart]    │
│                                                │  [Term-structure curve]     │
│                                                │  [Skew chart]               │
├────────────────────────────────────────────────┼─────────────────────────────┤
│  Row 3 — PayoffDiagram (col-span-7, h-[320px]) │ StrategyBuilderForm (5)     │
├──────────────────────────────────────────────────────────────────────────────┤
│  Row 4 — Open Positions table (col-span-12, h-[200px])                       │
│   structure | legs | maxP | maxL | P&L | DTE | Δ Θ ν | actions               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Row 5 — Portfolio Greeks Bar (sticky bottom, h-16, col-span-12)             │
│   Δ ████░░░  Γ ██░░░░  Θ ███░░░  ν █████░  (color bands)                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

The chain is wider than the IV panel by design — vertical scrolling on the chain is the **expected** scan path, while the IV panel is meant to be taken in at a glance.

The greeks bar is `position: sticky; bottom: 0` so it survives any scroll: it is the single piece of information a vol trader must never lose sight of.

---

## §3. Row 1 — KPI strip (top of viewport)

Five tiles, **in this order** (left to right). Order matters; this is the four-numbers-plus-tier a real options trader reads first.

| Tile | Source | Notes |
|---|---|---|
| **Account Equity** | `broker.getAccount().equity` | Compact USD. Delta = day change. Sparkline 1d. |
| **Options Tier** | `broker.getAccount().optionsTier` | Pill: "Level 3" — color: green tier ≥3, amber 2, red 1. Click → modal explaining which strategies are unlocked. |
| **Buying Power** | `broker.getAccount().buyingPower` | Two-row: cash BP / margin BP. **No PDT countdown** in this profile — options-income traders don't day-trade enough to hit PDT. |
| **IV Rank · active symbol** | `iv-surface rank` | Big number 0–100. Uses the same 3-color band as the IVRankGauge (red <30, amber 30–70, green >70) — **but only for the band stroke, never the digit color**. Subscript: "Pctl 62". |
| **Portfolio Net Δ** | `data/greeks/state.json` | Two-line: `+0.32` over `$dollarDelta` (e.g. `+$24,140`). Color: neutral if `|Δ%equity|<10`, amber 10–25, red >25. |

These five answer the four questions ("how much money do I have, what can I trade, what's my buying power, is vol rich, where's my net delta") at a glance. Everything else in the dashboard is in service of acting on these.

---

## §4. Component anatomy

Each component is its own React file under `code/`. Markdown sections below mirror the eventual `<ComponentName>.tsx` source layout.

### 4.1 `OptionsChainGrid`

**Purpose.** The hero. Calls on the left, strike column in the middle, puts on the right — Sensibull / thinkorswim layout.

**Structure.**

```
┌────────────────────── CALLS ──────────────────────┬──────┬───────────────── PUTS ───────────────────────┐
│ bid  ask  last  vol  OI   IV   Δ    Θ    ν  │ … │STRIKE│ … │ bid  ask  last  vol  OI   IV   Δ    Θ    ν │
│ 4.85 4.90 4.87 2.1k 18k 19%  0.62 -0.04 0.18│   │ 540  │   │ 0.42 0.45 0.43 1.8k 22k 21%  -0.18 -0.03 0.15│
│ ...                                                 │ ...  │   │ ...                                        │
```

**Columns per side** (9 each, plus the central strike): `bid`, `ask`, `last`, `vol`, `OI`, `IV`, `Δ`, `Θ`, `ν`.

**Visual rules.**

- **ATM row** highlighted: `bg-surfaceElevated` plus a 2px left border in `accent.300` violet.
- **ITM cells** (calls below spot, puts above spot): `bg-success/8` tint.
- **OI heatmap tinting:** each `OI` cell gets a linear-scale background from `bg-surface` to `accent.500/40` based on `OI / max(OI in visible expiration)`. Reveals where the open interest is concentrated without adding a separate chart.
- **Bid-ask spread guard:** if `(ask − bid) / mid > 0.10`, the row's bid and ask are rendered in `warning` (amber) — that strike is illiquid; the builder should refuse to scaffold it.
- **Strike column:** monospaced, larger weight (16px vs 14px body), neutral color. Click on a strike opens a "add to builder" popover with quick-pick strategy chips (CSP, CC, long call, long put, vertical, calendar) seeded to that strike.

**Interaction.**

- **Click cell** → adds that leg (call vs put inferred from side, qty +1) to the StrategyBuilderForm.
- **Shift-click cell** → adds the leg as a short.
- **Hover row** → tooltip with full BS-derived greeks plus assignment-risk badge if any short ITM scenario for that strike triggers (`extrinsic < 0.10` AND `dte < 5`).
- **Right-click strike** → context menu: "set as ATM anchor", "copy OCC symbol", "view 52w IV here".

**Throttling.** Cell updates are coalesced to ≤1 Hz. A bid-ask-tick flash (`opacity 0 → 1` over 80 ms) marks updated cells subtly. **No live red/green tick flash on every quote update** — see §10 anti-patterns.

**Data shape.** Reads `data.realtime.getOptionsChain(symbol, expiration)`. Schema per row matches `DataAdapter.OptionsChainRow` (strike, callBid, callAsk, callLast, callIV, callDelta, callTheta, callVega, callOI, callVolume, and the mirror for puts).

**a11y.** Each cell exposes `aria-label="SPY 500 call, bid 2.40, ask 2.45, IV 18%, delta 0.42"`. The grid as a whole is `role="grid"` with row/column headers; SR users can navigate by arrow keys.

---

### 4.2 `IVRankGauge`

**Purpose.** The first thing the trader looks at on the IV/Vol panel.

**Structure.** Semi-circle gauge, 0–100, with a center digit (large, 40px, weight 600, `tabular-nums`). Subscript line: "Pctl 62 · 30d IV 18.4%". Below: a 12px caption with the active symbol.

**Color bands.**

- 0–30 → red stroke (premium **cheap**, buy)
- 30–70 → amber stroke (middle, often "no trade")
- 70–100 → green stroke (premium **rich**, sell)

The 3-color band is encoded on **the gauge arc only**. The center digit is always `contentPrimary` white. **No green/red on the digit itself** — see §10 anti-patterns. The band semantic is "directional bias for premium" not "good/bad."

**Motion.** Needle tweens to new value over 360 ms with `motion.ease.decelerate`. Respects `prefers-reduced-motion`.

---

### 4.3 `IVTermStructureChart`

**Purpose.** Show whether the front of the curve is **backwardated** (event premium) or **contango** (normal).

**Structure.** Line chart, x-axis: 7 / 14 / 30 / 60 / 90 DTE buckets; y-axis: ATM IV in vol points. Single line, accent violet (`accent.300`).

**Annotations.**

- Slope value (`ATM_IV(60) − ATM_IV(30)`) overlaid top-right as a chip.
- If slope < 0: chip color → `warning` amber, and a downward arrow glyph appears at the front of the curve. Caption: "Backwardation — event priced in front".
- If slope > 0: chip neutral. Caption: "Contango".

**Width.** Full panel width (col-span-5). Height: 96 px — this is a glance-chart, not a deep-dive chart. Click → expands to a modal with strike-by-strike term structure.

---

### 4.4 `SkewChart`

**Purpose.** Show whether puts or calls are richer at the chosen DTE.

**Structure.** Smile plot — x-axis: delta (`-0.45` to `+0.45`); y-axis: IV. Points connected with a smooth spline. Vertical reference lines at `Δ = ±0.25` highlight the canonical skew strikes.

**Annotations.**

- "25Δ skew: +3.2 vol pts" chip top-right.
- Positive skew → caption "Puts richer (typical for indices)".
- Negative skew → caption "Calls richer (squeezy single-name)" with amber tint on the chip.

**DTE selector.** Small segmented control at the top: 7 / 14 / 30 / 60 / 90. Default 30. The choice persists per-symbol.

---

### 4.5 `IVSurfaceHeatmap`

**Purpose.** The showcase visualization. Answers "where on the surface is vol misbehaving?".

**Structure.** 2D heatmap. X-axis: DTE buckets (7 / 14 / 30 / 60 / 90 / 180). Y-axis: moneyness (`K/S` from 0.85 to 1.15 in 0.025 steps). Color: IV (low = `accent.600` deep violet, high = `warning` amber, via a continuous colormap matching the dashboard palette — not viridis).

**SVI overlay.** If `iv-surface surface --model svi` was run, the fitted surface is rendered as a 1-px contour grid on top. The fitted-vs-empirical residual is exposed as a toggle (default off).

**Interaction.** Click a cell → opens the chain filtered to that DTE/moneyness bucket. The chain scrolls and the bucket's strike is highlighted with a flash (220 ms).

**Modal expansion.** Click the panel title → expands to a 1200×800 modal with a true 3D (Three.js / `plotly`) surface render for users who want it. The 2D default is the canonical viewer; the 3D is a vanity / presentation mode.

**Performance.** Re-render only when `data/iv/<symbol>/atm_iv.parquet` mtime changes or the user explicitly re-runs `/iv-surface surface`. Do not re-fetch on every chain tick.

---

### 4.6 `PayoffDiagram`

**Purpose.** Show the P&L curve of the strategy being built, **before** the user submits.

**Structure.** Line chart, x-axis: underlying price at expiration (centered on spot, ±25% range); y-axis: P&L in USD.

**Series.**

- **At expiration** — solid line, `accent.300`. Shaded region between breakevens uses `success/12` (subtle profit zone). Loss zones use `danger/8`.
- **At `--asof` date** — dashed line, `accent.100`, computed via Black-Scholes through `py_vollib`. Only drawn when the user has picked a non-expiry date.
- **Spot price marker** — vertical line, 1px, `contentSecondary`, with a small label at the bottom: "Spot 547.20".
- **Breakeven markers** — vertical 1px lines at each breakeven; labels at top: "BE 542.18", "BE 561.82".

**Labels.**

- Top-left chip cluster: "Max profit +$340 · Max loss −$160 · POP at expiration 68%".
- The phrase **"POP at expiration"** is mandatory — never abbreviate to "win rate" (see CLAUDE.md safety).

**Refresh.** Re-computes on every leg edit in the builder. Debounced 150 ms.

---

### 4.7 `StrategyBuilderForm`

**Purpose.** Scaffold the multi-leg ticket. The form that turns vol assessment into an order.

**Structure.**

```
┌─ Strategy ─────────────────────────────────────────────────────┐
│  [dropdown: vertical / iron-condor / calendar / straddle / …] │
│  Template loaded: Put Credit Spread                            │
├─ Legs ─────────────────────────────────────────────────────────┤
│  [+] qty  side  strike  exp        type                        │
│      −1   short 545     2026-06-20 PUT                         │
│      +1   long  540     2026-06-20 PUT                         │
├─ Computed (live) ──────────────────────────────────────────────┤
│  Max profit: +$165   Max loss: −$335   POP@exp: 72%            │
│  Breakevens: 543.35                                            │
│  Reg-T margin: $500   Net credit: $1.65                        │
├─ Tier gate ────────────────────────────────────────────────────┤
│  [● green] Requires tier 2 — you have tier 3. OK to scaffold.  │
├─ Order ────────────────────────────────────────────────────────┤
│  [Preview]   [Save Decision Card]   [Send to Broker →]         │
└────────────────────────────────────────────────────────────────┘
```

**Templates.** Dropdown items map 1:1 to `lib/options/strategies.ts`: long-call, long-put, vertical-call-debit, vertical-call-credit, vertical-put-debit, vertical-put-credit, iron-condor, iron-butterfly, calendar, diagonal, straddle, strangle, collar, covered-call, cash-secured-put.

**Live computed block.** Updates on every leg edit. `maxProfit`, `maxLoss`, `breakevens[]`, `probProfit` (label: "POP@exp" — never "win rate"), `marginRequirement`. All numbers tabular-nums; loss numbers shown in `danger`, profit in `success`.

**Broker-tier-gate badge.** This is unique to the options profile and **must** be visible at all times.

- Green pill `Requires tier N — you have tier M. OK to scaffold.` when `tier_user ≥ tier_required`.
- Red pill `Requires tier N — you have tier M. Request an upgrade from your broker.` when under-authorized; submit button disabled.
- The badge reads `broker.getAccount().optionsTier` and consults the mapping in `options-strategy-builder/SKILL.md` §"Risk gate".

**Order submission.** "Send to Broker" opens a confirmation modal (see §6). The skill emits `OrderRequest` with `option` legs; the modal is the friction beat that turns a click into a deliberate action.

---

### 4.8 `PortfolioGreeksBar`

**Purpose.** The sticky-bottom strip that survives every scroll. The trader's portfolio greeks budget at a glance.

**Structure.** Four horizontal bars stacked left-to-right (or right-to-left in RTL):

```
Δ  ─────████░░░░░░░░░  +0.32  $24,140
Γ  ─░░██░░░░░░░░░░░░░  +0.08  $604
Θ  ──████░░░░░░░░░░░░  −$185 /day
ν  ───██████░░░░░░░░░  +$1,240 / 1 vol pt
```

**Color rules.** Each bar's fill color is determined by the greek's distance from the user-configured threshold:

| Band | Distance | Color |
|---|---|---|
| Deep-green | <30% of threshold | `#16A34A` |
| Green | 30–60% | `success` `#22C55E` |
| Neutral | 60–80% | `contentSecondary` |
| Amber | 80–100% | `warning` `#F0B429` |
| Red | >100% (breach) | `danger` `#EF4444` |

Same 5-color band scheme everywhere the dashboard shows a greek number (open positions table cell, KPI strip net-delta tile, this bar). Consistency across surfaces is non-negotiable.

**Interaction.** Click a bar → opens a right-side drawer (`ω` 480px) that breaks down the greek by position: per-row contribution to Δ/Γ/Θ/ν with mini-bars. Useful for "which position is bleeding theta?"

**Refresh.** Polls `data/greeks/state.json` every 30 s. Animates width change over 220 ms with `motion.ease.standard`. If the state file is older than 90 s, the bar dims to 50% opacity and a "stale" pill appears top-right.

---

### 4.9 `RollSuggestionPanel`

**Purpose.** Suggest defensive action when an open position is in trouble.

**Trigger conditions** (any one suffices; checked on position update):

- Underlying within one strike width of a short strike → **defensive roll out and away**.
- DTE < 21 on a short-premium position → **calendar roll** to next expiry.
- Position at ≥ 50% of max profit on a credit spread → **take profit**.

**Structure.** Appears as a card inside the Open Positions row (expandable in place) — not a modal. Header: position identifier, trigger reason. Body: 2–3 suggested rolls scaffolded by `/options-strategy-builder` with `--roll-from <position_id>`; each shows new strikes, new expiry, net credit/debit, new max profit/loss.

**Action.** "Apply roll →" button pre-fills the StrategyBuilderForm with the roll legs. Submission still requires the user to walk through §6 confirmation.

**Don't.** Never auto-execute a roll. Never suggest a roll for a debit (PLAYBOOK.md P3: "rolling for a debit is throwing good money after bad" — refuse).

---

### 4.10 `EarningsRiskBadge`

**Purpose.** Surface the single biggest unforced error in directional options trading: forgetting that earnings is inside the position's lifetime.

**Trigger.** Any open position whose underlying has an earnings event between today and the position's furthest expiration date.

**Structure.** Small pill in the Open Positions row, placed before the structure name. Yellow background, calendar glyph, text: "ER 2026-06-04 (12d)". Hover: tooltip with consensus EPS, prior IV behavior around earnings, and a warning depending on the position type:

- Long premium → "Warning: IV will likely crush 30–50% post-print. Direction alone may not be enough."
- Short premium → "Warning: assignment + gap risk. Consider closing before the print."

**Data dependency.** Earnings calendar — **this is a gap**. No existing skill in the repo currently provides an earnings adapter. `daily-routine` references one but doesn't ship it. Stop-gap: pull from yfinance (`ticker.calendar` and `ticker.earnings_dates`) until a proper `earnings-calendar` adapter exists (see §11 follow-ups).

---

## §5. Type and color conventions

- **All numerics:** `tabular-nums slashed-zero`. The chain depends on column alignment; misaligned digits make it unreadable.
- **Greeks colors (5-band):** consistent across `OptionsChainGrid` per-row tooltip, `PortfolioGreeksBar`, KPI Net-Δ tile, Open Positions per-position columns, and the strategy builder live-computed greeks. One scheme, applied uniformly.
- **P&L colors:** `success` green for profit, `danger` red for loss. Never used on IV rank or greeks magnitudes (those use the 5-band scheme).
- **OI tinting:** ramp from `bg-surface` to `accent.500/40`. Violet, not green — green is reserved for P&L direction.
- **Strike column type:** 16px monospaced, weight 500. Larger than the body 14px because it is the eye's anchor on every chain scan.

---

## §6. Interaction surface

**Click-driven, not keyboard-driven.** Unlike the day-trading profile (where every millisecond and every keystroke counts), the options trader places 1–20 tickets per week — friction is a feature, not a bug.

**Primary flow:**

1. Glance at IVRankGauge.
2. Click a strike (or shift-click for short) in OptionsChainGrid → appears in StrategyBuilderForm legs.
3. Pick a template from the dropdown to wrap the leg(s) into a structure.
4. Review PayoffDiagram + tier-gate badge.
5. Click "Send to Broker →".
6. **Confirmation modal** opens (always — options orders deserve a friction beat). Modal shows: full leg list with OCC symbols, net credit/debit, max profit/loss, POP@exp, Reg-T margin, slippage estimate, broker route, and **a checkbox `I have reviewed assignment risk`** that must be checked if any leg is short ITM or has an earnings event inside its life.
7. "Confirm submit" sends to broker; receipt appears in Open Positions within 1 polling cycle.

**Keyboard shortcuts** (secondary, for the experienced user):

| Key | Action |
|---|---|
| `/` | focus symbol selector |
| `c` | jump to chain |
| `b` | jump to strategy builder |
| `g` | open greeks drawer |
| `i` | open IV surface modal |
| `Escape` | dismiss any open modal or drawer |

No vim-style `j`/`k` chain navigation — the chain is mouse-territory.

---

## §7. Motion

Subdued. Vol traders are not chasing ticks; needless animation reads as noisy and undermines the data-density hierarchy.

| Element | Animation | Duration | Easing |
|---|---|---|---|
| IVRankGauge needle | rotation tween | 360 ms | `decelerate` |
| PortfolioGreeksBar width | width tween | 220 ms | `standard` |
| OptionsChainGrid cell update | opacity flash | 80 ms | `linear` |
| PayoffDiagram re-render | crossfade | 150 ms | `standard` |
| RollSuggestionPanel appearance | slide-down + fade | 220 ms | `decelerate` |
| Modal open | scale 0.96→1 + fade | 180 ms | `decelerate` |

All animations respect `prefers-reduced-motion: reduce` and collapse to instant transitions.

---

## §8. Data shape

| Surface | Source | Cadence |
|---|---|---|
| OptionsChainGrid | `data.realtime.getOptionsChain(symbol, expiration)` | ≤1 Hz throttled |
| IVRankGauge | `reports/iv-surface/<symbol>/<latest>/rank.json` plus `data/iv/<symbol>/atm_iv.parquet` for sparkline | 5 s |
| IVTermStructureChart | `reports/iv-surface/<symbol>/<latest>/term.png`-equivalent JSON | 60 s |
| SkewChart | `reports/iv-surface/<symbol>/<latest>/skew.png`-equivalent JSON | 60 s |
| IVSurfaceHeatmap | `reports/iv-surface/<symbol>/<latest>/surface.parquet` | on-demand |
| PayoffDiagram | local BS via `py_vollib`, fed from StrategyBuilderForm legs | on edit |
| StrategyBuilderForm | local; emits `OrderRequest` to broker on submit | interactive |
| Open Positions | `broker.getPositions()` enriched with `data/greeks/state.json` | 30 s |
| PortfolioGreeksBar | `data/greeks/state.json` | 30 s |
| EarningsRiskBadge | yfinance earnings calendar (stop-gap) | daily refresh |
| RollSuggestionPanel | derived locally from Open Positions + chain | on position update |

Persistent state on disk follows the conventions in [`../../profiles/options/README.md`](../../profiles/options/README.md) §"Where the data lives". The dashboard never writes to these paths — it is a read view over data the skills produce.

---

## §9. Mobile / accessibility / performance

### Mobile

**Partial support.** The chain viewer is mobile-hostile: 18 columns × 30 rows do not fit on a phone screen and do not survive a useful zoom. Three surfaces work on mobile:

- IVRankGauge (full width, big number).
- PortfolioGreeksBar (4 stacked horizontal bars).
- Open Positions (card-view: one card per position with collapsible legs).

On `< 768px`:

- The chain is replaced with a **strike-search input** + a single-strike detail view (one strike's calls and puts side by side).
- StrategyBuilderForm becomes a multi-step wizard rather than a single form.
- IVTermStructureChart, SkewChart, IVSurfaceHeatmap collapse to a "View on desktop" placeholder with a thumbnail.

The honest framing: options trading is a desktop workflow. Mobile is for monitoring, not for placing iron condors.

### Accessibility

- All chain cells expose `aria-label="SPY 500 call, bid 2.40, ask 2.45, IV 18%, delta 0.42"`.
- All greeks bars expose `aria-valuetext="Net delta +0.32, $24,140 dollar delta, within band"`.
- IVSurfaceHeatmap has a `<details>` data-table fallback rendered to the DOM but `display: none` until requested via SR or `Tab` focus.
- IVRankGauge is `role="meter"` with `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow={rank}`, `aria-valuetext="IV rank 62, percentile 58"`.
- Color is never the sole signal — every band is annotated with text (the gauge has the digit, the greeks bar has the value, the chain has the IV column).
- Focus rings: `2px solid accent.300` with `outline-offset: 2px`, visible on all interactive elements.

### Performance budget

- JS bundle: **<200 KB gzipped** for the dashboard route. The IV surface 3D modal is a separate dynamic-import chunk (<300 KB).
- Chain re-render: throttled to **≤1 Hz**. The chain ticks faster than the eye can process; rendering every quote update wastes CPU and creates visual noise.
- Greeks bar polling: 30 s. State file is small (<10 KB); no streaming needed.
- IV surface render: re-runs only on parquet mtime change.
- Server-Sent Events for streamQuotes (chain only); falls back to polling at 1 Hz if SSE fails.
- Initial paint: <1.5 s on a cold load (LCP target).

---

## §10. Anti-patterns explicitly avoided

These are mistakes other options dashboards make. We do not make them here.

- **No green/red coloring on the IV rank gauge digit.** IV rank is not directional — "high rank" is not good or bad, it just means "sell premium." Coloring it like P&L (green = good) trains the user to interpret high vol as bullish, which is wrong.
- **No live tick flash on every chain quote update.** The chain ticks dozens of times per second on liquid names; flashing every update creates an epileptic-grade strobe. Coalesce to ≤1 Hz with a subtle 80 ms opacity flash only on bid/ask change.
- **No candlestick chart on the default layout.** Adding one tells the user the underlying price action is the primary signal; it is not. If they want chart context, the symbol-selector tooltip shows last + day Δ + day %, and they can switch to a different profile for the full chart.
- **No "win rate" label.** The probability-of-profit is "POP at expiration" — always. A POP-72% iron condor can be a loser for most of its life and finish profitable; calling that 72% a "win rate" is misleading.
- **No blended 0DTE vol.** The IV/Vol panel always excludes 0DTE from the term and surface views by default; if the user opts in (`--include-0dte`) it appears on a separate lane labeled "0DTE", never blended into the 7–30 bucket. Mirrors the skill's behavior.
- **No auto-execution of roll suggestions.** RollSuggestionPanel scaffolds, the user confirms. Auto-rolling is how income books quietly bleed.
- **No tier-gate bypass.** If the user is tier 2 and selects "iron condor," the builder refuses to scaffold; the badge goes red; the submit button is disabled. There is no "I know what I'm doing, scaffold anyway" override — Reg-T will reject at the broker anyway and the user just learns a more painful lesson.
- **No per-tick portfolio greeks update.** 30 s cadence; a vega number that flickers each tick is unreadable.

---

## §11. What this profile has that no other does

- **IV surface heatmap** (`IVSurfaceHeatmap`).
- **Payoff diagram** (`PayoffDiagram`).
- **Portfolio greeks bar** (`PortfolioGreeksBar`).
- **Broker-tier-gate badge** (inside `StrategyBuilderForm`).
- **Roll-suggestion panel** (`RollSuggestionPanel`).
- **Earnings-risk badge** (`EarningsRiskBadge`).
- **OI-tinted chain cells.**

The chain itself exists in other dashboards but is hero-sized here. Everything else is options-specific net-new.

---

## §12. Skill chains the UI surfaces

| User intent | Surface | Skill chain |
|---|---|---|
| "Is vol cheap or rich?" | IVRankGauge, IVTermStructureChart, SkewChart, IVSurfaceHeatmap | `/iv-surface rank|term|skew|surface` |
| "Pull strikes" | OptionsChainGrid | `/options-chain` |
| "Build me a put credit spread" | StrategyBuilderForm + PayoffDiagram | `/options-strategy-builder vertical-put-credit` |
| "Watch my greeks" | PortfolioGreeksBar (sticky) | `/greeks-monitor start --interval 30s` |
| "Forecast vol next week" | optional chip on IVRankGauge → modal | `/vol-forecast` |
| "Year-end tax sweep" | banner from Dec 1 → Dec 28 | `/tax-loss-harvest scan` then `plan` |
| "Pre-mortem this ticket" | Save Decision Card button in StrategyBuilderForm | `/decision-card` |
| "Journal this fill" | post-fill toast → action | `/journal log` (`trade-journal` skill) |
| "Monthly review" | first-of-month banner | `/mistake-miner` + `/quant-tearsheet` |

---

## §13. Follow-up gaps to fill

- **Earnings calendar adapter.** `EarningsRiskBadge` depends on one and no existing skill provides it. yfinance is the free stop-gap; FMP / Polygon / EarningsHub are paid options. Worth a `earnings-calendar` adapter or extending `DataAdapter` with `getEarningsDates(symbol)`.
- **Assignment-radar.** CLAUDE.md notes "The repo has no `assignment-radar` skill yet — manual check until it ships." The chain-tooltip's assignment-risk badge is the UI hook for that future skill; once it exists, the badge becomes data-driven instead of heuristic.
- **3D SVI surface viewer.** The 2D heatmap is canonical; a Three.js / plotly 3D modal is a follow-up.
- **Multi-leg combo support for Alpaca.** The strategy builder emits multi-leg `OrderRequest`s; Alpaca's options endpoint has leg limits and may need fallback to sequential single-leg submissions with `linkedTo` order IDs. Tradier and Tastytrade are first-class.
