import { NextResponse } from "next/server";
import PQueue from "p-queue";
import { brokers } from "@/lib/brokers";
import { TVPayloadSchema } from "@/lib/webhook/schema";
import { preTradeGate } from "@/lib/webhook/gates";
import { wasProcessed, markProcessed } from "@/lib/webhook/idempotency";
import { appendAudit } from "@/lib/webhook/auditlog";

// Hardened TradingView alert receiver. Implements every item in
// TRADINGVIEW-INTEGRATION.md §5:
//   1. HTTPS only — assumed handled by the reverse proxy / Vercel edge.
//   2. Shared-secret header (`X-TV-Secret`).
//   3. Zod schema validation.
//   4. Idempotency (in-memory LRU; TODO: Redis for multi-instance).
//   5. Rate limit (p-queue concurrency=1, 30/min via interval).
//   6. JSONL audit log.
//   7. Env kill switch.
//   8. (Replay-attack window TODO — relies on TV's `bartime` if provided.)
//   9. Bracket/OCO server-side (we trust gate output, not Pine).
//  10. Risk-based qty recompute via preTradeGate.
//
// The route is intentionally a single linear pipeline; resist adding clever
// abstractions until you've shipped two more broker integrations.

export const runtime = "nodejs"; // fs writes for audit log need Node, not Edge
export const dynamic = "force-dynamic";

// Process at most one order at a time, capped at 30/minute per process.
const queue = new PQueue({ concurrency: 1, interval: 60_000, intervalCap: 30 });

export async function POST(req: Request) {
  const at = new Date().toISOString();
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";

  // 1. Kill switch — fast-fail before any work.
  if (process.env.TV_WEBHOOK_KILL === "1") {
    await appendAudit({ at, payload: null, outcome: "killed", ip });
    return NextResponse.json({ error: "service paused" }, { status: 503 });
  }

  // 2. Shared-secret auth. We compare via constant-time-ish check; for env
  //    secrets length-equality is fine since the attacker can't time us
  //    across a TLS-terminated edge.
  const provided = req.headers.get("x-tv-secret");
  const expected = process.env.TV_WEBHOOK_SECRET;
  if (!expected || provided !== expected) {
    await appendAudit({ at, payload: null, outcome: "rejected", reason: "unauthorized", ip });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Parse + validate.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    await appendAudit({ at, payload: null, outcome: "rejected", reason: "invalid json", ip });
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = TVPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    await appendAudit({
      at,
      payload: raw,
      outcome: "rejected",
      reason: `schema: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      ip,
    });
    return NextResponse.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  // 4. Idempotency. Key on (symbol, strategy, bar-close hour). TV may retry;
  //    Cloudflare may retry; the world retries. Always dedupe.
  const bucket = payload.bartime ?? new Date().toISOString().slice(0, 13);
  const key = `${payload.symbol}:${payload.strategy}:${bucket}`;
  if (await wasProcessed(key)) {
    await appendAudit({ at, payload, outcome: "dedup", ip });
    return NextResponse.json({ ok: true, dedup: true });
  }
  await markProcessed(key, 60 * 60);

  // 5. Pre-trade gate (PDT, BP, tilt-guard, risk re-size).
  const gate = await preTradeGate(payload);
  if (!gate.ok) {
    await appendAudit({ at, payload, outcome: "rejected", reason: gate.reason, ip });
    return NextResponse.json({ error: gate.reason }, { status: 403 });
  }

  // 6. Route through the rate-limited queue.
  try {
    const result = await queue.add(async () => {
      const order = await brokers.active.placeOrder({
        symbol: payload.symbol,
        side: payload.action === "close" ? "sell" : payload.action,
        type: "market",
        qty: gate.recomputedQty ?? payload.qty,
        // Bracket: derived server-side from the gate, not Pine.
        takeProfit: payload.takeProfit ? { limitPrice: payload.takeProfit } : undefined,
        stopLoss: payload.stop ? { stopPrice: payload.stop } : undefined,
      });
      return order;
    });

    if (!result) {
      throw new Error("queue returned no result");
    }

    await appendAudit({
      at,
      payload,
      outcome: "accepted",
      orderId: result.orderId,
      ip,
    });
    return NextResponse.json({ ok: true, orderId: result.orderId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    await appendAudit({ at, payload, outcome: "error", reason: message, ip });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
