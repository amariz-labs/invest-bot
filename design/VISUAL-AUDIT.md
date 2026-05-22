# Voltrex — Direct Visual Audit

Companion to [`DASHBOARD-BRIEF.md`](./DASHBOARD-BRIEF.md). The brief was assembled from 11 sub-agent research outputs that never saw the source image — they worked off a textual description. This file captures what was visible only by looking at the actual pixels of the Nixtio Dribbble screenshot.

## Why this matters

A Dribbble shot is a **sales asset for a design studio**, not a shipping product. Nixtio is selling visual fidelity. Separate the *aesthetic moves* (genuinely strong) from the *data layer* (placeholders nobody audited). If you copy the look without re-auditing the data layer, you'll inherit their typos.

---

## §1. Data integrity bugs in the screenshot

These are bugs in the design itself, not stylistic choices.

### 1.1 Non-monotonic x-axis

The chart's x-axis labels read, left to right:
`04.03.2025 · 07.03.2025 · 10.03.2025 · 13.03.2025 · 16.03.2025 · 19.03.2025 · 22.03.2025 · 25.03.2024 · 28.03.2025 · 8.09.2025 · 8.09.2022`

A `2024` label between two `2025` labels, plus a `2022` tail. Placeholder text the designer never audited. In production this would be a P1 ship-blocker — the y-axis is in hundreds of millions, so a garbled time axis renders the chart unreadable.

**CI test you should write:** assert ticks are strictly monotonic.

### 1.2 Y-axis label truncation

I read `330,500,00` (highlighted pill) and `100,00,00` near the bottom — both missing a digit / misplaced comma versus the other ticks (`750,000,000`, `600,000,000`). Either a font-rendering artifact or actual typos.

### 1.3 Invalid hex in the wallet chip

Top bar: `0xBwqw…1248`. The letter `w` is not a hex digit. The contract address at the bottom (`0x010461c14e146ac35fe42271b…`) **is** valid. So the designer is inconsistent — one address is realistic, the other decorative. Trader users notice this in <1 second.

### 1.4 Mixed locale on the same screen

- KPI strip: `$34.081.818`, `5.832.647,90` — **European** notation (period as thousand separator).
- Right panel All-time Earned: `$20,040.57` — **US** notation (comma as thousand separator).
- Chart y-axis (`750,000,000`): US.

This is a one-screen i18n bug. In finance, mixing two locales inside a single viewport reads as careless and undermines trust instantly. One `Intl.NumberFormat(locale)` instance threaded through every numeric prevents it.

### 1.5 "ETC" in the allocation strip

Faintly above the chart: `BTC: 45% · ETC: 30% · USDT: 20% · Other: 5%`. "ETC" is Ethereum Classic — almost certainly meant to be "ETH". A trader sees ETC in a Hyperliquid market-making vault and either thinks "weird mandate" or "designer typo."

### 1.6 Duplicate leader card name

Two of the three copy-trade leaders are named "Rainkw" — different avatars, different follower counts (199/200 vs 128/200), different stats. Placeholder bleed. In production this would trip dedupe logic.

### 1.7 Date-format clash inside the chart

Tooltip uses `Mar 15, 2025` (English long-month). X-axis uses `dd.mm.yyyy`. Two date conventions inside one chart card.

---

## §2. What the violet bloom is hiding

The bloom is the design's headline aesthetic feature. It's also functionally a fog — anything behind its peak luminance loses contrast.

Specific elements over the bloom that fail WCAG AA (4.5:1) for non-large text:
- Wallet chip `0xBwqw…1248` — white text on violet ~50% lightness = ~3.2:1.
- Faucet pill label.
- "Withdraw" tab label in gray.

**Why this matters:** the bloom is *load-bearing* aesthetically (it's what makes the dashboard look "designed") but it's destroying contrast where decisions get made. A production redesign either (a) clips the bloom to a mask that excludes the top-bar bounding box, or (b) places opaque chips behind every label that sits over the bloom. The KPI strip below has a fully opaque dark band — that's the discipline; the top bar lacks it.

---

## §3. Micro-craft worth stealing

The aesthetic execution *is* high — these are the moves to keep:

- **Yellow Y-axis pill** doubles as crosshair anchor. TradingView Lightweight Charts: `lastValueVisible: true` + `priceLineColor: '#F0B429'`. ~3 lines.
- **Dotted vertical drop-line** from hovered point to x-axis — hair-thin, subtle.
- **Tooltip arrow points DOWN to the marker.** Most designs put the tooltip below with an up-arrow. Above-with-down-arrow is better — the user's hand never occludes it on touch.
- **Favorited star is solid amber on card 1; outline on cards 2–3.** A state difference encoded in one variable change — proves the designer thought about real-world rendering instead of three identical decorative cards.
- **TradingView-style mini-toolbar on the chart's left edge** (crosshair / line / ruler / magnet / settings / dollar / star / eyedropper). Most Dribbble shots skip this — too much detail for a hero. Including it signals "we know what real trading UIs have."
- **Epoch progress bar uses the same amber as the chart line.** Single-accent discipline.
- **MAX button is violet, Deposit button is green.** Hierarchy via hue, not size. MAX is utility, Deposit is the commit action.

---

## §4. The narrative compression bug

Look at the vault description body copy:

> "This community-owned vault provides liquidity to Hyperliquid through multiple market making strategies, performs liquidations, and accrues platform fees. This vault uses the following vaults as component strategies:"

Then the contract address.

That last line *promises a list* ("uses the following vaults as component strategies:") and **delivers a contract address instead**. The colon expects an enumeration; the eye drops to find one; the eye finds a copyable hash. This is a narrative gap — a real product either drops the colon and just shows the contract, or shows a list of strategy names with their own addresses.

---

## §5. The 30D MDD blind spot

The most important *behavioral-finance* issue in the design.

**Card 2 ("Commander"):** ROI **+757.72%**, 30D MDD **39.24%**, Sharpe **2.72**.

Translation: this leader is up 7.5x but has dropped 39% in the **last month alone**, with a mediocre Sharpe. That's a near-blow-up. But the layout makes Commander look as attractive as the other two — same card, same green ROI font, same green Copy button. **No visual penalty for high drawdown.** A copy-trader scanning this row will weight "biggest green number wins" because no other signal screams "this is dangerous."

**Almost-free fix:** color the 30D MDD value itself when it exceeds a threshold (>15% amber, >25% red), and de-saturate the green ROI when Sharpe < 3 **OR** MDD > 20%. Costs nothing visually, protects users from a cognitive trap the layout currently invites.

---

## §6. Zoom out: the screenshot's own context

The image is a phone screenshot of Dribbble in mobile Safari/Chrome. Status bar `23:57`, battery 8%. Almost-midnight, low-battery design research — the texture of someone evaluating references late.

- The Dribbble preview is **truncated**. The copy-trade row is cropped at the bottom; whatever else exists on the canvas (order book? trade history? performance tab?) is not visible.
- "Get in touch" CTA tells you Nixtio is **selling design services**. The shot is calibrated to *win studio bids*, not to ship. That explains the data-layer sloppiness in one sentence: studios sell *look*, not correctness.

---

## §7. Items to append to the brief

Direct observations that supplement the agent-generated brief:

1. **Add a data-integrity CI check** to any clone — assert monotonic x-axis ticks, single locale for `Intl.NumberFormat`, hex validation on address chips, dedup-by-leader-id.
2. **Mask the bloom around the top bar** so wallet / faucet / language toggle sit on opaque chip backdrops.
3. **Encode drawdown severity into the leader card's color** rather than relying on the trader to read three small grey numbers under a giant green hero.
4. **Resolve the "uses the following vaults as component strategies:" trailing colon** — promises in copy must deliver.
5. **Fix the allocation strip** (`BTC / ETC / USDT / Other` → `ETC` is almost certainly `ETH`).
6. **Commit to one locale** and enforce it with one `Intl.NumberFormat` instance.
