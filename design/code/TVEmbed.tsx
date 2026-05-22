// TradingView Charting Library wrapper. Self-hosted, free for commercial use
// after a form on TradingView's site. Library bundle must be served from
// /public/charting_library/ — not vendored here for license reasons.
// See ../TRADINGVIEW-INTEGRATION.md §3 for full setup.

"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView?: any;
    Datafeeds?: any;
  }
}

export interface TVEmbedProps {
  symbol?: string;
  interval?: "1" | "5" | "15" | "30" | "60" | "240" | "D" | "W" | "M";
  udfBaseUrl?: string;
  libraryPath?: string;
  containerId?: string;
  studies?: string[];
  /** Save layouts via your backend; pass a custom save_load_adapter. */
  saveLoadEndpoint?: string;
}

export function TVEmbed({
  symbol = "AAPL",
  interval = "D",
  udfBaseUrl = "/api/udf",
  libraryPath = "/charting_library/",
  studies = ["MASimple@tv-basicstudies"],
  saveLoadEndpoint,
}: TVEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // The Charting Library loader expects `window.TradingView`.
    // Load it via a <script> tag in your root layout: <Script src="/charting_library/charting_library.standalone.js" />
    if (!window.TradingView || !window.Datafeeds) {
      console.warn("[TVEmbed] TradingView Charting Library script not loaded.");
      return;
    }

    const widget = new window.TradingView.widget({
      container: containerRef.current,
      library_path: libraryPath,
      datafeed: new window.Datafeeds.UDFCompatibleDatafeed(udfBaseUrl, 60_000),
      symbol,
      interval,
      timezone: "America/New_York",
      theme: "dark",
      locale: "en",
      autosize: true,
      fullscreen: false,
      toolbar_bg: "#0B0B12",
      enabled_features: [
        "study_templates",
        "hide_left_toolbar_by_default",
        "use_localstorage_for_settings",
      ],
      disabled_features: [
        "header_symbol_search",          // keep symbol selection in your app's chrome
        "header_compare",
        "popup_hints",
      ],
      studies_overrides: {
        "volume.volume.color.0": "#EF444466",
        "volume.volume.color.1": "#22C55E66",
      },
      overrides: {
        "paneProperties.background": "#0B0B12",
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": "#1A1A20",
        "paneProperties.horzGridProperties.color": "#1A1A20",
        "scalesProperties.textColor": "#A0A0A8",
        "mainSeriesProperties.candleStyle.upColor": "#22C55E",
        "mainSeriesProperties.candleStyle.downColor": "#EF4444",
        "mainSeriesProperties.candleStyle.borderUpColor": "#22C55E",
        "mainSeriesProperties.candleStyle.borderDownColor": "#EF4444",
        "mainSeriesProperties.candleStyle.wickUpColor": "#22C55E",
        "mainSeriesProperties.candleStyle.wickDownColor": "#EF4444",
      },
      custom_css_url: "/charting_library/custom.css",
      save_load_adapter: saveLoadEndpoint
        ? buildSaveLoadAdapter(saveLoadEndpoint)
        : undefined,
    });

    widget.onChartReady(() => {
      studies.forEach(s => widget.activeChart().createStudy(s.split("@")[0]));
    });

    widgetRef.current = widget;
    return () => {
      try { widget.remove(); } catch {}
      widgetRef.current = null;
    };
  }, [symbol, interval, udfBaseUrl, libraryPath, studies.join(","), saveLoadEndpoint]);

  return (
    <div
      ref={containerRef}
      className="h-[640px] w-full"
      role="application"
      aria-label="TradingView Charting Library"
    />
  );
}

// ---------------------------------------------------------------------------
// Save/load adapter — talks to /api/charts/* in your Next.js app.
// Persists chart layouts (JSON blobs ~5-50KB each) keyed by user.

function buildSaveLoadAdapter(base: string) {
  const j = (r: Response) => (r.ok ? r.json() : Promise.reject(r.statusText));
  return {
    getAllCharts: () => fetch(`${base}`).then(j),
    removeChart: (id: string) =>
      fetch(`${base}/${id}`, { method: "DELETE" }).then(() => undefined),
    saveChart: (chartData: any) =>
      fetch(`${base}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(chartData),
      })
        .then(j)
        .then((r: any) => r.id),
    getChartContent: (id: string) => fetch(`${base}/${id}`).then(j),
  };
}
