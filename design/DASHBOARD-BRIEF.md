# Voltrex-Style Trading Dashboard — Design Brief

Synthesized from an 11-agent research sweep of the Nixtio "Voltrex" Dribbble shot (May 2026). Each section condenses one agent's findings into a build-ready specification. Cross-reference the per-pixel observations in [`VISUAL-AUDIT.md`](./VISUAL-AUDIT.md).

---

## §1. Color System (dark-first)

### Tokens

```ts
// see code/tokens.ts for the full export
{
  bg: "#0B0B12",                   // app canvas
  surface: "#12121A",              // cards
  surfaceElevated: "#18181F",      // popovers, modals
  borderSubtle: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",
  contentPrimary: "rgba(255,255,255,0.96)",
  contentSecondary: "rgba(255,255,255,0.72)",
  contentTertiary: "rgba(255,255,255,0.65)",   // ⚠ raised from 0.55 for AAA
  accent: { 300: "#8B5CF6", 500: "#6D28D9" },  // violet
  success: "#22C55E",   // CTAs, positive PnL
  danger:  "#EF4444",   // negative PnL
  warning: "#F0B429",   // chart line, epoch progress
  focusRing: "#A78BFA"  // dual-ring with 2px white inner
}
```

### The violet bloom

Three-layer CSS technique:

```css
.bloom {
  position: absolute; inset: -20% -10% auto auto;
  width: 70vw; aspect-ratio: 1;
  background: radial-gradient(closest-side,
      hsl(258 90% 66% / 0.55) 0%,
      hsl(263 70% 50% / 0.35) 35%,
      hsl(240 22% 6% / 0) 70%);
  filter: blur(80px) saturate(140%);
  mix-blend-mode: screen;
  pointer-events: none;
}
```

**Critical:** the bloom drops contrast for any text floating over its peak. Mitigate with one of (a) clip the bloom around the top-bar bounding box, (b) opaque card backings behind labels in the bloom zone, or (c) raise text to 100% white with a 1px text shadow at low opacity.

### OKLCH note (Tailwind v4, 2026)

For 2026 stacks, migrate the accent ramp to OKLCH so interpolation between `#8B5CF6 → #6D28D9` stays violet instead of drifting grey midway. Keep HEX fallbacks for canvas/three.js code paths.

### Anchor comparison

| System | BG | Accent | Chart line | Bloom? |
|---|---|---|---|---|
| **Voltrex** | `#0B0B12` | Violet `#8B5CF6` | **Amber `#F0B429`** | Yes, radial |
| GMX | `#16182E` | Cyan | Neon green/red | No |
| Hyperliquid | Near-black | Mint | Mint up / coral down | Vignette only |
| Drift | `#0D0E18` | Purple | Green/red | Subtle |

---

## §2. Typography

### Type scale

| Role | px | rem | Weight | Tracking | Use |
|---|---|---|---|---|---|
| KPI hero | 40 | 2.5 | 600 | -0.02em | TVL, APY headline |
| KPI secondary | 28 | 1.75 | 600 | -0.015em | Supply, ratio |
| Section header | 20 | 1.25 | 600 | -0.01em | "Futures copy trading" |
| Card header | 16 | 1.0 | 500 | 0 | Leader name |
| Body | 14 | 0.875 | 400 | 0 | Descriptions |
| Caption | 11 | 0.6875 | 400 | 0.01em | Chart ticks |
| Eyebrow | 10 | 0.625 | 500 | 0.08em | UPPERCASE "TVL", "APY" |

Fluid scaling: `clamp(2.5rem, 1.8rem + 0.9vw, 3rem)` for the hero KPIs at 1440 → 1920px.

### Font stack

**Inter (variable)** for UI, **JetBrains Mono** for raw numerics (order books, tx hashes). Required OpenType features:

```css
font-feature-settings: "tnum" 1, "cv11" 1, "ss01" 1, "zero" 1;
```

`tnum` = tabular figures (numbers don't jitter on update). `zero` = slashed zero (disambiguates `O` from `0` in addresses) — critical for crypto.

### Value + delta pattern

```html
<div class="kpi">
  <span class="kpi__label">TVL</span>
  <div class="kpi__row">
    <span class="kpi__value">$380.50<span class="kpi__decimal">M</span></span>
    <span class="kpi__delta kpi__delta--up">+$17.34M</span>
  </div>
</div>
```

The eye reads value first (large, full opacity), delta second (smaller chip, tinted background of the same hue).

### Number formatting — DO NOT hand-roll

Use `Intl.NumberFormat` everywhere. The Voltrex screenshot ships a bug: it mixes EU (`$34.081.818`) and US (`$20,040.57`) thousand separators on the same screen. One `Intl.NumberFormat(locale)` instance threaded through every numeric prevents this.

```ts
const fmtCcy = new Intl.NumberFormat(locale, {
  notation: "compact", compactDisplay: "short",
  style: "currency", currency: "USD",
  maximumFractionDigits: 2
});
fmtCcy.format(34_081_818);  // "$34.08M"
```

---

## §3. Charting

### Library pick

- **Hero chart: TradingView Lightweight Charts** (~45KB gzip, Apache-2.0). Built-in `priceLineVisible: true` + `priceLineColor: '#F0B429'` reproduces the yellow current-value pill natively — three lines of config.
- **Sparklines: visx** (`@visx/shape` + `@visx/scale`). Lightweight Charts is too heavy per card; Recharts re-renders on every WebSocket tick.
- **Avoid:** Recharts for the hero (jank at 10Hz updates), Tremor (dashboard-card abstraction, not trading), Plotly (3MB bundle).

### Voltrex chart anatomy

```ts
const chart = createChart(container, {
  layout: { background: { color: "#0B0B0F" }, textColor: "#A0A0A8" },
  grid: { vertLines: { visible: false }, horzLines: { color: "#1A1A20" } },
  rightPriceScale: { borderVisible: false },
  timeScale: { borderVisible: false, fixLeftEdge: true },
  crosshair: {
    mode: CrosshairMode.Magnet,
    vertLine: { color: "#3A3A40", style: 2, labelBackgroundColor: "#F0B429" },
    horzLine: { color: "transparent", labelBackgroundColor: "#F0B429" }
  }
});
const series = chart.addSeries(LineSeries, {
  color: "#F0B429", lineWidth: 2,
  priceLineVisible: true, priceLineColor: "#F0B429",
  lastValueVisible: true  // ← the yellow pill on the y-axis
});
```

### Tooltip rules

- Position **above** the data point with a down-arrow, not below. The user's hand never occludes it on touch.
- Snap to data x; never free-float horizontally.
- `aria-live="polite"` on a mirrored DOM node so screen readers receive the same content.
- Keyboard: chart focusable with `tabIndex=0`, arrow keys traverse data points, Home/End jump to extremes.

### Sparkline conventions

- Aspect ~3:1 or 5:1; 80×20 at base font.
- Single end-dot at the latest value (Tufte's "endpoint emphasis").
- Color by sign of delta. Pair with a glyph (▲/▼) for CVD accessibility.
- Faint 1px zero-line only if the series crosses zero; otherwise omit.

---

## §4. Information Architecture

### Layout tree

```
Voltrex Dashboard
├── Top bar — Brand, primary nav, wallet, lang, theme, faucet
├── KPI Strip — TVL, Price, Collateral, Supply, APY (5 tiles)
├── Epoch row — current epoch + countdown
├── Main Grid (8:4)
│   ├── Chart card — Account Value | PNL tabs + range
│   └── Deposit panel — balances, amount, lock slider, boost, receive, CTA
├── Vault meta — About | Performance tabs + leader + contract
└── Futures copy trading — 3 leader cards
```

### Eye path

**Modified Z**, terminating on the green Deposit CTA. Order: brand → KPI strip → epoch → chart → deposit panel → vault meta → leader cards. The diagonal lands the eye on the conversion sink.

### Inferred jobs-to-be-done

1. **Deposit into the vault** (only saturated primary CTA, top-right)
2. **Evaluate vault health** (KPI strip + chart consume ~70% of the fold)
3. **Discover copy-trading alternatives** (rich row below the fold)

### Grid

12-column, 1440 max-width, 24px gutters, 32px outer margins, fixed ~64px left icon rail. Main split 8/4 (≈66/33). KPI strip = 5 equal cells. Copy-trade = 3 equal cards.

```jsx
<main className="flex-1 px-8 py-6 space-y-6 max-w-[1440px]">
  <ul className="grid grid-cols-5 gap-4 max-md:flex max-md:overflow-x-auto max-md:snap-x">
    {/* KPI tiles */}
  </ul>
  <section className="grid grid-cols-12 gap-6">
    <div className="col-span-12 lg:col-span-8 rounded-2xl bg-surface p-5">{/* chart */}</div>
    <aside className="col-span-12 lg:col-span-4 rounded-2xl bg-surface p-5 lg:sticky lg:top-6">
      {/* deposit form */}
    </aside>
  </section>
  <section className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
    {/* leader cards */}
  </section>
</main>
```

### Breakpoint collapse

- **1024 (tablet)**: KPI → horizontal snap-scroll; deposit drops below chart; copy-trade → 2-up; left rail collapses.
- **768**: epoch row stacks; About tabs → accordion.
- **390 (mobile)**: KPI tiles 160px h-scroll; chart legend below canvas; **deposit panel becomes a bottom sheet** triggered by a sticky FAB; copy-trade stacks 1-up with sparkline above ROI.

### Three IA bugs to fix

1. **Lock period mutates APY silently** — bind right-panel `Lock Boost` pill to recompute, echo "Effective APY" inside deposit, gray-out global KPI when slider is touched.
2. **Epoch decoupled from chart range** — add an "Epoch 23" chip to the range selector, vertical guide at epoch start.
3. **Copy-trade ROI windowing ambiguous** — label as "ROI · 30D" with 7D/30D/All toggle, align sparkline x-axis to the window.

---

## §5. Crypto/DeFi UX Conventions

### Present in Voltrex (execution rated)

| Pattern | Voltrex | Best practice |
|---|---|---|
| Address truncation | `0xBwqw…1248` (⚠ invalid hex) | EIP-55 checksum, ENS resolution, hover-to-expand |
| Network selector | Present, no wrong-network gate visible | Disable Deposit on wrong chain, surface "Switch to X" |
| Faucet indicator | Pill button | Persistent yellow/orange banner for testnet |
| Slippage default | `--` | Default 0.5% (Uniswap convention), warn >1% |
| MAX button | Present, no buffer logic visible | Reserve gas buffer for native, full balance for ERC-20 |
| Epoch countdown | Solid: explicit timestamps + relative | This is what to do |
| APY honesty | "30-day Estimated" subtitle | Add realized vs projected toggle |
| Lock + Boost | Slider + multiplier | Add decay curve / exit penalty disclosure |
| Contract address | Present with copy | Add Etherscan/Hyperscan external link icon |
| Capacity caps | "199/200" | Add waitlist UX / notify-when-open |

### Patterns missing that production needs

1. **Tx confirmation modal with simulation** — `eth_call` preview showing USDT in / vault shares out + gas estimate in USD + decoded route.
2. **Pending state with broadcast tracking** — mempool replacement (speed-up / cancel).
3. **Success state with tx hash + explorer link + share card** — CSV-friendly receipt for tax accounting.
4. **Classified error states** — distinguish user-rejected, insufficient-gas, slippage-exceeded, revert-with-reason; one-click retry.
5. **Mobile bottom sheet for deposit** — swipe-up with sticky CTA, native decimal keyboard, collapsed "advanced" drawer.

### Dark-pattern risks

- **APY anchoring without realized comparison** — invited; add 7d/30d/all-time realized chart adjacent.
- **Hidden lock-up exit penalty** — invited by slider's upside-only boost label; add "Early-unlock penalty: forfeit X%" inline.
- **Pre-toggled boost** — defaults must be `0d`, with the Deposit button copy changing to "Deposit & Lock for 30 days" when nonzero.

---

## §6. Copy-Trading Card

### Anatomy slots

`Header` (avatar + name + capacity badge + favorite) · `Sparkline` · `RoiHero` (absolute + %) · `MetricsGrid` (AUM / 30D MDD / Sharpe) · `Actions` (Mock / Copy).

See [`code/LeaderCard.tsx`](./code/LeaderCard.tsx) for the full implementation.

### Metric set critique

| Shown | Verdict | Why |
|---|---|---|
| ROI absolute | **De-emphasize** | Anchors on dollar amounts the copier can't replicate |
| ROI % | Keep, label window | "ROI +757%" with no period is ambiguous |
| AUM | Keep | Capacity context |
| 30D MDD | **Pair with all-time** | 30-day MDD can flatter accounts whose worst drawdown was day 31 |
| Sharpe | Keep | But prefer Sortino in long-vol crypto |

**Add:** time-in-market / account age (survivorship-bias antidote), Calmar, win-rate paired with avg win/loss, fee row (perf% / mgmt%).

### Color encoding

Green-up / red-down is fine *for sighted users* but ambiguous for ~8% red-green CVD. Pair every signed number with:
1. Leading arrow glyph (▲ / ▼ / ▬).
2. Thicker stroke + 10% area-fill under the sparkline.
3. Optional pattern (solid up, dashed down).

### Sort / filter affordances (missing from screenshot)

- Sort by Sharpe (default), Sortino, Calmar, ROI%, AUM, followers. **Not** ROI absolute.
- Filter: MDD ceiling slider, capacity-available toggle, max-fee, min-account-age (≥90 days), strategy tag.
- Compare: per-card checkbox → side-by-side drawer.

### Mock vs Copy hierarchy

- Primary filled green: **Copy** → opens a focus-trapping modal with slippage, leverage cap, stop-copy threshold, fee disclosure.
- Secondary outline: **Try Mock** → non-blocking drawer with $10k virtual balance; "Promote to real" CTA after 7 days.
- Tertiary link: "View stats" → drawer with full trade history.

---

## §7. Forms & Inputs

### Amount input

**Never use `type="number"`** — it rejects locale separators, breaks IME for CJK, drops formatting. Use `type="text"` + `inputmode="decimal"`:

```tsx
<input
  type="text"
  inputMode="decimal"
  pattern="^\d*[.,]?\d{0,6}$"
  autoComplete="off"
  spellCheck={false}
  aria-describedby="amount-help amount-error"
/>
```

Paste sanitization: `raw.replace(/[$,\s]/g, "").replace(",", ".")`. Convert to BigInt via viem's `parseUnits`.

### Locking-period discrete slider

Radix `Slider` with `min={0} max={4} step={1}` over an indexed stops array — Radix gives keyboard, ARIA, RTL for free. See [`code/LockSlider.tsx`](./code/LockSlider.tsx).

**Critical ARIA:** `aria-valuetext="7 days, 3% boost"` — without it, SR users hear "1, 2, 3" not "7 days". Plus a sibling `<output aria-live="polite">` announcing the *derived* "You Will Receive" so users hear the consequence of each arrow press.

### MAX button gas-buffer logic

```ts
const MIN_NATIVE_FOR_GAS = parseEther("0.002");

function maxDepositAmount({ tokenBalance, nativeBalance, isNative, estGas }) {
  if (isNative) {
    const spendable = nativeBalance - estGas - MIN_NATIVE_FOR_GAS;
    return spendable > 0n ? spendable : 0n;
  }
  return tokenBalance;
}
```

If user taps MAX with `nativeBalance < estGas`, inline warning: **"You don't have enough ETH to pay gas. Get some from the Faucet."**

### Address copy

Truncate `0x` + first 4 + `…` (U+2026) + last 4. Expose full address via `aria-label`. Feedback via inline checkmark icon swap (1.5s) + ARIA live region for SR.

---

## §8. Motion

### Motion tokens

```ts
export const motion = {
  duration: { xs: 100, sm: 150, md: 220, lg: 360, xl: 560 },
  ease: {
    standard:   [0.2, 0, 0, 1],
    decelerate: [0, 0, 0.2, 1],
    accelerate: [0.3, 0, 1, 1],
    anticipate: [0.5, -0.4, 0.3, 1.4]
  }
};
```

### Per-affordance choreography

| Affordance | Duration / ease | Reduced motion |
|---|---|---|
| Chart tooltip | `xs` decelerate; spring `{500,40}` | Snap, no spring |
| Slider thumb | scale 1→1.15 over `sm` anticipate; snap `md` | Skip scale |
| Derived values | `lg` count-up | Set final, no tween |
| CTA hover | `sm` lift -2px; press scale 0.97 `xs` | Color swap only |
| Star favourite | fill + scale 1→1.3→1 `md` anticipate | Instant fill |
| Tab underline | shared layout spring `{380,30}` | `duration:0` transform |
| Background bloom | 18s linear-infinite transform | `animation: none` |

### Count-up tween (framer-motion)

See [`code/AnimatedNumber.tsx`](./code/AnimatedNumber.tsx) — `useMotionValue` + `useTransform` + `Intl.NumberFormat`, respects `prefers-reduced-motion`.

### Background bloom (cheapest path)

Single absolutely-positioned `<div>` with `radial-gradient` + 18s `transform: translate3d() rotate()` keyframe. One composited layer, zero repaints. Never animate `background-position` (forces paint each frame).

### Performance budget

16.6ms/frame on 2019 MacBook Air. Stick to `transform` / `opacity`. Use `PerformanceObserver({ type: "long-animation-frame" })` (Chrome 123+) to back off when median frame > 24ms over 60 frames. Pause bloom when modal mounts; pause off-screen sparklines via `IntersectionObserver`.

---

## §9. Build Stack (2026)

### Pinned dependencies

```json
{
  "next": "15.1.x", "react": "19.0.x",
  "@radix-ui/react-slider": "1.2.x", "@radix-ui/react-tabs": "1.1.x",
  "tailwindcss": "4.0.x", "lucide-react": "0.460.x",
  "lightweight-charts": "4.2.x", "@visx/shape": "3.12.x",
  "framer-motion": "11.11.x",
  "zustand": "5.0.x", "@tanstack/react-query": "5.59.x",
  "wagmi": "2.13.x", "viem": "2.21.x", "@rainbow-me/rainbowkit": "2.2.x",
  "react-hook-form": "7.53.x", "zod": "3.23.x",
  "next-intl": "3.25.x", "@biomejs/biome": "1.9.x"
}
```

### Folder layout

```
app/vault/[address]/
  page.tsx                # PPR shell
  @chart/default.tsx      # parallel slot, dynamic
  @deposit/default.tsx    # parallel slot, client
components/
  ui/                     # shadcn primitives
  chart/{HeroChart,Sparkline}.tsx
  deposit/{DepositPanel,LockSlider}.tsx
  kpi/KpiTile.tsx
  leaders/LeaderCard.tsx
  wallet/ConnectButton.tsx
lib/{format,chains,ws}.ts
hooks/{useVaultStats,useLeaderboard,usePriceStream}.ts
styles/globals.css        # @theme tokens (OKLCH)
```

### Decisions

| Choice | Why |
|---|---|
| Next.js 15 PPR over Remix | Static About + dynamic chart/deposit holes; Remix lacks PPR |
| Lightweight Charts over Recharts | 45KB, built-in price-line pill, canvas perf at 10Hz |
| visx over Lightweight Charts for sparklines | Lightweight Charts is too heavy per card |
| Biome over ESLint+Prettier | Single Rust tool, 10x faster, sufficient coverage |
| `"use client"` on chart + deposit | They're 100% interactive; async RSC adds waterfall |
| Floating UI over CSS anchor positioning | Safari support still patchy in 2026 |

### Bundle budget

≤ 180 KB gzip per route. Lightweight Charts and framer-motion behind `dynamic()`. wagmi connectors lazy-loaded.

---

## §10. Competitive Context

### Direct visual ancestors

1. **Hyperliquid** — near-black canvas + single accent + restraint.
2. **Solana ecosystem (Jupiter, Drift, Phantom)** — purple primaries + amber/lime data highlights.
3. **Vercel / Linear / Stripe** — bloom-on-dark surface treatment (the "AI Cloud" aesthetic).

### What Voltrex remixes

- Structural grammar: CEX-advanced + Hyperliquid (KPI ribbon + crosshair chart)
- Deposit + lock + boost panel: ERC-4626 canon (Yearn v3 + Pendle + Ethena + Curve veCRV / Velodrome veVELO)
- Leader card row: eToro + Bybit + Bitget copy-trading

### Smartest single move

Amber chart line. Sidesteps the red/green PnL convention so the hero chart reads as "vault narrative" rather than "live PnL" — reinforces the design's positioning as a yield/strategy product rather than a scalper's terminal.

### Five anti-patterns Voltrex avoids

1. Rainbow token chips on every row (DeBank/Zapper style)
2. CEX-style 4-pane wall (Binance Futures, Bybit Pro)
3. Noisy gradient fills inside data plots
4. Yield numbers without lock-period or risk context
5. Copy-trade leaders lacking drawdown / follower count

### Five Dribbble/Behance refs for ongoing study

- [Nixtio — Crypto Trading Dashboard UI Design](https://dribbble.com/shots/27280041-Crypto-Trading-Dashboard-UI-Design)
- [Nixtio — Crypto Trading Dashboard Design](https://dribbble.com/shots/25709809-Crypto-Trading-Dashboard-Design)
- [Nixtio — Crypto Portfolio Dashboard](https://dribbble.com/shots/25841268-Crypto-Portfolio-Dashboard)
- [Nixtio — Crypto Trading Platform](https://dribbble.com/shots/25825573-Crypto-Trading-Platform)
- [Crypto Trading Dashboard — Analytics & Portfolio](https://dribbble.com/shots/26718443-Crypto-Trading-Dashboard-Analytics-Portfolio)

---

## §11. Accessibility, Performance, i18n

### Top a11y risks (WCAG 2.2 AA)

1. Tertiary text at 55% opacity over the bloom drops below 4.5:1. **Fix:** raise to 65% (or solid `#B8B3CC`) and never composite opacity over gradients.
2. 10–11px axis labels. **Fix:** ≥12px, weight 500.
3. Sparkline color is sole ROI indicator. **Fix:** add ▲/▼ glyph + sign + SR text.
4. Truncated address unreadable to SR. **Fix:** `aria-label` with full address.
5. Slider needs ←/→ Home/End PgUp/PgDn + 24×24 thumb + `aria-valuetext`.
6. Realtime price spamming SR. **Fix:** `aria-live="polite" aria-atomic="true"` + throttle DOM writes to ≤1/5s, announce only on ≥0.25% delta.
7. Chart needs `role="img"` + `<details>` data-table fallback.
8. Focus order unspecified — define and test.
9. APY without disclosure. **Fix:** info button + popover.
10. KPI strip reflow at <768px.

### EAA exposure (June 28, 2025)

The European Accessibility Act treats consumer banking and e-commerce as in-scope; a public crypto dashboard serving EU consumers must meet EN 301 549 (≈ WCAG 2.1 AA, trending to 2.2). Maintain an accessibility statement and complaint channel.

### Performance (CWV 2026)

- LCP < 2.5s, INP < 200ms, CLS < 0.1.
- **INP hotspots:** slider drag, chart hover, realtime ticks. Coalesce WebSocket frames per animation frame.
- **CLS:** reserve KPI tile heights with `min-block-size`; tabular-nums prevents number jitter.
- Fonts: subset Latin + numerals, `font-display: swap`, preload one weight.
- Violet bloom: pure CSS = 0 KB image.

```ts
// rAF coalescing
let pending = null;
ws.onmessage = e => { pending = parse(e.data); schedule(); };
const schedule = () => requestAnimationFrame(() => {
  if (pending) applyTick(pending); pending = null;
});
```

### i18n

- The screenshot ships mixed locale (EU `34.081.818` next to US `20,040.57`). One `Intl.NumberFormat(locale)` instance threaded through every numeric prevents this.
- Dates: `Intl.DateTimeFormat`, never hand-built `dd.mm.yyyy`.
- Plurals: `Intl.PluralRules` (Arabic has 6 categories).
- RTL: logical properties (`margin-inline-start`); chart y-axis swaps sides but numerals stay LTR.
- 2026 library pick: **`next-intl`** — native App-Router/RSC support, ICU MessageFormat.
- ENS normalization via [ENSIP-15](https://docs.ens.domains/ensip/15); wrap truncated addresses in `<bdi>` for RTL.
- Wei → ether display via BigInt, never `Number`.

---

## §12. 24-item Pre-Release Checklist

1. Contrast ≥ 4.5:1 incl. over gradients
2. Axis labels ≥ 12px / weight 500
3. No color-only meaning anywhere
4. Wallet button exposes full address via `aria-label`
5. Slider: ←/→/Home/End/PgUp/PgDn, ≥24px thumb, `aria-valuetext`
6. Focus order documented and tested; 2px ring at ≥3:1
7. Realtime updates throttled ≤1/5s; `aria-live="polite"` on ≥0.25% deltas
8. Chart has `role="img"` + summary + `<details>` fallback
9. APY/Boost paired with disclosure popover
10. KPI strip reflows at 768/480
11. EAA accessibility statement published
12. LCP < 2.5s, INP < 200ms, CLS < 0.1 on 4G Moto-G
13. Route JS ≤ 180 KB gzip; chart engine code-split
14. Fonts subset, `font-display: swap`, `tnum` on
15. Bloom is CSS gradient (0 KB image)
16. Sparklines pause via `IntersectionObserver`
17. WebSocket ticks coalesced per rAF
18. Animations restricted to `transform`/`opacity`
19. KPI tiles reserve heights to prevent CLS
20. Dates via `Intl.DateTimeFormat`
21. Numbers/currency via `Intl.NumberFormat`; tested for `en-IN`, `de-CH`, `ar-EG`
22. ICU plurals; no string concatenation
23. RTL audit with `dir="rtl"`
24. ENS via ENSIP-15; addresses wrapped in `<bdi>`
