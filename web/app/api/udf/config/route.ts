import { NextResponse } from "next/server";

// TradingView Charting Library UDF spec — /config endpoint.
// https://github.com/tradingview/charting-library-tutorial/wiki/UDF
// See TRADINGVIEW-INTEGRATION.md §3 for the full contract.

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({
    supports_search: true,
    supports_group_request: false,
    supported_resolutions: ["1", "5", "15", "30", "60", "D", "W", "M"],
    supports_marks: false,
    supports_timescale_marks: false,
    supports_time: true,
    exchanges: [
      { value: "", name: "All Exchanges", desc: "" },
      { value: "NASDAQ", name: "NASDAQ", desc: "NASDAQ" },
      { value: "NYSE", name: "NYSE", desc: "New York Stock Exchange" },
      { value: "AMEX", name: "AMEX", desc: "American Stock Exchange" },
    ],
    symbols_types: [
      { name: "All types", value: "" },
      { name: "Stock", value: "stock" },
      { name: "ETF", value: "etf" },
      { name: "Index", value: "index" },
    ],
  });
}
