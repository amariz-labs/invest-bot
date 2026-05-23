# Day-trading dashboard — UI specification

Profile: [`profiles/day-trading/`](../../profiles/day-trading/) · Persona: [`profiles/day-trading/CLAUDE.md`](../../profiles/day-trading/CLAUDE.md) · Routine: [`profiles/day-trading/PLAYBOOK.md`](../../profiles/day-trading/PLAYBOOK.md)

Companion files in this directory: [`README.md`](./README.md), [`code/`](./code/) (component stubs grow here as they leave spec).

This is the **densest, most demanding UX in the repo**. Read [`design/EQUITIES-DASHBOARD.md`](../EQUITIES-DASHBOARD.md) for the shared equities visual grammar — everything here is the day-trader-specific intensification of that brief.

---

## §0. Persona-bound UX premise

> Every pixel on this screen exists to compress **observe → orient → decide → act** into **< 3 seconds**. Chrome that adds even 200ms is a defect, not a feature.

The day-trader is **not** a portfolio manager. They are a pit trader with a keyboard. They look at price action for 6.5 hours a day, decide 20–100 times per session, and lose money to their own emotional state more than to any market regime. The dashboard's job, in priority order, is:

1. **Stop them trading when they shouldn't** (the discipline triad: `TiltGuardPill` + `PDTCounter` + `EodFlattenVerifier`).
2. **Show price truthfully** (HeroChart with crosshair, live tape, stale-feed indicator).
3. **Get an order in within one keystroke** (`OrderTicketPanel` + hotkeys).
4. **Show what's at risk right now** (`OpenPositionsTable` sticky bottom).
5. **Surface the next opportunity** (`Watchlist` with hotkey row nav).

Everything else — news tickers, social feeds, "what's trending" sidebars, broker chat — is **explicitly excluded** as dopamine-bait. See §16 (Anti-patterns).

Visual density: **HIGH**. Bloomberg-class. The dashboard targets traders who already use multi-monitor setups and read 12px tabular data without strain. Comfortable density is for the long-term profile. Here, every row gets one more bit of information than feels comfortable on first viewing — because by week two the trader's pattern-recognition will demand it.

Refresh budget: **144Hz friendly**. Animations cap at one paint per tick; DOM writes throttled to ≤1/s per row; the chart canvas owns its own rAF loop. No layout shifts during market hours.

---

## §1. Target hardware & viewport

| Tier | Width × height | Treatment |
|---|---|---|
| **Primary (desk)** | 2560×1440, 144Hz | Native target. Full 12-column grid, all panels visible. |
| **Secondary (laptop)** | 1440×900 | Fallback. KPI ribbon collapses to 3 tiles, Watchlist becomes a tab inside the Open Positions container, OrderTicket becomes a slide-over from the right edge (hotkey `o`). |
| **Mobile (≤ 768px)** | — | **Intentionally hostile.** Renders a blocking interstitial: *"Mobile is for journal entry, not order entry. Open `/journal` or come back to a desk."* The interstitial links to `/journal` (read-only) and to a QR code that reopens the dashboard via Tailscale on the user's desktop. |

Two-monitor users are first-class. The dashboard is designed so the left monitor can be the dashboard and the right monitor can be the broker-provided level-2 / time-and-sales window. The dashboard never relies on level-2 — that is the broker's surface — but it must not waste pixels duplicating it either.

---

## §2. Top-level layout (Tailwind grid, 2560×1440)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Row 1: Status strip                                  32px             │  ← always visible
├───────────────────────────────────────────────────────────────────────┤
│ Row 2: KPI ribbon                                    80px             │  ← always visible, live tweens
├──┬────────────────────────────────────┬───────────────────────────────┤
│  │                                    │                               │
│L │       HeroChart (col-span-8)       │   OrderTicketPanel            │
│e │       420px tall                   │   (col-span-4)                │
│f │                                    │   420px tall                  │
│t │                                    │                               │
│  ├────────────────────────────────────┴───────────────────────────────┤
│n │                                                                    │
│a │       Watchlist (col-span-12, full width)                          │
│v │       240px tall                                                   │
│  │                                                                    │
│  ├────────────────────────────────────────────────────────────────────┤
│  │                                                                    │
│  │       OpenPositionsTable (col-span-12, sticky bottom)              │
│  │       ~240px tall, scrolls internally above 8 rows                 │
└──┴────────────────────────────────────────────────────────────────────┘
```

- **Left rail (`LeftRail`)** — 64px icon-only nav: Dashboard / Journal / Plays / Reports / Settings. Tooltip on hover. Keyboard `g d`, `g j`, `g p`, `g r`, `g s` (vim-style `g`-prefix go-to).
- **Row 1 (`StatusStrip`)** — 32px, fixed top, `position: sticky; top: 0`. Components left-to-right: `BrokerChip`, `DataFeedPill`, `PDTCounter`, `KillSwitchIndicator`, **`TiltGuardPill` (most prominent, anchored to the right edge)**.
- **Row 2 (`KpiRibbon`)** — 80px, five tiles, see §3.
- **Main grid** — CSS Grid `grid-cols-12 gap-2 p-2`. HeroChart is `col-span-8`, OrderTicketPanel `col-span-4`. Watchlist and OpenPositionsTable each span the full 12 columns underneath.

Tailwind config tweaks (extends the root `tailwind.config.ts`):

```ts
// Density classes — day-trading-specific
extend: {
  spacing: { '4.5': '1.125rem' },          // half-step between 4 and 5
  fontSize: { '2xs': ['0.6875rem', '0.875rem'] },  // 11px for tabular data
  gridTemplateColumns: { 'dt-main': 'minmax(0, 8fr) minmax(360px, 4fr)' },
}
```

---

## §3. Row 1 — `StatusStrip` (32px)

A single horizontal band, dark surface, 32px tall, never animated except for dot-color transitions. The user must be able to scan it without breaking focus from the chart.

Components left-to-right:

### 3.1 `BrokerChip`
- Reads `broker.getAccount()` once on mount, polls every 30s.
- Shape: `[dot] alpaca · LIVE` or `[dot] alpaca · paper`.
- Dot color: **red** if `mode=live`, **green** if `mode=paper`. (Yes — red is "live money on the line", warns of risk; green is "safe to practice".)
- Click → drawer with account ID, equity, day-trade buying power, regulatory flags (PDT y/n, options tier).
- Disconnect state: text becomes `broker · OFFLINE`, dot pulses red 1Hz.

### 3.2 `DataFeedPill`
- Reads `data.realtime.subscribeStatus()` — the same channel `HeroChart` and `Watchlist` already use.
- States: `connected` (green dot, label hidden), `reconnecting` (amber dot + label), `stale` (red dot + label "STALE — last tick 23s ago"), `disconnected` (red dot + label "DISCONNECTED").
- On `stale` or `disconnected`, the entire dashboard dims the OrderTicketPanel's submit button and shows a banner: *"Data feed degraded. Resolve before placing live orders."*

### 3.3 `PDTCounter`
- Reads `broker.getAccount().daytradesUsedRollingFive` and `account.equity`.
- Shape: `PDT 2/3` (used / cap) when account < $25k, hidden otherwise.
- Color thresholds: **green** at 0–1 used, **amber** at 2 used (one trade remaining), **red** at 3 used (cap hit — next round-trip triggers 90-day freeze).
- Tooltip on hover: "Day-trades used in the rolling 5-trading-day window. The 4th in 5 days triggers a 90-day freeze."
- Click → drawer with the 5-day history of round trips with timestamps.

### 3.4 `KillSwitchIndicator`
- Mirror of the `KillSwitchButton` state (see §11). Shows armed (gray) vs fired (red, pulsing).
- Click on this indicator does **not** fire — it opens a read-only audit of the most recent fire event(s).

### 3.5 `TiltGuardPill` — **most prominent**
- Anchored to the right edge of the status strip. Larger than the other chips (28px tall vs 24px).
- Reads `data/state.yaml` (polled every 5s via `/api/state`, server-side cached for 1s).
- Three states determine color, dot animation, and label:
  - **GREEN** (`trade_today=true` AND `tilt_score < 0.3`): solid green dot, label "READY", no animation.
  - **AMBER** (`trade_today=true` AND `0.3 ≤ tilt_score < 0.7`): solid amber dot, label "CAUTION · 0.54", subtle 0.5Hz pulse.
  - **RED** (`trade_today=false` OR `tilt_score ≥ 0.7` OR `warmup_at > 4h old`): solid red dot, label "BLOCKED" (or "STALE" if checklist > 4h old), 1Hz pulse.
- `aria-live="assertive"` on the label — screen readers ALWAYS announce state changes. This is the one place we override the polite-only default; the discipline gate is too important to miss.
- Click → opens `TiltGuardDrawer` from the right edge, showing the score breakdown (trades-since-last-loss, size-delta, time-between-entries-delta, entry-note-sentiment), the contributing journal entries from the last 24h, and the override path.
- Override path inside the drawer requires (1) a text reason ≥ 80 chars, (2) a confirmation checkbox "I acknowledge this override is logged and reviewed at EOD". Override action POSTs to `/api/tilt-guard/override`, which writes `data/journal/overrides/<ts>.md`.

---

## §4. Row 2 — `KpiRibbon` (80px, 5 tiles)

Five tiles laid out as `grid-cols-5 gap-2`, each tile 80px tall, internal padding `p-3`, surface `bg-surface-elevated`.

| # | Tile | Source | Notes |
|---|---|---|---|
| 1 | **Account Equity** | `broker.getAccount().equity` polled 5s | Big number, USD compact (`$48.3K`). Sub-label = `Δ today` colored. |
| 2 | **Day P&L** | computed from `positions × last - basis` via live stream | Animated count-up tween on every tick (≤120ms ease-out). Sign-colored. `aria-live="polite"`, throttled to 1 announcement per 5s. |
| 3 | **Buying Power** | `broker.getAccount().cashBuyingPower` + `marginBuyingPower` | Two-row: cash BP / margin BP. Sub-label highlights `day-trade BP` when < cash BP. |
| 4 | **Open Risk** | sum over open positions of `abs(qty × (entry - stop))` | The total $ at risk if every stop fires. Crucial for sizing the next trade. Amber if > 3% of equity, red if > 5%. |
| 5 | **Win Rate (today)** | journal stats for today | `4 / 7 · 57%`. Pair with a small inline R-multiple readout (`+1.8R`). |

Animation: `AnimatedNumber` from `design/code/AnimatedNumber.tsx`, capped at 120ms ease-out per transition. On rapid tick streams, the tween is **interrupted** (not queued) — we always animate to the *latest* value, never replay history.

---

## §5. `HeroChart` (col-span-8, 420px)

Extends [`web/components/HeroChart.tsx`](../../web/components/HeroChart.tsx) — keep the existing OHLCV + volume + dynamic-import + connection-pill behavior. The day-trading version adds:

### 5.1 Timeframe tabs (top edge)
Pill group: `1m · 5m · 15m · 1h · 1D`. Default `5m` during RTH, `1D` outside. Hotkey `1`–`5` switches; current selection has `aria-pressed="true"`.

Each tab change re-fetches via `/api/udf/history?resolution=<tf>`. We do **not** keep a 1m series in memory and downsample on the client — Polygon's aggregated bars are cheaper to fetch and avoid the resample bug class.

### 5.2 Drawing-tools toolbar (left edge, 40px wide)
Vertical icon strip with: trendline, horizontal level, Fib retracement, rectangle, anchored VWAP, eraser, clear-all. Each tool keyboard-accessible (`t`, `h`, `f`, `r`, `v`, `e`, `shift+e`).

Drawings persist per-symbol in `localStorage` under `dt:drawings:<sym>`. They sync to `data/journal/drawings/<sym>.json` on EOD so post-trade review carries the user's marked levels.

### 5.3 Live crosshair (always on)
Magnet-mode crosshair (already in the existing component). Adds: right-side floating tooltip pinned to the cursor showing OHLCV, distance-from-last (`+0.34 / +0.21%`), and time-since-last-bar.

### 5.4 Last-trade pill (right axis)
The yellow pill on the right axis is already provided by Lightweight Charts via `lastValueVisible: true`. The day-trader version adds a **second pill**: the user's `avgEntry` for the symbol if they hold it, drawn in the position's side color (green for long, red for short). Lets the trader see profit/loss without taking eyes off the chart.

### 5.5 Pre/post-market shading
Subtle violet 4% wash from 04:00–09:30 ET, amber 4% wash 16:00–20:00 ET, no tint during RTH. Driven by `chart.timeScale().applyOptions({ visibleRange })` markers plus a custom price-line overlay.

### 5.6 Volume profile (overlay, toggleable)
`shift+v` toggles a fixed-range volume profile rendered as a custom series on the right edge. Off by default; on by default during `EOD review` mode.

---

## §6. `OrderTicketPanel` (col-span-4, 420px)

The execution surface. Mandatory keyboard parity: every field reachable by `tab`, every action by a single keystroke.

### 6.1 Layout
```
┌─ Order ticket — AAPL ─────────────────┐
│ [Market] [Limit] [Stop] [Bracket] [OCO]│   ← segmented, hotkey 'm/l/s/b/o'
├────────────────────────────────────────┤
│ Side:   ●BUY  ○SELL  ○SHORT             │   ← hotkey 'b/s/shift+s'
│ Entry:  [   210.34   ]   ←—  live mid   │
│ Stop:   [   208.10   ]   = 1.07% / 1R   │
│ Target: [   214.80   ]   = 2.12% / 2.0R │
│ Risk:   [ $250 ▾ ] = 112 shares          │   ← R-based sizing
│         alt: [qty] [gross$] [%equity]    │
├────────────────────────────────────────┤
│ ✓ tilt-guard READY                      │   ← pre-trade gate badge
│ ✓ PDT 2/3                                │
│ ✓ buying power $24.2K                    │
│ ✓ risk 1.04% ≤ 1.0% ceiling [WARN]      │   ← amber, but submit-allowed
│ ✓ shortable (if SHORT)                  │
├────────────────────────────────────────┤
│         [ PLACE ORDER (enter)  ]        │   ← hotkey ENTER (confirm modal)
│         [ Save as decision card ]       │   ← hotkey 'd' → /decision-card
└────────────────────────────────────────┘
```

### 6.2 Sizing modes
The default is **By Risk** — `qty = floor(risk_dollars / abs(entry - stop))`. This is the only mode that survives contact with the market without size creep. The other modes exist for completeness:

- **By Qty** — direct share count, derives risk.
- **By Gross $** — derives qty, derives risk.
- **By % Equity** — derives gross, derives qty, derives risk.

All four are always cross-derived in real time as `AnimatedNumber`s; changing one updates the others within 120ms.

### 6.3 Pre-trade gate badges
Each gate from [`PLAYBOOK.md`](../../profiles/day-trading/PLAYBOOK.md) D5.3 surfaces as a row in the gate stack:

| Gate | Pass condition | On fail |
|---|---|---|
| `tilt-guard` | `state.trade_today = true` AND `tilt_score < threshold` | Hard block, label "BLOCKED — open TiltGuardDrawer" |
| `PDT` | `daytradesUsedRollingFive < 3` OR `equity ≥ 25000` | Hard block, label "PDT — 0 remaining" |
| `buying power` | `cost ≤ accountBuyingPower` | Hard block, label "INSUFFICIENT BP — short by $X" |
| `risk ceiling` | `risk_pct ≤ MCP_RISK_CEILING_PCT` | Soft warn (amber), allow submit with confirm |
| `shortable` (if short) | `broker.isShortable(symbol)` | Hard block, label "HTB — borrow fee 12%" |
| `wash sale` (if closing for loss) | no replacement buy in 30d window | Soft warn, log on confirm |

Hard-block gates disable the submit button and color the badge red. Soft warns leave submit live but require a second `enter` to confirm.

### 6.4 Hotkey help overlay
`?` (shift+`/`) → modal listing every keybinding (see §10). Search box at top. ESC closes.

### 6.5 Confirmation modal (irreversible actions only)
For **live broker orders** (not paper), a 1.5s hold-to-confirm: press `enter` to submit, hold for 1.5s for the order to fire. Visual ring fills clockwise during the hold. Release before 1.5s → cancel.

Paper orders skip the hold but still show a 200ms "submitted" toast.

---

## §7. `Watchlist` (col-span-12, ~240px)

Extends [`web/components/Watchlist.tsx`](../../web/components/Watchlist.tsx). The existing component already has: column sort, sparkline, aria-live for moves, stale-row dimming, 1Hz DOM throttle. The day-trading version adds:

### 7.1 Hotkey row navigation (vim-style)
- `j` / `k` move focus down / up (already implemented).
- `enter` sets the focused row as the `HeroChart` symbol (already implemented as `onSymbolSelect`).
- **New:** `space` toggles the row into the OrderTicketPanel as the active symbol (without changing the chart). Lets the trader build an order on one name while watching another.
- **New:** `x` removes the focused row from the watchlist (with undo toast for 5s).
- **New:** `+` opens a quick-add input above the table.

### 7.2 Price-flash on tick
Each row's `Last` cell flashes on every quote update:
- Up tick: green fill at opacity 0 → 1 over 80ms, then back to 0 over 200ms (`ease-out`).
- Down tick: red fill, same envelope.
- Flat tick: no flash.

Implementation: a single CSS class with `@keyframes flash-up` / `flash-down`, applied via `data-flash="up|down"` attribute toggled by the quote handler. No JS-driven `style` writes per tick (would blow the INP budget).

### 7.3 Stale-row dimming
Already implemented — rows with no tick in `STALE_ROW_MS=15000` go to `opacity-50` on price cells. Keep.

### 7.4 Click-symbol-replaces-HeroChart
Already implemented via `onSymbolSelect`. Day-trading-specific addition: clicking also focuses the `OrderTicketPanel`'s entry field, so the trader can immediately type `b` (buy) and start a ticket without a mouse trip.

---

## §8. `OpenPositionsTable` (col-span-12, sticky bottom, ~240px)

The "what's at risk right now" surface. Sticky to the bottom of the viewport so it remains visible during scrolling. Internal scroll if > 8 rows.

### 8.1 Columns
| Col | Width | Notes |
|---|---|---|
| **Symbol** | 80px | Click → set as `HeroChart` symbol. |
| **Side** | 50px | `LONG` / `SHORT` chip, color-coded. |
| **Qty** | 70px | Tabular nums. |
| **Avg Entry** | 80px | From broker. |
| **Last** | 80px | Live from `streamQuotes`. Flashes on tick (same envelope as Watchlist). |
| **Unrealized $** | 90px | Sign-colored, `AnimatedNumber`. |
| **Unrealized R** | 70px | Computed from `(last - entry) / abs(entry - stop)`, sign-colored. The R-multiple is more important than the dollar number for day-trading. |
| **Stop** | 80px | Editable in place (`enter` to commit, `esc` to cancel). Edit POSTs to `broker.modifyOrder(stopId)`. |
| **Days Held** | 60px | Always `0` for day-trading. **A non-zero value renders red** — that is the cue the trader broke flat-by-close discipline. |
| **Close** | 40px | Button. Hotkey `c` while row focused. Confirmation: 0.5s hold for paper, 1.5s hold for live. |

### 8.2 Footer row
Aggregates: total `Unrealized $`, total `Unrealized R`, **Flatten All** button (hotkey `shift+f`, double-confirm). Flatten All also reads in §11's `KillSwitchButton` shape — same gating.

### 8.3 Color coding
Per-row background: subtle 4% green tint if `Unrealized $ > 0`, subtle 4% red tint if `< 0`. **Never a saturated fill** — the row would become unreadable.

The Days Held column is the only place where a red value triggers a visible attention-grab outside the normal P&L coloring. Discipline > P&L in this profile.

---

## §9. `HotkeyOverlay`

Triggered by `?`. Modal centered on viewport, dismissed by `esc` or click-outside.

```
┌─ Hotkeys ────────────────────────────────────────┐
│ Search: [____________________]                   │
├──────────────────────────────────────────────────┤
│ NAVIGATION                                       │
│   g d         Dashboard                          │
│   g j         Journal                            │
│   g p         Plays                              │
│   g r         Reports                            │
│   g s         Settings                           │
│   j / k       Watchlist / Positions row nav      │
│   1 – 5       Chart timeframe (1m/5m/15m/1h/1D)  │
│                                                  │
│ ORDER                                            │
│   b           Buy side                           │
│   s           Sell side                          │
│   shift+s     Short side                         │
│   m / l / s / b / o   Order type                 │
│   enter       Submit (1.5s hold if live)         │
│   d           Save as decision card              │
│                                                  │
│ POSITIONS                                        │
│   c           Close focused position             │
│   shift+f     Flatten ALL (double-confirm)       │
│                                                  │
│ EMERGENCY                                        │
│   shift+k     Kill switch (2s hold)              │
│                                                  │
│ CHART                                            │
│   t h f r v   Trendline / Horiz / Fib / Rect / VWAP │
│   shift+v     Volume profile toggle              │
│   e           Eraser                             │
│   shift+e     Clear all drawings                 │
│                                                  │
│ UI                                               │
│   ?           This overlay                       │
│   /           Focus search                       │
│   esc         Cancel / close                     │
└──────────────────────────────────────────────────┘
```

The overlay is **the source of truth** for what's bound. If a new feature ships without a hotkey row here, the spec hasn't been satisfied.

Implementation: a single `KeybindingRegistry` singleton (in `web/lib/hotkeys.ts`) — components register bindings on mount via `useHotkey(key, handler, scope)`. The overlay enumerates the registry. Scope handling (e.g. `j/k` only active in Watchlist) is the registry's responsibility, not each component's.

---

## §10. `KillSwitchButton`

Floating button, bottom-right of viewport, `position: fixed; bottom: 16px; right: 16px`. 48×48px, red ring, skull glyph (or "STOP" wordmark — A/B these). `z-index: 80` so it overlays everything except modals.

### 10.1 Fire sequence
1. **First click:** ring expands to a 96×96 "press and hold to fire" target, 0.5s timer countdown starts in the center.
2. **Hold 2s:** the ring fills clockwise. Release before 2s → cancel, ring shrinks.
3. **Complete:** dispatches `POST /api/kill-switch/fire`. Backend:
   - Cancels every open order via `broker.cancelAllOrders()`.
   - Closes every open position at market via `broker.placeOrder({ type: 'market', side: 'opposite', qty: position.qty })`.
   - Writes `data/journal/kill-switch/<ts>.md` with the full state snapshot.
   - Toggles `KillSwitchIndicator` to "fired" until manually re-armed.
4. **Re-arm:** requires explicit user action via `Settings → Re-arm kill switch` — never auto.

### 10.2 Why the friction?
A misfire kills real money. A miss when needed kills more. 2s + click-then-hold is the published [Bloomberg `<F12>`-equivalent](https://www.bloomberg.com/professional/) interaction model: discoverable, slow enough to be deliberate, fast enough for a panic-quit. Single-click would be too easy; multi-modal confirmation would be too slow.

### 10.3 Audit
Every fire writes to `data/journal/kill-switch/<ts>.md` with: trigger (manual / webhook / scheduled), positions closed, orders cancelled, P&L impact. Reviewed at EOD by `daily-routine eod`.

---

## §11. `EodFlattenVerifier`

A discipline-gap surface the rest of the dashboard does not have to enforce. Lives at the bottom of the viewport above `OpenPositionsTable` when active; hidden otherwise.

### 11.1 States by clock
- **Before 15:55 ET:** hidden.
- **15:55 – 16:00 ET:** amber banner — *"Flatten check in 5 minutes. Open positions: 2 (AAPL, NVDA)"*. Inline `[Flatten All]` button.
- **16:00 ET sharp:** if any positions remain, banner turns **red** and pulses 1Hz — *"You are carrying 2 positions overnight. Was this intentional?"*. Two buttons: `[Flatten Now]` and `[Document Exception]`.
- **16:00:00 – 16:30:00 ET, positions still open:** red banner persists, P&L tile in Row 2 starts showing `+ overnight gap risk` as a sub-label.

### 11.2 The `[Document Exception]` flow
Opens a modal forcing the user to write a paragraph in `data/journal/YYYY-MM-DD/overnight-<symbol>.md` explaining why the position is held overnight. Without this, the user cannot dismiss the banner. The friction is intentional: from [`PLAYBOOK.md`](../../profiles/day-trading/PLAYBOOK.md) D7, "If you intentionally hold something overnight, write the reason so future-you can audit the call."

### 11.3 The Mistake-Miner hook
Unintentional carries (red banner dismissed without `[Document Exception]`) write a `mistake.kind: "unintended_overnight"` entry to `data/journal/YYYY-MM-DD/<sym>.md`. The monthly `mistake-miner` skill clusters these. If the trader carries unintentionally three months in a row, the mistake-miner output will surface this as a top-5 leak.

### 11.4 Extension target — sub-agent loop
*(See README — this is the single component most worth a sub-agent loop.)* The verifier could also:
- Dispatch a push notification (`web-push` API) at 16:00 if positions linger.
- Apply a `+0.15` penalty to next-day `tilt_score` automatically.
- Block the next morning's `pre-trade-checklist` until the exception is documented.

---

## §12. Type & color

Inherit the violet/amber accent palette from [`design/code/tokens.ts`](../code/tokens.ts) and [`design/code/tokens.css`](../code/tokens.css). Day-trading-specific overrides:

- **Violet bloom** is permitted **only on the HeroChart background gradient and the LeftRail active indicator**. Never on the OpenPositionsTable, Watchlist, or any P&L cell — those need pure green/red signal with no decorative interference.
- **Full red/green P&L coding everywhere.** No softening to amber/teal. The dashboard is intraday — color *is* information, not decoration. Color-blind users get a parallel sign glyph (`+ / −`) and the `aria-live` announcement carries the direction word ("up", "down").
- **Tabular nums everywhere.** `font-variant-numeric: tabular-nums` on every numeric cell. Misaligned digits are a UX bug at this density.

Type scale:
- Default body: 13px / 1.4 (one notch denser than the equities profile's 14px default).
- Tabular data (KPI ribbon, Watchlist, OpenPositions): 12px / 1.3 with tabular-nums.
- KPI tile big numbers: 24px / 1.0, semibold.
- Status strip labels: 11px / 1.2 uppercase tracking-wide.

---

## §13. Interaction surface

**Hotkey-first, mouse-second.** Every action must be reachable in **≤ 1 keystroke** from the dashboard's idle state, with two exceptions:

1. **Irreversible live orders** require `enter` + 1.5s hold.
2. **Kill switch** requires `shift+k` + 2s hold OR mouse-click + 2s hold.

Mouse parity is provided for accessibility and for new users — every hotkey-driven action also has a clickable equivalent within 2 mouse-targets of the relevant region. But the canonical interaction is the keyboard.

Focus management:
- Default focus on mount lands on the Watchlist (so `j/k` works immediately).
- After a chart symbol change (click or `enter`), focus returns to the Watchlist row.
- After an order submit, focus returns to the OrderTicketPanel's `qty` field so the trader can re-size and re-submit.
- `esc` always returns focus to the Watchlist (the "home" of the dashboard).

---

## §14. Motion

Motion budget is strict — every animation is justified by either signal (tick / state change) or cognitive offload (count-up so the brain registers the new value).

| Surface | Animation | Duration | Easing |
|---|---|---|---|
| KPI count-up on tick | numeric tween | ≤ 120ms | `ease-out` |
| Watchlist row price flash | opacity 0→1→0 | 80ms → 200ms | `ease-out` |
| Status pill state transition | color + label fade | 360ms | `ease-out` |
| Chart crosshair | none (native) | — | — |
| TiltGuardPill pulse (amber/red) | opacity 0.6 ↔ 1.0 | 1s / 2s respectively | `linear` (so the cadence is metronomic and readable as "this is fine" vs "this is not") |
| KillSwitch ring fill | conic-gradient sweep | 2000ms | `linear` |
| Modal open | scale 0.96 → 1, opacity 0 → 1 | 180ms | `ease-out` |

Motion respects `prefers-reduced-motion`:
- All non-essential animations (modal scale, status fades) become instant.
- The KillSwitch hold ring still animates (you can't safely shorten a safety mechanism).
- Price flashes become a brief 200ms background color hold (no fade).
- TiltGuardPill pulse becomes a static label — the screen-reader announcement still fires.

---

## §15. Data shape

The dashboard is **live by default** — no manual refresh, no polling-only fallback during market hours.

| Source | Channel | Refresh | Cache TTL |
|---|---|---|---|
| `broker.getAccount()` | REST | 30s poll | 10s |
| `broker.getPositions()` | REST → WS preferred | WS push, REST 30s fallback | 0 (always trust WS) |
| `broker.streamOrders()` | WS | push | 0 |
| `data.realtime.streamQuotes()` | WS | push (every tick) | 0 |
| `data.realtime.subscribeStatus()` | callback | push on state change | 0 |
| `data/state.yaml` | server-side file | 5s poll → SWR | 1s |
| `/api/udf/history` | REST | on tab/timeframe change | 60s |
| `data/journal/expectancy.json` | REST | 60s poll | 30s |

The `data/state.yaml` poll is the discipline-critical one. Pulled via `/api/state` which reads the file server-side (the client never sees the raw YAML). If the file is missing or > 4h stale, the API returns `{ ok: false, reason: "stale" }` and the `TiltGuardPill` flips to RED. The OrderTicketPanel's gate stack then hard-blocks every order.

---

## §16. Mobile

Explicitly **not** mobile-friendly. Rendering on a viewport ≤ 768px shows a blocking interstitial:

```
┌────────────────────────────────────────┐
│                                        │
│   This dashboard is for desk use.      │
│                                        │
│   Mobile is for journal entry, not     │
│   order entry. Trading from a phone    │
│   is on the cognitive-bias cheat sheet │
│   under "convenience overrides         │
│   discipline."                         │
│                                        │
│   [ Open Journal (read-only) ]         │
│                                        │
│   Resume the dashboard from your desk: │
│                                        │
│   ████████████  (Tailscale QR to       │
│   ████████████   http://homedesk:3000) │
│                                        │
└────────────────────────────────────────┘
```

This is **the same warning** [`profiles/day-trading/README.md`](../../profiles/day-trading/README.md) gives. The dashboard refuses to render rather than render a worse version. Some trading desks ship a "mobile-lite" — we deliberately don't.

The `/journal` route renders normally on mobile (read-only). The `/decision-card` route renders normally too (writing thesis text from a phone is fine; placing orders from a phone is not).

---

## §17. Accessibility

Discipline-critical surfaces have stronger a11y guarantees than the rest of the dashboard.

| Surface | a11y treatment |
|---|---|
| `TiltGuardPill` | `aria-live="assertive"`, `role="status"`, label includes verbal state ("BLOCKED — tilt-guard hold"). Screen readers always announce transitions. |
| `KillSwitchButton` | `aria-label="Kill switch — flatten all positions and cancel all orders. Hold for 2 seconds to fire."`. Focusable via `tab`, fireable via `space`-hold. |
| `EodFlattenVerifier` | `aria-live="assertive"` on the banner; `role="alert"` at 16:00. |
| `OrderTicketPanel` gate badges | Each badge is `role="status"`, the gate names are read in order before the submit button is focusable. |
| KPI Day P&L tile | `aria-live="polite"`, throttled to one announcement per 5s. |
| Watchlist Day % cells | `aria-live="polite"`, throttled to ≥0.25% delta (already implemented). |
| Color information | Every color-encoded cell has a parallel sign glyph (`+` / `−` / `▲` / `▼`). |
| Focus rings | Visible at all times when keyboard-navigated; suppressed only for mouse focus. |
| High-contrast mode | `@media (prefers-contrast: more)` doubles every border, swaps tints for solids. Specifically tested: TiltGuardPill colors remain distinguishable. |
| Reduced motion | See §14. |
| Hotkey overlay | Lists every binding, sufficient for a screen-reader-only user to operate the entire dashboard without sight. |

**Critical:** the `TiltGuardPill` and `EodFlattenVerifier` are the only surfaces in the entire repo that use `aria-live="assertive"`. They earn it — a screen-reader user MUST hear when the discipline gate fires.

---

## §18. Performance budget

Stricter than the shared brief because execution latency is the product.

| Metric | Budget | Notes |
|---|---|---|
| **First-load JS (gz)** | < 250 KB | Lightweight Charts via dynamic import (~80 KB gz, lazy). |
| **LCP** | < 1.5s | Measured on a desk-class machine (M1 / Ryzen 7) over a wired connection. |
| **INP** | < 100ms | Stricter than the shared 200ms — typing in the OrderTicketPanel must feel mechanical. |
| **CLS** | 0 | No layout shifts during market hours. KPI tile widths frozen via fixed `min-w-*`. |
| **Tick latency (WS → DOM paint)** | < 60ms p95 | Measured via `performance.measure('quote-to-paint')` around the rAF flush. |
| **Memory ceiling** | < 500 MB after 6.5h session | Spark history trimmed to 30 closes per row; bar history trimmed on timeframe change. |

The chart canvas owns its own rAF loop (Lightweight Charts internal). The Watchlist already throttles to 1Hz via `scheduleFlush` + 1000ms gate. The OpenPositionsTable uses the same `scheduleFlush` pattern (factored into `web/lib/throttle.ts`).

---

## §19. What this profile has that no other does

The **discipline triad** — these three components do not appear in `long-term/`, `swing/`, `options/`, or any other profile. They are the day-trading dashboard's reason to exist:

1. **`TiltGuardPill`** — the only `aria-live="assertive"` surface in the repo. Reads `data/state.yaml`. Renders the score breakdown on click.
2. **`PDTCounter`** — surfaces the pattern-day-trader rule the rest of the repo gets to ignore.
3. **`EodFlattenVerifier`** — enforces flat-by-close, the discipline the playbook makes mandatory.

Plus:

4. **`KillSwitchButton`** — only profile that ships one. Other profiles have multi-day exits; we need a panic exit.
5. **`HotkeyOverlay`** — only profile where every action is hotkey-bound. Long-term doesn't need it (multi-day decisions don't reward speed).

---

## §20. Skill chains the UI surfaces

The UI is a thin client over the [`../.claude/skills/`](../../.claude/skills/) library. Each surface ties back to a skill the LLM persona will offer:

| UI trigger | Skill | When |
|---|---|---|
| `TiltGuardPill` RED on mount | `/pre-trade-checklist run` | 08:30 ET (D2 in playbook) |
| Status strip "morning brief" link | `/session-warmup brief` | 05:30 ET (D1) |
| OrderTicketPanel `d` hotkey | `/decision-card new --order-id <draft>` | per order, before submit |
| `OpenPositionsTable` row close → toast | `/trade-journal log --order-id <id>` | per close, within 60s |
| `EodFlattenVerifier` post-16:00 dismiss | `/daily-routine eod` | 16:05 ET (D8) |
| Settings → "Monthly review" | `/mistake-miner --window 30d` | first Saturday (M1) |
| Settings → "TradingView webhook" | `/alert-webhook init` | one-time setup |
| HeroChart drawing → "Add indicator" | `/ta-indicators` (output rendered on chart) | ad-hoc |
| Watchlist `+` quick-add → "Scan more" | `/equities-screener` (results populate Watchlist) | pre-market (D3) |

Each skill output writes to its conventional `data/` location; the UI re-reads on next poll. No skill output flows directly into the UI without going through `data/` (so it remains scriptable / debuggable).

---

## §21. Anti-patterns — explicitly avoided

These are common in day-trading dashboards. We deliberately do not ship them.

| Anti-pattern | Why we don't |
|---|---|
| **Live news ticker scrolling at the top** | Dopamine bait. The trader's plan is set pre-market; mid-day headline reactions are the leak `mistake-miner` is built to catch. If the trader needs news, they have a separate Bloomberg / TV / X tab. |
| **Copy-trade leaders sidebar** | This is a personal book. Imitating leaders is the opposite of running a documented playbook. |
| **Toast notifications for routine order acks** | Visual noise. Acks land in the `OpenPositionsTable` and the `mcp-log/`. Toasts are reserved for: kill-switch fired, tilt-guard blocked, broker disconnect, EOD flatten breach. |
| **Achievement / gamification badges** | Reinforces the wrong loop. Win-rate is a stat, not a trophy. |
| **"Recommended trades" / "AI picks"** | The LLM persona's job is to *gate* trade ideas, not generate them. The day-trader generates ideas from price action; the dashboard reflects them. |
| **Settings buried 3 menus deep** | If a toggle exists, surface it. The dashboard has < 30 settings; they fit on one Settings page. |
| **Auto-saving the OrderTicket draft to a server** | A draft order in flight to the broker is a real order. We do not save draft state across reloads. If the user wants persistence, that's a decision card. |
| **A "demo mode" toast that nags** | Paper mode is signaled by the green dot on `BrokerChip`. That's sufficient. |

---

## §22. Open questions for the next iteration

1. **TradingView Charting Library embed.** The current `HeroChart` is Lightweight Charts. The TV CL would give us drawing-tool parity with the trader's existing muscle memory. Cost: license + private repo invite + ~2 MB bundle. Defer until a user explicitly asks.
2. **Multi-chart layout.** 2×2 chart grid for traders running 4 names simultaneously. Spec'd but not built — would replace the `HeroChart` slot with a `ChartGrid` when a layout toggle is flipped.
3. **Order routing visibility.** Currently we show the broker's chosen route post-fill via the `OpenPositionsTable`. Some traders want pre-route preview (NYSE / NASDAQ / dark pool). Defer until requested.
4. **Voice alerts.** "Tilt-guard fired" via `speechSynthesis.speak()` when the user is looking at another monitor. Add behind a Settings toggle, off by default.
5. **The `EodFlattenVerifier` sub-agent loop.** See §11.4 — most worthwhile extension target for an autonomous sub-agent.

---

## Cross-references

- Persona: [`profiles/day-trading/CLAUDE.md`](../../profiles/day-trading/CLAUDE.md)
- Routine: [`profiles/day-trading/PLAYBOOK.md`](../../profiles/day-trading/PLAYBOOK.md)
- Shared visual grammar: [`design/EQUITIES-DASHBOARD.md`](../EQUITIES-DASHBOARD.md), [`design/DASHBOARD-BRIEF.md`](../DASHBOARD-BRIEF.md)
- TradingView embed (if upgraded): [`design/TRADINGVIEW-INTEGRATION.md`](../TRADINGVIEW-INTEGRATION.md)
- Tokens: [`design/code/tokens.ts`](../code/tokens.ts), [`design/code/tokens.css`](../code/tokens.css)
- Reference components: [`web/components/HeroChart.tsx`](../../web/components/HeroChart.tsx), [`web/components/Watchlist.tsx`](../../web/components/Watchlist.tsx)
- Discipline gate hook: [`.claude/skills/tilt-guard/SKILL.md`](../../.claude/skills/tilt-guard/SKILL.md)
- Skill library: [`.claude/skills/README.md`](../../.claude/skills/README.md)
