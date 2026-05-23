// Pre-trade gates — the same hardening checklist from
// design/TRADINGVIEW-INTEGRATION.md §5, applied uniformly to every
// place_order call routed through the MCP server.
//
//   1. Kill switch (MCP_KILL=1)
//   2. tilt-guard / pre-trade-checklist state in data/state.yaml
//   3. PDT (patternDayTrader + daytradesRemaining)
//   4. Buying power
//   5. Per-trade risk ceiling (stopDistance * qty <= equity * ceiling)
//   6. Idempotency (symbol + side + qty + minute bucket, 60s TTL)
//   7. Audit log to data/mcp-log/YYYY-MM-DD.jsonl

import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Account, OrderRequest } from "./types.js";

// ---------------------------------------------------------------------------
// Locate the repo root so data/state.yaml resolves no matter where the user
// runs this MCP server from. Walk up from this file's location.
// ---------------------------------------------------------------------------
function repoRoot(): string {
  // dist/gates.js -> /abs/path/to/mcp/dist  => repo is two levels up.
  // src/gates.ts (dev) -> /abs/path/to/mcp/src => repo is two levels up.
  // Allow override via MCP_REPO_ROOT.
  const override = process.env["MCP_REPO_ROOT"];
  if (override) return resolve(override);
  // import.meta.url isn't available in CJS but we're ESM here.
  const here = new URL(".", import.meta.url).pathname;
  // here = .../mcp/dist/ or .../mcp/src/  -> repo = ../..
  return resolve(here, "..", "..");
}

const ROOT = repoRoot();
const STATE_YAML = resolve(ROOT, "data", "state.yaml");
const LOG_DIR = resolve(ROOT, "data", "mcp-log");

// ---------------------------------------------------------------------------
// GateError — thrown by gates; mapped to McpError in tools/orders.ts.
// ---------------------------------------------------------------------------
export class GateError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GateError";
  }
}

// ---------------------------------------------------------------------------
// Minimal YAML reader — we only consume a few top-level scalar keys from
// state.yaml (status, trade_today, tilt_score, updated_at). Pulling in a full
// YAML parser would balloon the dep tree for this one file.
// ---------------------------------------------------------------------------
function readState(): Record<string, string | number | boolean> {
  if (!existsSync(STATE_YAML)) return {};
  const text = readFileSync(STATE_YAML, "utf8");
  const out: Record<string, string | number | boolean> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    const key = m[1]!;
    let raw = m[2]!.trim();
    // strip inline comments
    const hash = raw.indexOf(" #");
    if (hash >= 0) raw = raw.slice(0, hash).trim();
    // strip surrounding quotes
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1);
    }
    if (raw === "true" || raw === "false") out[key] = raw === "true";
    else if (raw !== "" && !Number.isNaN(Number(raw))) out[key] = Number(raw);
    else out[key] = raw;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Idempotency LRU (in-memory, process-local). Keys expire after 60s.
// ---------------------------------------------------------------------------
const IDEMPOTENCY_TTL_MS = 60_000;
const idempotency = new Map<string, number>();

function idempotencyKey(req: OrderRequest): string {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  return `${req.symbol}:${req.side}:${req.qty}:${minuteBucket}`;
}

function checkIdempotency(req: OrderRequest): void {
  // GC expired entries.
  const now = Date.now();
  for (const [k, t] of idempotency) {
    if (now - t > IDEMPOTENCY_TTL_MS) idempotency.delete(k);
  }
  const key = idempotencyKey(req);
  if (idempotency.has(key)) {
    throw new GateError(
      "DUPLICATE_ORDER",
      `idempotency hit: a ${req.side} ${req.qty} ${req.symbol} order was placed within the last minute`,
    );
  }
  idempotency.set(key, now);
}

// ---------------------------------------------------------------------------
// Audit log — newline-delimited JSON, one file per day.
// ---------------------------------------------------------------------------
function audit(entry: Record<string, unknown>): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const path = resolve(LOG_DIR, `${day}.jsonl`);
    appendFileSync(path, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch (err) {
    // Audit-log failure must not block trades; surface to stderr only.
    process.stderr.write(`[mcp] audit log write failed: ${(err as Error).message}\n`);
  }
}

// ---------------------------------------------------------------------------
// Public: killSwitchActive — used by every tool, not just place_order.
// ---------------------------------------------------------------------------
export function killSwitchActive(): boolean {
  return process.env["MCP_KILL"] === "1";
}

export function assertNotKilled(toolName: string): void {
  if (killSwitchActive()) {
    audit({ tool: toolName, decision: "killed" });
    throw new GateError("KILL_SWITCH", "MCP_KILL=1 — all tool calls are disabled.");
  }
}

// ---------------------------------------------------------------------------
// Public: preTradeGate — runs before every placeOrder.
// ---------------------------------------------------------------------------
export interface PreTradeContext {
  req: OrderRequest;
  account: Account;
  /** Last known price for the symbol; used to estimate buying-power impact. */
  estPrice?: number;
}

export function preTradeGate(ctx: PreTradeContext): void {
  const { req, account, estPrice } = ctx;
  const decision: Record<string, unknown> = {
    tool: "place_order",
    symbol: req.symbol,
    side: req.side,
    qty: req.qty,
    type: req.type,
  };

  // 1. tilt-guard / pre-trade-checklist state
  const state = readState();
  const status = String(state["status"] ?? "");
  const tradeToday = state["trade_today"];
  if (status === "BLOCKED" || tradeToday === false) {
    decision["decision"] = "blocked_by_tilt_guard";
    decision["state_status"] = status;
    decision["state_trade_today"] = tradeToday;
    audit(decision);
    throw new GateError(
      "TRADE_BLOCKED",
      `tilt-guard or pre-trade-checklist is blocking trades today (status=${status || "unset"}, trade_today=${tradeToday ?? "unset"}).`,
    );
  }

  // 2. PDT
  if (account.patternDayTrader && account.daytradesRemaining !== null && account.daytradesRemaining <= 0) {
    decision["decision"] = "blocked_pdt";
    audit(decision);
    throw new GateError(
      "PDT_EXCEEDED",
      "pattern-day-trader: zero daytrades remaining in the 5-session window.",
    );
  }

  // 3. Buying power — only meaningful when we have a price.
  const px = estPrice ?? req.limitPrice ?? req.stopPrice;
  if (px && px > 0) {
    const notional = req.qty * px;
    if (notional > account.buyingPower) {
      decision["decision"] = "blocked_buying_power";
      decision["notional"] = notional;
      decision["buyingPower"] = account.buyingPower;
      audit(decision);
      throw new GateError(
        "INSUFFICIENT_BUYING_POWER",
        `notional ${notional.toFixed(2)} exceeds buying power ${account.buyingPower.toFixed(2)}.`,
      );
    }
  }

  // 4. Per-trade risk ceiling — stopDistance * qty <= equity * ceiling.
  const ceiling = parseFloat(process.env["MCP_RISK_CEILING_PCT"] ?? "0.01");
  const stopPx = req.stopLoss?.stopPrice ?? req.stopPrice;
  if (stopPx && px && px > 0) {
    const stopDistance = Math.abs(px - stopPx);
    const riskDollar = stopDistance * req.qty;
    const cap = account.equity * ceiling;
    if (riskDollar > cap) {
      decision["decision"] = "blocked_risk_ceiling";
      decision["riskDollar"] = riskDollar;
      decision["cap"] = cap;
      audit(decision);
      throw new GateError(
        "RISK_CEILING_EXCEEDED",
        `risk per trade ${riskDollar.toFixed(2)} exceeds ceiling ${cap.toFixed(2)} (${(ceiling * 100).toFixed(2)}% of equity).`,
      );
    }
  }

  // 5. Idempotency — last so we don't burn the slot on a request that would
  // have failed an earlier gate.
  checkIdempotency(req);

  decision["decision"] = "pass";
  audit(decision);
}

// Audit a non-trade tool invocation (success or error). Cheap; called once per
// tool call from server.ts.
export function auditTool(entry: {
  tool: string;
  ms: number;
  ok: boolean;
  error?: string;
}): void {
  audit(entry);
}
