import { NextResponse } from "next/server";
import { data } from "@/lib/data";
import type { SymbolInfo } from "@/lib/types";

// UDF /search?query=AAP&type=stock&exchange=NASDAQ&limit=10

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") ?? "";
  const type = (searchParams.get("type") ?? undefined) as SymbolInfo["type"] | undefined;
  const exchange = searchParams.get("exchange") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? 30);

  try {
    const results = await data.realtime.search(query, { type, limit });
    return NextResponse.json(
      results
        .filter((r) => !exchange || r.exchange === exchange)
        .map((r) => ({
          symbol: r.symbol,
          full_name: `${r.exchange}:${r.symbol}`,
          description: r.name,
          exchange: r.exchange,
          ticker: r.symbol,
          type: r.type,
        })),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "search failed";
    return NextResponse.json({ s: "error", errmsg: message }, { status: 500 });
  }
}
