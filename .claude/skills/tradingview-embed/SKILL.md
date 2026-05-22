---
name: tradingview-embed
description: Generate a TradingView Charting Library or Widget embed wired to this repo's data adapters. Invoke when the user asks "embed TradingView", "TV widget", "Charting Library", "show TradingView in my dashboard".
---

# When to use

User wants TradingView-style charts (or the actual TradingView UI) inside their own Next.js dashboard. For headless Pine generation, use `pine-new`. For receiving alerts from TradingView, use `alert-webhook`.

# Three options (decide together)

| Option | When | Effort | Cost |
|---|---|---|---|
| **TradingView Widgets** | Read-only embed, no auth needed | 5 min | Free |
| **Lightweight Charts** | Full control, open Apache-2.0 | 1 day | Free |
| **TradingView Charting Library** | Full TV UI (drawings, indicators, save/load) | 1 week | Free after application |

See [`design/TRADINGVIEW-INTEGRATION.md`](../../../design/TRADINGVIEW-INTEGRATION.md) for the decision tree.

# Recipe

```
/tradingview-embed --mode widget|lwc|charting-library \
  --symbol AAPL --interval D \
  [--udf-base /api/udf] [--data-source polygon|alpaca|yfinance]
```

### Mode: `widget`

Emit `components/TVWidget.tsx` using the iframe-embed pattern. Done in one file.

### Mode: `lwc`

Emit `components/chart/HeroChart.tsx` (copy from `design/code/HeroChart.tsx`), configured for candles + volume + RTH shading. Wire to `DataAdapter` for live data. See [`design/code/HeroChart.tsx`](../../../design/code/HeroChart.tsx).

### Mode: `charting-library`

This is the big one. Steps:
1. Tell the user to apply for the Charting Library at https://www.tradingview.com/charting-library/ — they'll receive a GitHub repo invite with the bundle.
2. Place the bundle at `public/charting_library/`.
3. Load `charting_library.standalone.js` via `<Script>` in `app/layout.tsx`.
4. Emit `components/chart/TVEmbed.tsx` (copy from `design/code/TVEmbed.tsx`).
5. Scaffold the UDF endpoint at `app/api/udf/`:
   - `config/route.ts`
   - `symbols/route.ts`
   - `search/route.ts`
   - `history/route.ts`
   - `time/route.ts`
6. Each UDF route is a thin adapter over `DataAdapter` (see [`design/code/DataAdapter.ts`](../../../design/code/DataAdapter.ts)).
7. Optional: scaffold `app/api/charts/` for save/load chart layouts (4 routes: GET all, GET one, POST, DELETE).
8. Optional: `custom.css` to apply the violet+amber theme tokens to the TV chrome.

# Output convention

```
components/chart/<Component>.tsx
app/api/udf/*/route.ts                 # for charting-library mode
app/api/charts/*/route.ts              # optional
public/charting_library/               # user-provided, gitignored
```

Add to `.gitignore`: `public/charting_library/`.

# Install on first use

```bash
npm i lightweight-charts                                # for lwc mode
# (charting_library is not on npm — user installs from TV's private repo)
```

# Don't

- Don't vendor the Charting Library — it's gated behind a TV license. Reference by path only.
- Don't pass user broker credentials through the UDF endpoint — UDF is server-side; auth via session cookie.
- Don't expose your data API key in client code — the UDF route on your server makes the upstream call.
- Don't use the widget embed and the Charting Library on the same page — they conflict on `window.TradingView`.
- Don't claim "TradingView-compatible" — TV's brand guidelines require attribution and disallow that phrasing.
