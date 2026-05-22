# TradingView Integration — Patterns & Code

How to plug TradingView into the equities dashboard at every realistic level — from free widgets up to full Charting Library — and how to wire its alerts into your own order pipeline.

## Decision tree

```
Need a chart that looks like TradingView?
├── Free, no auth needed?
│   └── TradingView Widgets (script tag, iframe-embedded)        ← §1
├── Open-source, full control, Apache-2.0?
│   └── Lightweight Charts                                       ← §2 (already in design/code/HeroChart.tsx)
├── Drawing tools + indicators + UDF datafeed?
│   └── TradingView Charting Library (free, license required)    ← §3
└── Hosted + brokerage routing?
    └── TradingView Web Platform (embed only, no code)           ← §4

Need to act on TradingView alerts?
└── Alert webhooks → your receiver → broker                       ← §5
```

---

## §1. TradingView Widgets (cheapest path)

Drop-in iframe widgets. Free, no API key, no UDF endpoint. Ideal for marketing pages and lightweight portfolio dashboards.

```tsx
"use client";
import { useEffect, useRef } from "react";

export function TVAdvancedChartWidget({ symbol = "NASDAQ:AAPL", interval = "D" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol, interval,
      theme: "dark",
      style: "1",                       // candles
      locale: "en",
      toolbar_bg: "#0B0B12",
      enable_publishing: false,
      hide_top_toolbar: false,
      withdateranges: true,
      details: true,
      studies: ["MAExp@tv-basicstudies", "Volume@tv-basicstudies"],
      autosize: true,
    });
    ref.current.appendChild(script);
    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [symbol, interval]);
  return <div ref={ref} className="tradingview-widget-container h-[520px] w-full" />;
}
```

**Available widgets:** advanced chart, mini chart, symbol overview, ticker tape, market overview, screener, economic calendar, earnings calendar, technical analysis, forex cross rates, single quote.

**Caveats:**
- Read-only — no programmatic interaction with chart state.
- All data is TradingView's; can't feed your own.
- Subject to TV's branding rules (attribution must remain visible).

---

## §2. Lightweight Charts (the default in this repo)

Apache-2.0. Fully open. Already integrated in [`code/HeroChart.tsx`](./code/HeroChart.tsx) as a line chart. For equities, configure as candles + volume overlay:

```tsx
import { createChart, CandlestickSeries, HistogramSeries } from "lightweight-charts";

const chart = createChart(container, { /* same dark options as HeroChart */ });
const price = chart.addSeries(CandlestickSeries, {
  upColor: "#22C55E", downColor: "#EF4444",
  borderUpColor: "#22C55E", borderDownColor: "#EF4444",
  wickUpColor: "#22C55E", wickDownColor: "#EF4444",
});
const volume = chart.addSeries(HistogramSeries, {
  priceScaleId: "vol",
  priceFormat: { type: "volume" },
  color: "#A78BFA66",
});
chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
price.setData(candles);
volume.setData(volumeData);
```

**What it gives you:** candlesticks, lines, areas, baseline, histograms, custom-series API, crosshair, time scale, multiple price scales, `priceLine`/`marker` annotations, RTH/extended hours filtering.

**What it doesn't:** drawing tools (trendlines/Fib/rectangles), indicator engine (no built-in EMA/RSI — you compute them, plot them as line series), replay scrubber UI. For those, scale up to §3 or implement on top.

### Adding indicators (your code computes, LWC plots)

```ts
import { EMA, RSI } from "technicalindicators"; // MIT, ~50KB
const ema20 = EMA.calculate({ period: 20, values: closes });
const emaSeries = chart.addSeries(LineSeries, { color: "#F0B429", lineWidth: 1 });
emaSeries.setData(candles.slice(-ema20.length).map((c, i) => ({ time: c.time, value: ema20[i] })));
```

---

## §3. TradingView Charting Library (full TV experience, self-hosted)

The real "TradingView inside your app." Free to use commercially after an application form on TradingView's site; the bundle is gated behind a private GitHub repo invite. You provide a **Universal Data Feed (UDF)** REST endpoint conforming to their spec, and the library renders TV's full charting UI (indicators, drawings, save/load, alerts, replay).

### Embedding (React)

See [`code/TVEmbed.tsx`](./code/TVEmbed.tsx) for the canonical wrapper. Outline:

```tsx
"use client";
import { useEffect, useRef } from "react";

declare global { interface Window { TradingView?: any } }

export function TVChartingLibrary({ symbol = "AAPL", interval = "D", udfBaseUrl = "/api/udf" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current || !window.TradingView) return;
    const widget = new window.TradingView.widget({
      container: containerRef.current,
      library_path: "/charting_library/",
      datafeed: new window.Datafeeds.UDFCompatibleDatafeed(udfBaseUrl),
      symbol, interval,
      theme: "dark",
      locale: "en",
      autosize: true,
      enabled_features: ["study_templates"],
      disabled_features: ["use_localstorage_for_settings"],
      overrides: {
        "paneProperties.background": "#0B0B12",
        "paneProperties.backgroundType": "solid",
        "scalesProperties.textColor": "#A0A0A8",
      },
      custom_css_url: "/charting_library/custom.css",
      save_load_adapter: { /* your save/load impl, e.g. POST to /api/charts */ },
    });
    return () => widget.remove();
  }, [symbol, interval, udfBaseUrl]);
  return <div ref={containerRef} className="h-[640px] w-full" />;
}
```

### UDF endpoint contract

Your backend must answer at least these routes — full spec: [TradingView UDF docs](https://github.com/tradingview/charting-library-tutorial/wiki/UDF).

| Route | Returns |
|---|---|
| `GET /config` | `{ supports_search: true, supports_group_request: false, supported_resolutions: ["1","5","15","60","D","W","M"], supports_marks: false, supports_timescale_marks: false, supports_time: true }` |
| `GET /symbols?symbol=AAPL` | symbol info: name, ticker, type, session, timezone, minmov, pricescale, has_intraday |
| `GET /search?query=AAP&type=stock&exchange=NASDAQ&limit=10` | array of symbol matches |
| `GET /history?symbol=AAPL&resolution=D&from=1672531200&to=1704067200` | OHLCV in array-of-arrays: `{ s: "ok", t: [...], o: [...], h: [...], l: [...], c: [...], v: [...] }` |
| `GET /time` | server time in seconds |
| `GET /marks` | (optional) earnings/dividend marks |

Implementation pattern in Next.js App Router:

```
app/api/udf/
  config/route.ts
  symbols/route.ts
  search/route.ts
  history/route.ts
  time/route.ts
  marks/route.ts
```

Each is a thin adapter over your `DataAdapter` (see [`code/DataAdapter.ts`](./code/DataAdapter.ts)).

### Save/load chart layouts

Implement `save_load_adapter` with four methods: `getAllCharts`, `removeChart`, `saveChart`, `getChartContent`. Persist to your DB keyed by `user_id`. Charts are JSON blobs ~5–50KB.

---

## §4. TradingView Web Platform (hosted brokerage routing)

If you want to *embed TradingView itself and route orders through it*, that's a TradingView Web Platform partnership (B2B contract; you become a connected broker). Out of scope for this brief, but worth knowing it exists.

---

## §5. Alert webhooks (TradingView → your receiver → broker)

TradingView Premium accounts can POST alert payloads to any HTTPS URL. This is the cheapest way to get serverless signal-to-execution without paying for full integration.

### Pine alert with structured payload

```pine
//@version=6
strategy("EMA Cross with Webhook", overlay=true)
fast = ta.ema(close, 12)
slow = ta.ema(close, 26)
longCondition  = ta.crossover(fast, slow)
shortCondition = ta.crossunder(fast, slow)

if longCondition
    strategy.entry("long", strategy.long)
    alert('{"action":"buy","symbol":"' + syminfo.ticker +
          '","price":' + str.tostring(close) +
          ',"qty":100,"strategy":"ema_cross"}', alert.freq_once_per_bar_close)
if shortCondition
    strategy.entry("short", strategy.short)
    alert('{"action":"sell","symbol":"' + syminfo.ticker +
          '","price":' + str.tostring(close) +
          ',"qty":100,"strategy":"ema_cross"}', alert.freq_once_per_bar_close)
```

### Receiver — Next.js route handler

```ts
// app/api/tv-webhook/route.ts
import { z } from "zod";
import { brokers } from "@/lib/brokers";

const PayloadSchema = z.object({
  action: z.enum(["buy", "sell", "close"]),
  symbol: z.string().regex(/^[A-Z.\-]{1,8}$/),
  qty: z.number().positive().max(10_000),
  price: z.number().positive().optional(),
  strategy: z.string().max(64),
});

export async function POST(req: Request) {
  // 1. Auth — require a shared secret in the URL path or `X-TV-Secret` header.
  const auth = req.headers.get("x-tv-secret");
  if (auth !== process.env.TV_WEBHOOK_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Validate. Reject on schema failure (Pine bugs are common).
  const raw = await req.json();
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  // 3. Idempotency — TradingView may retry. Key on (symbol, strategy, bar_close_time).
  const key = `${parsed.data.symbol}:${parsed.data.strategy}:${new Date().toISOString().slice(0,13)}`;
  if (await wasProcessed(key)) return Response.json({ ok: true, dedup: true });
  await markProcessed(key, 60 * 60); // 1h TTL

  // 4. Pre-trade gate — read data/state.yaml from tilt-guard, check PDT, BP, etc.
  const gate = await preTradeGate(parsed.data);
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 403 });

  // 5. Route to the configured broker via the abstract BrokerAdapter.
  const result = await brokers.active.placeOrder({
    symbol: parsed.data.symbol,
    side: parsed.data.action === "buy" ? "buy" : "sell",
    type: "market",
    qty: parsed.data.qty,
  });

  return Response.json({ ok: true, orderId: result.orderId });
}
```

### Hardening checklist

1. **HTTPS only.** TradingView won't POST to plain HTTP, but verify your reverse proxy isn't downgrading.
2. **Shared secret in path or header.** Don't trust the body alone; rotate quarterly.
3. **Schema validation.** Don't pass raw Pine output to your broker SDK.
4. **Idempotency.** Browsers retry, Cloudflare retries, the world retries. Dedupe.
5. **Rate limit.** Cap to e.g. 30 orders/min per strategy.
6. **Audit log.** Every payload + decision + broker response to `data/webhook-log/YYYY-MM-DD.jsonl`.
7. **Kill switch.** A single env var (`TV_WEBHOOK_KILL=1`) that returns 503 to all webhooks. Practice using it.
8. **Replay-attack window.** Reject payloads where the TV-supplied timestamp is > 30s old.
9. **Bracket / OCO server-side.** Don't trust the Pine script to manage exits — wire them on the receiver immediately after entry fills.
10. **Position-size override.** Treat Pine's `qty` as a *suggestion*; recompute from risk-based sizing using current account equity + the broker's actual fill price.

Reference open-source receivers worth studying:
- [`marketcalls/openalgo`](https://github.com/marketcalls/openalgo) — AGPL-3.0 multi-broker ingestion (Indian + global).
- [`robswc/tradingview-webhooks-bot`](https://github.com/robswc/tradingview-webhooks-bot) — GPL-3.0 Flask actions.
- [`hackingthemarkets/tradingview-interactive-brokers`](https://github.com/hackingthemarkets/tradingview-interactive-brokers) — IBKR demo.

License gotcha: AGPL-3.0 (openalgo) is fine for self-host, risky for SaaS — when your receiver becomes the network service of others, AGPL triggers source-disclosure obligations.

---

## §6. Backtested-by-TradingView, executed-by-you (the realistic workflow)

A typical equity trader's day with this pack:

1. **Morning** — open TradingView, look at SPY/QQQ/IWM + watchlist. Manually scan for setups.
2. **Idea** — drop a Pine indicator/strategy on the chart, refine entry rules. Use `pine-new` skill to generate the script.
3. **Alert** — set a TV alert with the JSON-payload webhook URL.
4. **Trigger** — TV fires the webhook; your receiver validates, gates, routes to your broker.
5. **Confirm** — your dashboard shows the fill, journals it via `trade-journal`, updates `data/state.yaml` via `tilt-guard`.
6. **End of day** — `daily-routine` skill emits a summary; `mistake-miner` clusters monthly.

The dashboard is the *cockpit*; TradingView is the *workshop*; your receiver is the *bridge*. Treating any one of those as the source of truth is a mistake — the bridge has the final word on whether an order goes out.

---

## §7. Pine Script ↔ Python parity

You'll often want to backtest in Python (`backtest-runner` skill) what you've prototyped in Pine. Patterns:

- Mirror the Pine logic in a `Backtesting.py` or `vectorbt` strategy. Keep both files side by side.
- Compare metrics on the same OHLCV range. If they diverge by > 2% on Sharpe, hunt the bug — usually it's repaint (`request.security` with `lookahead_on`) or off-by-one indicator alignment.
- The `pine-new` skill can generate the Pine; a sibling pattern would generate the Python parity. Future skill: `pine-to-python`.
