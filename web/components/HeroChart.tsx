"use client";

// HeroChart — equities-style candlestick + volume overlay using TradingView
// Lightweight Charts (Apache-2.0). Loaded via dynamic import so the ~80KB
// charting bundle doesn't block initial page render. Mirrors the design-pack
// reference in ../../design/code/HeroChart.tsx but configured for OHLCV per
// EQUITIES-DASHBOARD.md §2.
//
// Data flow:
//   1. Mount → fetch UDF /history for the last ~6 months of daily bars.
//   2. Subscribe to data.realtime.streamQuotes() and roll the last bar.
//   3. ResizeObserver → rAF-coalesced applyOptions({ width }).
//   4. Unmount → unsubscribe, disconnect RO, chart.remove().

import { useEffect, useRef, useState } from "react";
import { data } from "@/lib/data";
import type { Quote } from "@/lib/types";

// `lightweight-charts` exports many types; we only need a few at the call
// site. Using `any` for SDK-shape returns from the dynamic import is the
// pragmatic move — strict typing would re-import the entire type tree
// eagerly, defeating the dynamic-import bundle-split.
// biome-ignore lint/suspicious/noExplicitAny: SDK types loaded dynamically
type ChartApi = any;
// biome-ignore lint/suspicious/noExplicitAny: SDK types loaded dynamically
type SeriesApi = any;

export interface HeroChartProps {
  symbol: string;
  height?: number;
}

interface CandleBar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

interface VolumeBar {
  time: number;
  value: number;
  color: string;
}

const BG = "#0B0B12";
const TEXT = "#A0A0A8";
const GRID = "#1A1A20";
const AMBER = "#F0B429";
const UP = "#22C55E";
const DOWN = "#EF4444";
const VOL = "#A78BFA66";

// 180 days of daily bars by default — enough for a year-half view.
const HISTORY_DAYS = 180;

export function HeroChart({ symbol, height = 420 }: HeroChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const priceSeriesRef = useRef<SeriesApi | null>(null);
  const volSeriesRef = useRef<SeriesApi | null>(null);
  const lastBarRef = useRef<CandleBar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mount once per symbol. Tearing down on symbol change is simpler than
  // hot-swapping series and avoids races between the in-flight fetch and a
  // new subscription.
  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;
    let unsubscribe: (() => void) | null = null;
    let resizeRaf = 0;
    let resizeObserver: ResizeObserver | null = null;
    let localChart: ChartApi | null = null;

    setLoading(true);
    setError(null);

    (async () => {
      // Dynamic import keeps lightweight-charts out of the initial JS bundle.
      const lwc = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const chart = lwc.createChart(containerRef.current, {
        height,
        layout: {
          background: { color: BG },
          textColor: TEXT,
          fontFamily: '"Inter var", "Inter", system-ui, sans-serif',
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: GRID },
        },
        rightPriceScale: { borderVisible: false, ticksVisible: false },
        timeScale: {
          borderVisible: false,
          fixLeftEdge: true,
          secondsVisible: false,
        },
        crosshair: {
          mode: lwc.CrosshairMode.Magnet,
          vertLine: {
            color: "#3A3A40",
            style: 2,
            labelBackgroundColor: AMBER,
            labelVisible: true,
          },
          horzLine: {
            color: "transparent",
            labelBackgroundColor: AMBER,
          },
        },
        handleScale: { mouseWheel: false },
      });
      localChart = chart;

      const priceSeries = chart.addSeries(lwc.CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        priceLineVisible: true,
        priceLineColor: AMBER,
        priceLineWidth: 1,
        lastValueVisible: true,
      });

      const volumeSeries = chart.addSeries(lwc.HistogramSeries, {
        priceScaleId: "vol",
        priceFormat: { type: "volume" },
        color: VOL,
      });
      chart
        .priceScale("vol")
        .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

      chartRef.current = chart;
      priceSeriesRef.current = priceSeries;
      volSeriesRef.current = volumeSeries;

      // Coalesced resize → keeps INP within budget per DASHBOARD-BRIEF §8.
      resizeObserver = new ResizeObserver((entries) => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          const entry = entries[0];
          if (!entry) return;
          chart.applyOptions({ width: entry.contentRect.width });
        });
      });
      resizeObserver.observe(containerRef.current);

      // Fetch initial bars via the UDF /history route.
      try {
        const to = Math.floor(Date.now() / 1000);
        const from = to - HISTORY_DAYS * 86_400;
        const url = `/api/udf/history?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${to}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`history ${res.status}`);
        const body = (await res.json()) as {
          s: string;
          t?: number[];
          o?: number[];
          h?: number[];
          l?: number[];
          c?: number[];
          v?: number[];
          errmsg?: string;
        };
        if (disposed) return;
        if (body.s !== "ok" || !body.t || !body.o || !body.h || !body.l || !body.c) {
          if (body.s === "no_data") {
            setError("No data for this symbol.");
          } else {
            throw new Error(body.errmsg ?? `udf s=${body.s}`);
          }
          setLoading(false);
          return;
        }

        const candles: CandleBar[] = body.t.map((time, i) => ({
          time,
          open: body.o![i] as number,
          high: body.h![i] as number,
          low: body.l![i] as number,
          close: body.c![i] as number,
        }));
        const volumes: VolumeBar[] = body.t.map((time, i) => {
          const open = body.o![i] as number;
          const close = body.c![i] as number;
          return {
            time,
            value: (body.v?.[i] as number | undefined) ?? 0,
            color: close >= open ? `${UP}66` : `${DOWN}66`,
          };
        });

        priceSeries.setData(candles);
        volumeSeries.setData(volumes);
        chart.timeScale().fitContent();
        lastBarRef.current = candles[candles.length - 1] ?? null;
        setLoading(false);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : "history failed");
        setLoading(false);
      }

      // Subscribe to live quotes — every tick rolls the last bar's close.
      // A full intraday OHLCV stream would replace this; for now we keep
      // the close honest and let history populate the open/high/low.
      const handler = (q: Quote) => {
        if (q.symbol !== symbol) return;
        const series = priceSeriesRef.current;
        const last = lastBarRef.current;
        if (!series || !last) return;
        const next: CandleBar = {
          time: last.time,
          open: last.open,
          high: Math.max(last.high, q.last),
          low: Math.min(last.low, q.last),
          close: q.last,
        };
        lastBarRef.current = next;
        series.update(next);
      };
      unsubscribe = data.realtime.streamQuotes([symbol], handler);
    })();

    return () => {
      disposed = true;
      if (unsubscribe) unsubscribe();
      if (resizeObserver) resizeObserver.disconnect();
      cancelAnimationFrame(resizeRaf);
      if (localChart) {
        localChart.remove();
      }
      chartRef.current = null;
      priceSeriesRef.current = null;
      volSeriesRef.current = null;
      lastBarRef.current = null;
    };
  }, [symbol, height]);

  return (
    <div className="relative" style={{ height }}>
      <div
        ref={containerRef}
        className="w-full h-full"
        role="img"
        aria-label={`${symbol} price chart, daily candles`}
        tabIndex={0}
      />
      {loading && (
        <div
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center pointer-events-none"
        >
          <div className="w-full h-full rounded-lg bg-surface-elevated/40 animate-pulse" />
        </div>
      )}
      {error && !loading && (
        <div className="absolute inset-0 grid place-items-center text-content-tertiary text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
