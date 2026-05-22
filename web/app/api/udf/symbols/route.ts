import { NextResponse } from "next/server";
import { data } from "@/lib/data";

// UDF /symbols?symbol=AAPL — returns SymbolInfo formatted for TradingView.
// See TRADINGVIEW-INTEGRATION.md §3 for the contract.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ s: "error", errmsg: "symbol required" }, { status: 400 });
  }

  try {
    const info = await data.realtime.getSymbol(symbol);
    // Map our SymbolInfo (DataAdapter.ts) → TradingView's expected shape.
    return NextResponse.json({
      name: info.symbol,
      ticker: info.symbol,
      description: info.name,
      type: info.type,
      exchange: info.exchange,
      listed_exchange: info.exchange,
      timezone: info.timezone,
      session: info.session,
      minmov: 1,
      pricescale: info.pricescale,
      has_intraday: info.hasIntraday,
      has_daily: true,
      has_weekly_and_monthly: true,
      currency_code: info.currency,
      supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "lookup failed";
    return NextResponse.json({ s: "error", errmsg: message }, { status: 404 });
  }
}
