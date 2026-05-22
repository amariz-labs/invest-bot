import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { Bloom } from "@/components/Bloom";
import { notFound } from "next/navigation";

// Symbol detail page. The slug name is `[symbol]` not `[address]` because
// this is the equities adaptation — see EQUITIES-DASHBOARD.md §1.
// Validates against a permissive equities ticker pattern (1-8 chars, upper
// + dot + dash for class shares + warrants like BRK.B / RDS-A).

interface PageProps {
  params: Promise<{ symbol: string }>;
}

const TICKER_PATTERN = /^[A-Z][A-Z.\-]{0,7}$/;

export default async function VaultSymbolPage({ params }: PageProps) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();
  if (!TICKER_PATTERN.test(symbol)) {
    notFound();
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <Bloom />
      <div className="relative flex">
        <Sidebar />
        <div className="flex-1">
          <Header />
          <main className="mx-auto max-w-[1440px] px-8 py-6 space-y-6">
            <header className="flex items-baseline gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{symbol}</h1>
              <span className="text-xs text-content-tertiary uppercase tracking-wider">
                Symbol detail
              </span>
            </header>

            <section className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-8 rounded-2xl bg-surface border border-subtle p-5 min-h-[560px]">
                <header className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-medium tracking-tight">
                    {symbol} · 1D
                  </h2>
                  <span className="text-xs text-content-tertiary">
                    TVEmbed placeholder — load Charting Library script + mount
                    /public/charting_library/
                  </span>
                </header>
                <div className="h-[500px] grid place-items-center text-content-tertiary text-sm border border-dashed border-subtle rounded-lg">
                  Chart loads here. See ../design/code/TVEmbed.tsx and
                  /api/udf/* for the datafeed.
                </div>
              </div>

              <aside className="col-span-12 lg:col-span-4 rounded-2xl bg-surface border border-subtle p-5 space-y-4">
                <header>
                  <h2 className="text-base font-medium tracking-tight">Order Ticket</h2>
                  <p className="text-xs text-content-tertiary mt-1">
                    Placeholder — risk-based sizer, market/limit/stop/bracket,
                    PDT + BP pre-trade gates. See EQUITIES-DASHBOARD.md §3.
                  </p>
                </header>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 rounded-md bg-success/15 text-success border border-success/30 px-3 py-2 text-sm font-medium focus-on-bloom"
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-md bg-danger/15 text-danger border border-danger/30 px-3 py-2 text-sm font-medium focus-on-bloom"
                    >
                      Sell
                    </button>
                  </div>
                  <div className="rounded-md border border-subtle p-3 text-xs text-content-tertiary">
                    Connect a broker in .env.local to enable live ordering.
                  </div>
                </div>
              </aside>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
