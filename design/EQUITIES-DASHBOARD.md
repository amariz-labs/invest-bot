# Equities / ETF / Index Dashboard — Adaptation Brief

Companion to [`DASHBOARD-BRIEF.md`](./DASHBOARD-BRIEF.md). The visual grammar (tokens, type scale, chart aesthetics, motion, IA, a11y) carries over wholesale — the *features and data* change. This file is the diff: what to keep, what to swap, what to add when the user is trading stocks / ETFs / indices on a daily timeframe rather than a crypto vault.

## TL;DR

| Layer | Crypto version | Equities/ETF version |
|---|---|---|
| **Visual** | Violet bloom + amber chart | **Identical** — keep the design system |
| **Hero data** | Vault NAV chart | Multi-symbol portfolio NAV + benchmark overlay (SPY, QQQ, IWM) |
| **KPI strip** | TVL / Price / Collateral / Supply / APY | Account equity / Day P&L / Realized P&L (YTD) / Open positions / Buying power |
| **Right panel** | Deposit + lock + boost | Order ticket (market / limit / stop / OCO / OTO / bracket) + position sizer |
| **Identity** | Wallet address + ENS | Broker connection chip (IBKR / Alpaca / Tradier / Schwab / Tastytrade) + account ID |
| **Discovery** | Copy-trade leader cards | Watchlist + screener results + sector/factor ETF tiles |
| **Calendar** | Epoch countdown | Earnings + ex-div + economic releases (FOMC, CPI, NFP) + futures roll dates |
| **Risk display** | TVL / collateral ratio | Margin used / day trades remaining (PDT) / buying power / overnight margin |
| **Compliance** | Network selector + wrong-network gate | Account-type gate (cash vs margin vs PDT), wash-sale tracking, options approval tier |
| **Hours** | 24/7 | RTH / pre-market / after-hours / holiday calendar with regime tinting |

The brief below replaces sections that change. Anything unmentioned, keep from the parent brief.

---

## §1. KPI Strip (replaces parent §4 KPI tiles)

Five tiles, equity trader's cockpit:

| Tile | Source | Notes |
|---|---|---|
| **Account Equity** | broker REST | Big number, USD compact. Delta = day change. |
| **Day P&L** | live tick from positions × last | `aria-live="polite"`, throttled. Color encoding by sign. |
| **Realized P&L · YTD** | broker activity | Pair with a 1y sparkline. Wash-sale flag glyph if any blocked losses. |
| **Open Positions / Slots** | broker positions | `7 / 25` style — surfaces concentration. |
| **Buying Power** | broker REST | Two-row: cash BP / margin BP if applicable. PDT countdown ribbon when relevant. |

PDT (Pattern Day Trader) rule cue: a thin amber strip under the tile when account < $25k AND day-trades-this-week > 2, counting down "1 day trade remaining."

## §2. Hero Chart — TradingView-class features

Targets to match (in feasibility-descending order):

1. **Multi-timeframe candlestick chart** with crosshair, range selector, drag-to-zoom — use Lightweight Charts (`addSeries(CandlestickSeries, ...)`) for the base.
2. **Overlays:** SMA/EMA, Bollinger, VWAP, Volume Profile, anchored VWAP from a click. Implementable with Lightweight Charts' built-in line series + `addCustomSeries` for VP.
3. **Drawing tools:** trendlines, horizontal levels, Fib retracements, rectangles. Use the **Trading Terminal** addon to Lightweight Charts if you can license it; otherwise implement via SVG overlay on a separate `<canvas>` plane that respects the chart's time-to-pixel transform (exposed via `chart.timeScale().timeToCoordinate()`).
4. **Replay mode:** scrubber that lets a trader review the day. Implement by keeping the full tick history in memory and re-feeding it to a hidden series.
5. **Pre/post-market shading:** colored x-axis bands. Lightweight Charts: `series.setMarkers()` or a custom price-line per session boundary.
6. **Sessions / holiday calendar:** suppress weekends/holidays on the time scale. Lightweight Charts: `timeScale({ rightOffset: 0, secondsVisible: false })` plus pre-built market-hours filter.
7. **Compare overlay:** add SPY / sector ETF as a faded second series. Use `addSeries(LineSeries, { color: '#A78BFA40', priceScaleId: 'compare' })` on a second invisible scale, normalized to start at 100.

When the user wants something Lightweight Charts can't do (heatmaps, depth visualization, multi-pane with shared crosshair across 6+ charts), **embed the TradingView Charting Library proper** (see [`TRADINGVIEW-INTEGRATION.md`](./TRADINGVIEW-INTEGRATION.md)).

## §3. Order Ticket Panel (replaces parent §7 deposit panel)

Order types to support, in this order of priority:

1. **Market** — single button, instant. Show estimated fill via NBBO mid + slippage warning.
2. **Limit** — price + qty.
3. **Stop / Stop-Limit** — trigger + (optional) limit.
4. **Bracket** — entry + take-profit + stop-loss in one ticket. The killer feature for daily traders.
5. **OCO / OTO** — One-Cancels-Other / One-Triggers-Other, exposed as a checkbox on a stop or limit.
6. **Trailing Stop** — % or $.

### Position sizer (above the order type tabs)

Three input modes, one output:

- **By risk** — `risk_dollars` + `entry` + `stop` → `qty = risk_dollars / abs(entry - stop)` (R-based sizing, the daily-trader default).
- **By dollars** — `gross_dollars` → `qty = gross_dollars / entry`.
- **By percent of account** — `pct` → `qty = (account_equity * pct) / entry`.

R-based sizing is the right default. The output `qty` is editable but updates derived `gross_dollars` and `risk_pct` on the fly via `AnimatedNumber`.

### Pre-trade checks (block submit if any fail)

- Day-trade slot available (if PDT).
- Buying power sufficient.
- Risk per trade ≤ user's configured ceiling (default 1% of equity).
- Symbol is shortable (if short order).
- Options trader level ≥ required tier (if options order).
- `tilt-guard` state allows the trade ([`.claude/skills/tilt-guard/SKILL.md`](../.claude/skills/tilt-guard/SKILL.md) hook reads `data/state.yaml`).

### Confirmation modal

Pre-flight: route preview, est. fill, est. commission, est. SEC/TAF/ORF fees (US equities), wash-sale impact if closing for a loss.

## §4. Watchlist + Screener (replaces parent §6 copy-trade cards)

Bottom row of the dashboard becomes **two stacked sections**:

### 4.1 Watchlist (left, 8 cols)

A dense table — TradingView's "Watchlist" panel is the reference. Required columns:

| Col | Width | Notes |
|---|---|---|
| Symbol | 80px | Click → set as hero chart symbol |
| Last | 80px | `num` tabular |
| Day Δ | 90px | colored, signed, with arrow glyph |
| Day % | 70px | colored, signed |
| Volume | 90px | compact (1.2M / 340K) |
| Rel. Vol | 70px | (vs 20-day avg) — heat-tinted when > 2× |
| Spark · 1D | 100px | green/red sparkline |
| Earnings | 60px | calendar glyph if < 7 days |
| Float | 80px | optional, scalper-relevant |
| Beta | 60px | optional |

Sortable, draggable rows, multi-select for batch actions, keyboard `j`/`k` for navigation (vim-style — Bloomberg-trained traders love it).

### 4.2 Screener (right, 4 cols)

Saved-filter chips at top: "Earnings beat + gap up", "52w high + RVOL>2", "ETF down >2%", "VIX >20". Click a chip → populates a filter form that POSTs to the screener endpoint (Polygon screener, IEX, or self-hosted on your own DB).

Filter primitives that should ship:
- Market cap, sector, industry
- Price range
- ADV (avg daily volume), today's volume / ADV
- Day's range, gap %
- Distance from 52w high / low
- Days since earnings, days to next earnings
- Float, short interest, days-to-cover
- ATR % (for sizing), beta
- Optionable, marginable, ETF flag

## §5. Calendar (replaces parent §3 epoch row)

Compact strip above the chart with three lanes:

- **Earnings (this week):** symbol chips colored by user's watchlist intersection.
- **Economic releases (today / tomorrow):** FOMC / CPI / PPI / NFP / Jobless Claims, with consensus + actual when out.
- **Sector ETFs:** XLK / XLF / XLE / XLI / XLY etc. as live-color chips.

Hover any chip → tooltip with detail. Click → opens a side drawer with deeper context.

Macro data via FRED ([`mortada/fredapi`](https://github.com/mortada/fredapi)) and earnings via [`dgunning/edgartools`](https://github.com/dgunning/edgartools) + Yahoo earnings calendar fallback.

## §6. Sessions & Hours

A small toggle group in the chart header: **Pre · RTH · Post · Ext**.

Time-axis tinting:
- Pre-market (04:00–09:30 ET): subtle violet 4% wash.
- RTH (09:30–16:00 ET): no tint.
- After-hours (16:00–20:00 ET): subtle amber 4% wash.

This makes regime context unmissable without text labels.

## §7. Compliance Layer

Equities trading carries regulatory baggage crypto vaults don't. Required UI:

- **PDT counter** — for accounts < $25k. Show "X day trades remaining this week (5-day rolling)" inline near the order ticket.
- **Wash-sale tracker** — when closing for a loss, banner: "Closing AAPL for a $312 loss. Buying again within 30 days will disallow this loss for tax." Provide an "I understand" checkbox that logs the override.
- **Options approval tier** — gate the order ticket's options tabs by user's broker tier (Level 1–4 in the US system).
- **Short-availability check** — disable short button if symbol is hard-to-borrow; surface the fee if borrowable.
- **Trade-confirmation receipts** — every fill writes to `data/trades/YYYY-MM-DD/<order_id>.json` for tax-loss harvesting and audit. Format compatible with [TradeNote](https://github.com/Eleven-Trading/TradeNote) and TradesViz CSV import.

## §8. Mobile / Tablet adaptation

Differs from the crypto adaptation because **active equity traders need the order ticket more than the chart on mobile**. Reflow:

- **Mobile (< 480px):**
  - Top: account equity + day P&L (2-tile compact strip).
  - Middle: order ticket (collapsible "advanced" drawer for bracket/OCO).
  - Below: chart (height limited, scrollable).
  - Watchlist → bottom-sheet trigger.
- **Tablet (768–1024px):**
  - 2-column: chart top, order ticket below.
  - Watchlist as right drawer toggle.

Bottom sheet for the order ticket isn't enough on mobile — when entering an active position, the trader wants the ticket *visible* and the chart *secondary*. Invert the desktop hierarchy.

## §9. What stays from the parent brief

Everything not touched above:

- The color tokens in [`code/tokens.ts`](./code/tokens.ts) and [`code/tokens.css`](./code/tokens.css) — violet + amber + green/red still work; consider an alternate "Bloomberg" theme with cyan + magenta as a future addition.
- The typography scale.
- The chart styling conventions and `HeroChart.tsx` (just configure as candles, not lines).
- The motion tokens and `AnimatedNumber.tsx`.
- The form-input rigor (`type="text" + inputmode="decimal"`, Radix Slider, Intl.NumberFormat).
- The a11y + perf + i18n checklist — all 24 items still apply.

## §10. Open next-iteration items (flagged by agents)

- **Feed-staleness signal.** Neither `HeroChart` nor `Watchlist` currently distinguishes "market flat" from "WebSocket dead." Required: (1) `status` channel on `DataAdapter` (`connected | reconnecting | stale`), (2) per-row `quote.timestamp` with dim-when-stale CSS, (3) on reconnect re-fetch latest daily bar so `prevClose`/`dayΔ` correct themselves.
- **OI / Sensibull-class options viewer.** Out of scope to build in `web/` — cite [FinceptTerminal](https://github.com/Fincept-Corporation/FinceptTerminal)'s `MultiStrikeOIChart` as the power-user reference. Our `options-chain` skill stays a thin data-fetch.
- **MCP server wrapping our skills.** Clean-room clone of FinceptTerminal's FastMCP pattern; lets external agents call our skills as MCP tools.
- **Data-hub topic naming.** Adopt the `option:chain:<sym>` / `prediction:<source>:price:<sym>` convention from FinceptTerminal's `DATAHUB_TOPICS.md` so multiple skills can subscribe to one normalized stream instead of each polling.

## §11. Skills to build for this version

In [`../.claude/skills/`](../.claude/skills):
- `equities-screener` — runs Finviz-style filters via Polygon / IEX / FMP / yfinance.
- `etf-analyzer` — expense ratio, holdings overlap, sector exposure, factor tilt.
- `daily-routine` — pre-market scan → game plan → end-of-day review wire-up.
- `tradingview-embed` — generates the TV Charting Library embed snippet with a UDF datafeed pointed at the user's data source.
- `alert-webhook` — sets up a webhook receiver for TradingView alerts → broker order.
- `broker-connect` — abstract broker adapter; concrete implementations for Alpaca, IBKR, Tradier, Tastytrade, Schwab.

See [`PLATFORM-INTEGRATIONS.md`](./PLATFORM-INTEGRATIONS.md) for the integration matrix.
