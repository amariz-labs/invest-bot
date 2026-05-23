#!/usr/bin/env node
// verify-udf — smoke-tests every UDF route on a running dev server.
//
// Run the dev server first (`pnpm dev` / `npm run dev`), then in another
// terminal: `pnpm tsx scripts/verify-udf.ts` (or
// `node --experimental-strip-types scripts/verify-udf.ts` on Node 22+).
//
// Each route's response is asserted against the TradingView UDF contract
// documented in design/TRADINGVIEW-INTEGRATION.md §3. The script prints
// PASS/FAIL per route and exits non-zero on any failure.

interface Check {
  name: string;
  run: () => Promise<void>;
}

const BASE = process.env.UDF_BASE ?? "http://localhost:3000";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  assert(res.ok, `${url} → HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    // /time returns text/plain — caller handles.
    const text = await res.text();
    return text as unknown as T;
  }
  return (await res.json()) as T;
}

const checks: Check[] = [
  {
    name: "GET /api/udf/time",
    run: async () => {
      const res = await fetch(`${BASE}/api/udf/time`);
      assert(res.ok, `time → HTTP ${res.status}`);
      const text = await res.text();
      const t = Number(text.trim());
      assert(Number.isFinite(t), `time body not a number: ${text}`);
      assert(t > 1_000_000_000, `time too small: ${t}`);
    },
  },
  {
    name: "GET /api/udf/config",
    run: async () => {
      const body = await fetchJson<{
        supports_search: boolean;
        supported_resolutions: string[];
      }>(`${BASE}/api/udf/config`);
      assert(body.supports_search === true, "config.supports_search must be true");
      assert(
        Array.isArray(body.supported_resolutions),
        "config.supported_resolutions must be array",
      );
      assert(
        body.supported_resolutions.includes("D"),
        `config.supported_resolutions missing "D": ${body.supported_resolutions.join(",")}`,
      );
    },
  },
  {
    name: "GET /api/udf/symbols?symbol=AAPL",
    run: async () => {
      const body = await fetchJson<{ ticker?: string; name?: string }>(
        `${BASE}/api/udf/symbols?symbol=AAPL`,
      );
      assert(
        Boolean(body.ticker || body.name),
        "symbols response missing both ticker and name",
      );
    },
  },
  {
    name: "GET /api/udf/search?query=AAP",
    run: async () => {
      const body = await fetchJson<unknown[]>(
        `${BASE}/api/udf/search?query=AAP&type=stock&exchange=&limit=5`,
      );
      assert(Array.isArray(body), "search response is not an array");
      assert(body.length >= 1, `search returned ${body.length} results, expected ≥1`);
    },
  },
  {
    name: "GET /api/udf/history?symbol=AAPL&resolution=D",
    run: async () => {
      const body = await fetchJson<{
        s: string;
        t?: number[];
        o?: number[];
        h?: number[];
        l?: number[];
        c?: number[];
        v?: number[];
      }>(
        `${BASE}/api/udf/history?symbol=AAPL&resolution=D&from=1672531200&to=1704067200`,
      );
      assert(body.s === "ok", `history.s = "${body.s}", expected "ok"`);
      assert(Array.isArray(body.t) && body.t.length > 0, "history.t empty");
      const len = body.t!.length;
      for (const k of ["o", "h", "l", "c", "v"] as const) {
        const arr = body[k];
        assert(Array.isArray(arr), `history.${k} not an array`);
        assert(arr!.length === len, `history.${k}.length=${arr!.length} expected ${len}`);
      }
    },
  },
];

async function main(): Promise<void> {
  console.log(`verify-udf → ${BASE}\n`);
  let failed = 0;
  for (const check of checks) {
    try {
      await check.run();
      console.log(`PASS  ${check.name}`);
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.log(`FAIL  ${check.name}\n        ${message}`);
    }
  }
  console.log(
    `\n${checks.length - failed}/${checks.length} passed${failed ? `, ${failed} failed` : ""}.`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("verify-udf crashed:", err);
  process.exit(2);
});
