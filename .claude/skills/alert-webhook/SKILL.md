---
name: alert-webhook
description: Set up a hardened TradingView (or generic) alert-webhook receiver in Next.js that validates payloads, gates against tilt-guard / PDT / buying power, and routes orders through the BrokerAdapter. Invoke when the user wants to "auto-execute TradingView alerts", "webhook receiver", "alert-to-broker bridge".
---

# When to use

User wants TradingView (Premium) alerts to fire real orders without manual intervention. Adversarial setting — alerts can fire many times per second; idempotency and gating are required.

# Upstream references

- [`marketcalls/openalgo`](https://github.com/marketcalls/openalgo) — AGPL-3.0 multi-broker reference (gross design template; do not vendor under SaaS).
- [`robswc/tradingview-webhooks-bot`](https://github.com/robswc/tradingview-webhooks-bot) — GPL-3.0 Flask example.
- [`hackingthemarkets/tradingview-interactive-brokers`](https://github.com/hackingthemarkets/tradingview-interactive-brokers) — IBKR demo.

Design pattern documented in [`design/TRADINGVIEW-INTEGRATION.md`](../../../design/TRADINGVIEW-INTEGRATION.md) §5.

# Recipe

```
/alert-webhook init --broker alpaca --gate tilt,pdt,buying-power
/alert-webhook test --payload sample.json
/alert-webhook kill                  # flips TV_WEBHOOK_KILL=1
```

### `init`

Scaffolds:
- `app/api/tv-webhook/route.ts` — the receiver (template below).
- `lib/webhook/schema.ts` — Zod schema for the payload.
- `lib/webhook/gates.ts` — pre-trade checks (tilt, PDT, BP, risk%).
- `lib/webhook/idempotency.ts` — replay-attack + retry dedup (use Redis if available, falls back to in-memory LRU for solo use).
- `lib/webhook/auditlog.ts` — appends every event to `data/webhook-log/YYYY-MM-DD.jsonl`.
- `.env.example` with `TV_WEBHOOK_SECRET`, `TV_WEBHOOK_KILL`, broker creds.

Receiver template:

```ts
// app/api/tv-webhook/route.ts
import { PayloadSchema } from "@/lib/webhook/schema";
import { gatePreTrade } from "@/lib/webhook/gates";
import { wasProcessed, markProcessed } from "@/lib/webhook/idempotency";
import { audit } from "@/lib/webhook/auditlog";
import { brokers } from "@/lib/brokers";

export async function POST(req: Request) {
  if (process.env.TV_WEBHOOK_KILL === "1") return new Response("kill switch", { status: 503 });

  const secret = req.headers.get("x-tv-secret");
  if (secret !== process.env.TV_WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });

  const raw = await req.json();
  const parsed = PayloadSchema.safeParse(raw);
  if (!parsed.success) {
    await audit({ stage: "validate", ok: false, raw, issues: parsed.error.issues });
    return Response.json({ error: "invalid", issues: parsed.error.issues }, { status: 400 });
  }

  const key = `${parsed.data.symbol}:${parsed.data.strategy}:${Math.floor(Date.now() / 60_000)}`;
  if (await wasProcessed(key)) {
    await audit({ stage: "dedup", ok: true, key, payload: parsed.data });
    return Response.json({ ok: true, dedup: true });
  }
  await markProcessed(key, 60 * 60);

  const gate = await gatePreTrade(parsed.data);
  if (!gate.ok) {
    await audit({ stage: "gate", ok: false, reason: gate.reason, payload: parsed.data });
    return Response.json({ error: gate.reason }, { status: 403 });
  }

  try {
    const result = await brokers.active.placeOrder({
      symbol: parsed.data.symbol,
      side: parsed.data.action === "buy" ? "buy" : "sell",
      type: "market",
      qty: gate.recomputedQty,   // gate returns risk-adjusted qty, not Pine's
    });
    await audit({ stage: "submit", ok: true, payload: parsed.data, result });
    return Response.json({ ok: true, orderId: result.orderId });
  } catch (err: any) {
    await audit({ stage: "broker_error", ok: false, error: err.message });
    return Response.json({ error: "broker", message: err.message }, { status: 502 });
  }
}
```

### Hardening checklist (also in TRADINGVIEW-INTEGRATION.md §5)

- [x] HTTPS only
- [x] Shared secret in header, rotate quarterly
- [x] Zod schema validation
- [x] Idempotency (1h TTL on `symbol:strategy:minute`)
- [x] Rate limit (30 orders/min/strategy via `p-queue`)
- [x] Full audit log to JSONL
- [x] Single-env-var kill switch
- [x] Replay-attack window (reject TV timestamps > 30s old)
- [x] Server-side bracket / stop (don't trust Pine to manage exits)
- [x] Recompute qty from risk-based sizing using current account equity
- [x] tilt-guard gate (reads `data/state.yaml`)
- [x] PDT gate (reads broker account)

# Output convention

```
app/api/tv-webhook/route.ts
lib/webhook/{schema,gates,idempotency,auditlog}.ts
data/webhook-log/YYYY-MM-DD.jsonl
.env.example
```

# Install on first use

```bash
npm i zod p-queue
```

# Don't

- Don't trust the Pine-supplied `qty` — always recompute from current account equity and the user's configured `risk_pct`.
- Don't ack the webhook before the broker confirms — TV will retry on non-2xx, which is what you want if your broker call fails.
- Don't accept HTTPS without checking your reverse proxy isn't downgrading.
- Don't include account keys or PII in audit logs — only payload + decision + broker order ID.
- Don't expose `/api/tv-webhook` publicly without the secret. The path is not the secret.
- Don't deploy without practicing the kill switch.
