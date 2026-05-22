// Voltrex-style hero chart: amber line + yellow current-value pill + crosshair tooltip.
// TradingView Lightweight Charts (Apache-2.0) wrapped for React 19.
// See ../DASHBOARD-BRIEF.md §3 for rationale.

"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";

export interface HeroChartProps {
  data: LineData<Time>[];
  height?: number;
  onCrosshair?(point: LineData<Time> | null): void;
}

export function HeroChart({ data, height = 420, onCrosshair }: HeroChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0B0B12" },
        textColor: "#A0A0A8",
        fontFamily:
          '"Inter var", "Inter", system-ui, sans-serif',
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#1A1A20" },
      },
      rightPriceScale: { borderVisible: false, ticksVisible: false },
      timeScale: { borderVisible: false, fixLeftEdge: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: {
          color: "#3A3A40",
          style: 2,
          labelBackgroundColor: "#F0B429",
          labelVisible: true,
        },
        horzLine: {
          color: "transparent",
          labelBackgroundColor: "#F0B429",
        },
      },
      handleScale: { mouseWheel: false }, // wheel zoom feels janky on dashboards
    });

    const series = chart.addSeries(LineSeries, {
      color: "#F0B429",
      lineWidth: 2,
      priceLineVisible: true,
      priceLineColor: "#F0B429",
      priceLineWidth: 1,
      priceLineStyle: 0,
      lastValueVisible: true, // the yellow pill on the y-axis
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: "#F0B429",
      crosshairMarkerBorderColor: "#0B0B12",
    });
    series.setData(data);
    chart.timeScale().fitContent();

    if (onCrosshair) {
      chart.subscribeCrosshairMove(param => {
        const point = param.seriesData.get(series) as LineData<Time> | undefined;
        onCrosshair(point ?? null);
      });
    }

    // Coalesce resize updates to once-per-rAF to keep INP < 200ms.
    let resizeRaf = 0;
    const ro = new ResizeObserver(entries => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const { width } = entries[0].contentRect;
        chart.applyOptions({ width });
      });
    });
    ro.observe(containerRef.current);

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      ro.disconnect();
      cancelAnimationFrame(resizeRaf);
      chart.remove();
    };
  }, []); // mount once; data updates handled below

  useEffect(() => {
    seriesRef.current?.setData(data);
  }, [data]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      role="img"
      aria-label="Vault account value over time"
      tabIndex={0}
    />
  );
}
