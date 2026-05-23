import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { brokers } from "@/lib/brokers";
import type { TVPayload } from "./schema";

// Pre-trade gates. Block the order if any of these fail. The goal is that a
// runaway Pine script can NEVER bypass these — the receiver has the final
// word, not TradingView. See TRADINGVIEW-INTEGRATION.md §5 hardening item 10
// and EQUITIES-DASHBOARD.md §3 pre-trade checks.

interface TiltState {
  // Shape we expect from data/state.yaml, written by the tilt-guard skill.
  tradesDisabledUntil?: string; // ISO
  dailyLossCap?: number;
  realizedLossToday?: number;
  maxRiskPctPerTrade?: number; // default 0.01 (1%)
  updated_at?: string; // ISO; staleness check
  trade_today?: boolean;
  status?: string; // "OK" | "BLOCKED"
}

const STATE_PATH = () => path.join(process.cwd(), "data", "state.yaml");
const STATE_MAX_AGE_MS = Number(process.env.STATE_MAX_AGE_MS ?? 4 * 60 * 60 * 1000);

// Returns null when state.yaml is missing or unreadable, so the caller can
// fail-CLOSED rather than silently passing through an empty object. SECURITY.md
// promises fail-closed behaviour; the previous `return {}` did the opposite.
function readTiltState(): TiltState | null {
  const file = STATE_PATH();
  if (!existsSync(file)) return null;
  try {
    const raw = readFileSync(file, "utf8");
    return (YAML.parse(raw) ?? null) as TiltState | null;
  } catch {
    // Treat corrupt YAML as a hard failure — better to refuse the order than
    // silently treat an unreadable state as "no overrides".
    return null;
  }
}

export interface GateResult {
  ok: boolean;
  reason?: string;
  recomputedQty?: number;
}

export async function preTradeGate(payload: TVPayload): Promise<GateResult> {
  // 0. Fail-CLOSED: refuse the order if state.yaml is missing, corrupt, or stale.
  //    The discipline gate must NEVER pass an order through when it doesn't
  //    know whether the user is on tilt. Run /pre-trade-checklist daily.
  const state = readTiltState();
  if (state === null) {
    return {
      ok: false,
      reason:
        "state.yaml missing or unreadable — run /pre-trade-checklist before placing orders (fail-CLOSED per SECURITY.md)",
    };
  }
  if (state.updated_at) {
    const updatedAtMs = Date.parse(state.updated_at);
    if (Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > STATE_MAX_AGE_MS) {
      const ageH = ((Date.now() - updatedAtMs) / 3_600_000).toFixed(1);
      return {
        ok: false,
        reason: `state.yaml is stale (${ageH}h old, threshold ${STATE_MAX_AGE_MS / 3_600_000}h) — re-run /pre-trade-checklist`,
      };
    }
  }
  // Explicit BLOCKED status from pre-trade-checklist also stops the order.
  if (state.status && state.status.toUpperCase() === "BLOCKED") {
    return { ok: false, reason: "state.status=BLOCKED by pre-trade-checklist" };
  }
  if (state.trade_today === false) {
    return { ok: false, reason: "state.trade_today=false — no trades today" };
  }
  const now = new Date();

  // 1. tilt-guard kill window.
  if (state.tradesDisabledUntil) {
    const until = new Date(state.tradesDisabledUntil);
    if (Number.isFinite(until.valueOf()) && until > now) {
      return { ok: false, reason: `tilt-guard: trades disabled until ${state.tradesDisabledUntil}` };
    }
  }

  // 2. Daily realized-loss cap.
  if (
    state.dailyLossCap !== undefined &&
    state.realizedLossToday !== undefined &&
    state.realizedLossToday >= state.dailyLossCap
  ) {
    return { ok: false, reason: "tilt-guard: daily loss cap hit" };
  }

  // 3. Account checks — PDT, buying power. If broker is unconfigured we
  //    fail-closed (we'd rather refuse than yolo into a broken broker SDK).
  let account: Awaited<ReturnType<typeof brokers.active.getAccount>>;
  try {
    account = await brokers.active.getAccount();
  } catch (err) {
    return { ok: false, reason: `broker unavailable: ${(err as Error).message}` };
  }

  if (account.patternDayTrader && account.daytradesRemaining === 0) {
    return { ok: false, reason: "PDT: no day trades remaining" };
  }

  // Conservative BP estimate. If Pine sent a price use it; otherwise we let
  // the broker do the final check at fill time and only ensure non-negative BP.
  const estPrice = payload.price ?? 0;
  const grossCost = estPrice * payload.qty;
  if (payload.action !== "close" && grossCost > account.buyingPower) {
    return { ok: false, reason: `insufficient buying power (need ~${grossCost}, have ${account.buyingPower})` };
  }

  // 4. Risk-based size recompute. Treat Pine's `qty` as a suggestion; if the
  //    payload supplied a stop, derive qty from R-sizing. The R-formula:
  //      qty = (equity * riskPct) / abs(entry - stop)
  let recomputedQty: number | undefined;
  const riskPct = payload.riskPct ?? state.maxRiskPctPerTrade ?? 0.01;
  if (payload.stop && payload.price && payload.stop !== payload.price) {
    const stopDistance = Math.abs(payload.price - payload.stop);
    const riskDollars = account.equity * riskPct;
    recomputedQty = Math.max(1, Math.floor(riskDollars / stopDistance));
  }

  return { ok: true, recomputedQty };
}
