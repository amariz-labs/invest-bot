"use client";

// Home dashboard. EQUITIES-DASHBOARD.md §2 layout: KPI strip on top, hero
// chart left (col-span-8), watchlist beneath. The page is a client component
// because the watchlist → chart symbol selection is a piece of UI state, and
// the watchlist + chart subscribe to the realtime stream. KPI initial values
// stay static here — once the broker is wired they'll move to a server
// component that prefetches and hydrates a client `KpiStrip`.

import { useCallback, useState } from "react";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { KpiStrip } from "@/components/KpiStrip";
import { Bloom } from "@/components/Bloom";
import { HeroChart } from "@/components/HeroChart";
import { Watchlist } from "@/components/Watchlist";

const WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "META", "TSLA"];

const KPI_TILES = [
  {
    label: "Account Equity",
    value: 124_530.42,
    delta: 1_240.18,
    deltaPct: 0.0101,
    format: "currency" as const,
  },
  {
    label: "Day P&L",
    value: 1_240.18,
    deltaPct: 0.0101,
    format: "currency" as const,
  },
  {
    label: "YTD Realized",
    value: 18_402.55,
    deltaPct: 0.174,
    format: "currency" as const,
  },
  {
    label: "Open Positions",
    value: 7,
    hint: "of 25 slots",
    format: "count" as const,
  },
  {
    label: "Buying Power",
    value: 41_220.0,
    hint: "Margin: $82,440",
    format: "currency" as const,
  },
];

export default function HomePage() {
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");

  const handleSymbolSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Bloom />
      <div className="relative flex">
        <Sidebar />
        <div className="flex-1">
          <Header />
          <main className="mx-auto max-w-[1440px] px-8 py-6 space-y-6">
            <KpiStrip tiles={KPI_TILES} />

            <section className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8 rounded-2xl bg-surface border border-subtle p-5">
                <header className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-medium tracking-tight">
                      <span className="font-mono">{selectedSymbol}</span>{" "}
                      <span className="text-content-tertiary font-normal">· Daily</span>
                    </h2>
                    <p className="text-xs text-content-tertiary mt-0.5">
                      Candles + volume · Lightweight Charts
                    </p>
                  </div>
                </header>
                <HeroChart symbol={selectedSymbol} height={420} />
              </div>

              <aside className="col-span-12 lg:col-span-4 rounded-2xl bg-surface border border-subtle p-5">
                <header className="mb-4">
                  <h2 className="text-base font-medium tracking-tight">Watchlist</h2>
                  <p className="text-xs text-content-tertiary mt-1">
                    Click a symbol to load it in the chart.
                  </p>
                </header>
                <Watchlist symbols={WATCHLIST} onSymbolSelect={handleSymbolSelect} />
              </aside>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
