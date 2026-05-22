import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { KpiStrip } from "@/components/KpiStrip";
import { Bloom } from "@/components/Bloom";

// Home dashboard — server component by default. The hero chart and watchlist
// will be promoted to client components once they wrap interactive primitives.
// Today they're placeholders so the route renders without any external SDKs.
//
// Per EQUITIES-DASHBOARD.md §1, the KPI strip exposes: Account Equity, Day
// P&L, YTD Realized, Open Positions, Buying Power. Live values will flow from
// `data.realtime` + `brokers.active.getAccount()` once adapters are wired.

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <Bloom />
      <div className="relative flex">
        <Sidebar />
        <div className="flex-1">
          <Header />
          <main className="mx-auto max-w-[1440px] px-8 py-6 space-y-6">
            <KpiStrip
              tiles={[
                {
                  label: "Account Equity",
                  value: 124_530.42,
                  delta: 1_240.18,
                  deltaPct: 0.0101,
                  format: "currency",
                },
                {
                  label: "Day P&L",
                  value: 1_240.18,
                  deltaPct: 0.0101,
                  format: "currency",
                },
                {
                  label: "YTD Realized",
                  value: 18_402.55,
                  deltaPct: 0.174,
                  format: "currency",
                },
                {
                  label: "Open Positions",
                  value: 7,
                  hint: "of 25 slots",
                  format: "count",
                },
                {
                  label: "Buying Power",
                  value: 41_220.0,
                  hint: "Margin: $82,440",
                  format: "currency",
                },
              ]}
            />

            <section className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8 rounded-2xl bg-surface border border-subtle p-5 min-h-[420px]">
                <header className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-medium tracking-tight">Account Value</h2>
                  <span className="text-xs text-content-tertiary">
                    HeroChart placeholder — wire to lightweight-charts via design/code/HeroChart.tsx
                  </span>
                </header>
                <div className="h-[360px] grid place-items-center text-content-tertiary text-sm border border-dashed border-subtle rounded-lg">
                  Chart loads here. See ../design/code/HeroChart.tsx.
                </div>
              </div>

              <aside className="col-span-12 lg:col-span-4 rounded-2xl bg-surface border border-subtle p-5 min-h-[420px]">
                <header className="mb-4">
                  <h2 className="text-base font-medium tracking-tight">Watchlist</h2>
                  <p className="text-xs text-content-tertiary mt-1">
                    Placeholder — wire to `data.realtime.streamQuotes()`.
                  </p>
                </header>
                <ul className="space-y-2 text-sm">
                  {["AAPL", "MSFT", "NVDA", "SPY", "QQQ"].map((sym) => (
                    <li
                      key={sym}
                      className="flex items-center justify-between rounded-md border border-subtle px-3 py-2"
                    >
                      <span className="font-mono">{sym}</span>
                      <span className="num text-content-tertiary">—</span>
                    </li>
                  ))}
                </ul>
              </aside>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
