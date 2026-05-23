// Documentation-as-test for RecordingAdapter.
//
// This file is intentionally NOT runnable — no test runner is installed in
// this package. It exists to (a) pin down expected behavior in code form and
// (b) act as a copy-paste starting point once the consumer app adopts vitest
// or node:test.
//
// To actually run, you'd `npm i -D vitest` then `npx vitest`.

/* eslint-disable @typescript-eslint/no-unused-vars */
// vitest

import { describe, it, expect, beforeEach } from "vitest"; // not installed; illustrative
import * as os from "node:os";
import * as path from "node:path";
import { promises as fs } from "node:fs";

import { SyntheticBrokerAdapter } from "./SyntheticBrokerAdapter";
import { RecordingBrokerAdapter, RecordingDataAdapter } from "./RecordingAdapter";
import { hashArgs, safeStringify, safeParse } from "./recording-fs";
import type { BrokerAdapter, OrderResult } from "../BrokerAdapter";

// ---------------------------------------------------------------------------

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "rec-fixt-"));
}

describe("RecordingAdapter — record-then-replay equals original", () => {
  it("captures placeOrder() result and replays without calling inner", async () => {
    const fixturesDir = await tmpDir();

    // ---- record pass ----
    const inner1 = new SyntheticBrokerAdapter({ startingCash: 100_000 });
    const recorder = new RecordingBrokerAdapter(inner1, { mode: "record", fixturesDir });
    const original = await recorder.placeOrder({
      symbol: "AAPL", side: "buy", type: "market", qty: 10,
      clientOrderId: "fixed-id-1",          // pin to keep the fixture deterministic
    });

    // ---- replay pass ----
    // Use a "throwing" inner to prove replay never delegates.
    const inner2: BrokerAdapter = new Proxy(new SyntheticBrokerAdapter({ startingCash: 1 }), {
      get(_t, p) {
        if (p === "name") return "synthetic";
        if (p === "mode") return "paper";
        return () => { throw new Error("inner should not be called in replay"); };
      },
    }) as BrokerAdapter;
    const replayer = new RecordingBrokerAdapter(inner2, { mode: "replay", fixturesDir });
    const replayed = await replayer.placeOrder({
      symbol: "AAPL", side: "buy", type: "market", qty: 10,
      clientOrderId: "fixed-id-1",
    });

    expect(replayed.orderId).toBe(original.orderId);
    expect(replayed.filledQty).toBe(original.filledQty);
  });

  it("hard-errors with a fix suggestion when fixture is missing", async () => {
    const fixturesDir = await tmpDir();
    const inner = new SyntheticBrokerAdapter({ startingCash: 1 });
    const replayer = new RecordingBrokerAdapter(inner, { mode: "replay", fixturesDir });
    await expect(replayer.getAccount()).rejects.toThrow(/mode="record" first/);
  });
});

describe("hashArgs — collision robustness for arg shapes", () => {
  it("produces stable hashes regardless of key order", () => {
    const a = hashArgs([{ symbol: "AAPL", qty: 10, side: "buy" }]);
    const b = hashArgs([{ side: "buy", qty: 10, symbol: "AAPL" }]);
    expect(a).toBe(b);
  });

  it("differentiates similar-but-different args", () => {
    const a = hashArgs([{ symbol: "AAPL", qty: 10 }]);
    const b = hashArgs([{ symbol: "AAPL", qty: 11 }]);
    expect(a).not.toBe(b);
  });

  it("is 12 hex chars (sha256 truncated)", () => {
    const h = hashArgs(["anything"]);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  // NOTE: at 12 hex chars (48 bits) two random calls have a ~5e-7 collision
  // chance — fine for per-(adapter,method) namespacing where the call-set
  // is small. If you push the recorder onto huge call sets (e.g. bar-level
  // backtests with thousands of distinct getBars() args) bump to 16 chars.
});

describe("BigInt + Date round-trip via safeStringify/safeParse", () => {
  it("preserves Date and BigInt through JSON", () => {
    const input = {
      ts: new Date("2026-05-23T12:00:00.000Z"),
      shares: 9_007_199_254_740_993n,                // outside Number range
      nested: { d: new Date("1970-01-01T00:00:00Z"), big: 42n },
    };
    const json = safeStringify(input);
    const out = safeParse<typeof input>(json);
    expect(out.ts).toBeInstanceOf(Date);
    expect(out.ts.toISOString()).toBe("2026-05-23T12:00:00.000Z");
    expect(typeof out.shares).toBe("bigint");
    expect(out.shares).toBe(9_007_199_254_740_993n);
    expect(out.nested.big).toBe(42n);
  });
});

describe("Stream JSONL record + replay", () => {
  it("captures emitted events to a session file and replays them in order", async () => {
    const fixturesDir = await tmpDir();
    // SyntheticBrokerAdapter.streamOrders emits as you call placeOrder().
    const inner = new SyntheticBrokerAdapter({ startingCash: 100_000 });
    const recorder = new RecordingBrokerAdapter(inner, { mode: "record", fixturesDir });

    const captured: string[] = [];
    const unsub = recorder.streamOrders(evt => captured.push(evt.type));
    await recorder.placeOrder({ symbol: "AAPL", side: "buy", type: "market", qty: 1 });
    await new Promise(r => setTimeout(r, 50));
    unsub();

    // ---- replay ----
    const replayer = new RecordingBrokerAdapter(inner, { mode: "replay", fixturesDir });
    const replayed: string[] = [];
    const unsub2 = replayer.streamOrders(evt => replayed.push(evt.type));
    await new Promise(r => setTimeout(r, 50));
    unsub2();

    expect(replayed).toEqual(captured);
  });
});

describe("DataAdapter wrapper (parity with broker wrapper)", () => {
  it("RecordingDataAdapter.getBars round-trips", async () => {
    // pseudo: const inner = new PolygonDataAdapter({ apiKey: "..." });
    // const rec = new RecordingDataAdapter(inner, { mode: "record", fixturesDir });
    // const bars = await rec.getBars({ symbol: "SPY", resolution: "D", from: 0, to: 1 });
    // const rep = new RecordingDataAdapter(inner, { mode: "replay", fixturesDir });
    // expect(await rep.getBars({ symbol: "SPY", resolution: "D", from: 0, to: 1 })).toEqual(bars);
  });
});

// ---------------------------------------------------------------------------
// Known-caveat tests (write these as you adopt the recorder):
//   - getAccount() equity drifts between record and replay → assert shape only.
//   - getQuote() last price is "now" — pin to a frozen clock for parity tests.
//   - clientOrderId duplicates: SyntheticBrokerAdapter generates UUIDs when
//     absent; pin a value to keep replays comparable.
