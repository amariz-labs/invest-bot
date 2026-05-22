import { NextResponse } from "next/server";
import { data } from "@/lib/data";
import type { Resolution } from "@/lib/types";

// UDF /history?symbol=AAPL&resolution=D&from=1672531200&to=1704067200
// Returns OHLCV in array-of-arrays format. See TRADINGVIEW-INTEGRATION.md §3.

const VALID_RESOLUTIONS: Resolution[] = ["1", "5", "15", "30", "60", "240", "D", "W", "M"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const resolution = searchParams.get("resolution") as Resolution | null;
  const from = Number(searchParams.get("from"));
  const to = Number(searchParams.get("to"));

  if (!symbol || !resolution || !VALID_RESOLUTIONS.includes(resolution)) {
    return NextResponse.json({ s: "error", errmsg: "invalid params" }, { status: 400 });
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return NextResponse.json({ s: "error", errmsg: "invalid time range" }, { status: 400 });
  }

  try {
    const bars = await data.historical.getBars({ symbol, resolution, from, to });
    if (bars.length === 0) {
      // UDF spec — return `s: "no_data"` so the library doesn't retry forever.
      return NextResponse.json({ s: "no_data", nextTime: from });
    }
    return NextResponse.json({
      s: "ok",
      t: bars.map((b) => b.time),
      o: bars.map((b) => b.open),
      h: bars.map((b) => b.high),
      l: bars.map((b) => b.low),
      c: bars.map((b) => b.close),
      v: bars.map((b) => b.volume),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "history failed";
    return NextResponse.json({ s: "error", errmsg: message }, { status: 500 });
  }
}
