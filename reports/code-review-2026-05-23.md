# Code Review — 2026-05-23

Scope: full `main` snapshot at HEAD `7eeb734` (working tree). Read-only review of `web/`, `mcp/`, `design/code/`, `.claude/skills/`, `profiles/`, and top-level docs. Focus per the brief: TS build correctness, discipline-gate integrity, cross-profile coherence, docs-vs-reality drift, security, code smells.

## Summary

- **24 findings: 5 critical, 9 major, 7 minor, 3 nit.**
- Headline: **The webhook receiver silently drops every alert** (Promise truthiness bug after the idempotency-store refactor), **both pre-trade gates fail-OPEN on a missing `data/state.yaml`** (the opposite of what `SECURITY.md` advertises), **the `web/` typecheck CI job will fail today** (missing `geist` dep, Promise-in-conditional misuse, `require()` in ESM), and **the documented `tilt-guard` `PreToolUse` hook is not actually registered in any profile** (the day-trading `settings.json` is a comment-only stub). Once these five land, the repo is in solid shape — adapter contracts, idempotency strategy, audit logging, and skill linting are all well-designed.

---

## Critical (must fix before next merge to main)

### C1. Webhook receiver silently dropped EVERY TradingView alert
- **File:** `web/app/api/tv-webhook/route.ts:81-85`
- **Issue:** After the `idempotency.ts` refactor that introduced the `IdempotencyStore` strategy (commits 2197eb9 / 8d0da31), `wasProcessed` and `markProcessed` became **async** (returning `Promise<boolean>` / `Promise<void>`). The route still calls them synchronously:

  ```ts
  if (wasProcessed(key)) {                      // ← Promise object → always truthy
    await appendAudit({ ... outcome: "dedup" }); 
    return NextResponse.json({ ok: true, dedup: true });
  }
  markProcessed(key, 60 * 60);                  // ← floating Promise; no await
  ```

  `if (Promise)` is `if (truthy)` for every payload — so **every webhook is treated as a duplicate** and the request short-circuits at line 82-83 with `{ ok: true, dedup: true }` before ever reaching `preTradeGate` or `brokers.active.placeOrder`. From the TradingView/operator side everything looks healthy (200 OK), but no order is ever placed.

  The `markProcessed` call on line 85 is unreachable when the `if` always returns; even if reordered it would be a floating Promise prone to write-after-read races against the next inbound request.

- **Why critical:** This is the load-bearing automation path the day-trading profile depends on. It looks like it works (200 OK with `dedup:true`); only the audit log reveals the silent drop. Worse: when the typo is fixed without re-thinking, the previous `MemoryIdempotencyStore`'s sync-shaped contract is lost and every fix will need an `await`.
- **Suggested fix:**

  ```ts
  if (await wasProcessed(key)) {
    await appendAudit({ at, payload, outcome: "dedup", ip });
    return NextResponse.json({ ok: true, dedup: true });
  }
  await markProcessed(key, 60 * 60);
  ```

  Add a TS-lint rule (Biome `noFloatingPromises` if/when supported, or `@typescript-eslint/no-floating-promises` if you migrate) so the next instance is caught at lint time.

### C2. Both pre-trade gates fail-OPEN on missing `data/state.yaml`
- **Files:**
  - `mcp/src/gates.ts:52-73, 141-164` (`readState()` returns `{}` when the file is absent; `status === "BLOCKED" || trade_today === false` is then false → passes)
  - `web/lib/webhook/gates.ts:20-32, 40-94` (same — `readTiltState()` returns `{}`, all conditional checks short-circuit because `state.tradesDisabledUntil`, `state.dailyLossCap`, etc. are `undefined`)
- **Issue:** `SECURITY.md:33` claims "`tilt-guard` PreToolUse hook fail-closed if `data/state.yaml` is stale (> 4h old)". The actual implementation **fails open** when the file is missing — exactly the most likely case for a new install or after a `git clean` / fresh deploy. `tilt-guard/SKILL.md:89` also says "Don't let the hook silently pass when state is stale (`updated_at > 5min ago`) — fail closed", but no such staleness check exists in either gate.
- **Why critical:** This is the discipline gate the entire day-trading profile is built around. A user who has never run `/pre-trade-checklist` (or whose CI doesn't seed `state.yaml`) gets ZERO behavioral protection while the docs tell them they have a fail-closed gate. Day 1 in live mode is exactly when this matters most.
- **Suggested fix:** In both gates, when `existsSync(STATE_YAML)` is false, throw the same `TRADE_BLOCKED` / return the same `{ ok: false, reason: "..." }` you do when `status === "BLOCKED"`. Then add an `updated_at` staleness check: if `Date.now() - parse(state.updated_at) > 4h` (configurable via `MCP_STATE_MAX_AGE_MS`), throw / reject the same way. Sample for `mcp/src/gates.ts`:

  ```ts
  function readState(): Record<string, ...> | null {
    if (!existsSync(STATE_YAML)) return null;
    ...
  }
  // in preTradeGate:
  const state = readState();
  if (state === null) {
    throw new GateError("STATE_MISSING",
      "data/state.yaml not found — run /pre-trade-checklist before placing orders");
  }
  const updatedAt = Date.parse(String(state["updated_at"] ?? ""));
  const maxAgeMs = Number(process.env["MCP_STATE_MAX_AGE_MS"] ?? 4 * 60 * 60 * 1000);
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > maxAgeMs) {
    throw new GateError("STATE_STALE",
      `state.yaml is missing updated_at or older than ${maxAgeMs}ms`);
  }
  ```

### C3. `tilt-guard` `PreToolUse` hook is NOT actually registered anywhere
- **Files:**
  - `profiles/day-trading/.claude/settings.json` — single `_comment` key, no `hooks` block.
  - `.claude/skills/tilt-guard/SKILL.md:42-55` — documents the hook block but provides only sample JSON.
  - No `check.py` exists at `.claude/skills/tilt-guard/check.py` (the file the hook command would invoke).
- **Issue:** `CLAUDE.md:9` and `README.md:15` both claim "the day-trading profile is the only profile that ships [the `tilt-guard` `PreToolUse`] hook enabled by default." The profile's `.claude/settings.json` actually ships **only an explanatory `_comment`** ("Leaving the hook block empty here is intentional until you've decided which broker / MCP tool names to gate"). The `check.py` script the doc references doesn't exist. So:
  1. Nothing blocks order-placement MCP tool calls at the harness layer.
  2. The hook matcher in `SKILL.md` is `mcp__broker__place_order|mcp__binance__order|mcp__ccxt__create_order` — but the actual MCP tool exposed by this repo is just `place_order`. Even if the hook were enabled, the matcher wouldn't fire on this repo's own server.
- **Why critical:** Doc drift on a discipline gate is worse than no doc — the user thinks they're protected. The persona memory at `profiles/day-trading/.claude/CLAUDE.md` is explicit: "Never bypass the `tilt-guard` `PreToolUse` hook." There is no hook to bypass.
- **Suggested fix:**
  1. Add a `hooks` block to `profiles/day-trading/.claude/settings.json` with a matcher that includes this repo's server name (the MCP server name prefix is `@financial-planner/mcp-server`, so the harness will expose tools as `mcp__financial-planner__place_order` — confirm by inspecting the harness's tool-name convention):
     ```json
     {
       "hooks": {
         "PreToolUse": [
           {
             "matcher": "mcp__financial-planner__place_order",
             "command": "python3 .claude/skills/tilt-guard/check.py"
           }
         ]
       }
     }
     ```
  2. Ship `check.py` in `.claude/skills/tilt-guard/` (read `data/state.yaml`, exit nonzero on `status==BLOCKED` or stale/missing — fail closed).
  3. Update the matcher in `SKILL.md` to mention `mcp__financial-planner__place_order` as the canonical entry, with the other matchers as opt-in extras.

### C4. `web/` typecheck CI will fail — missing `geist` dependency
- **File:** `web/app/layout.tsx:3` (`import { GeistMono } from "geist/font/mono";`) + `web/tailwind.config.ts:45` references `var(--font-geist-mono)`.
- **Issue:** `geist` is not listed in `web/package.json` dependencies (verified via `grep`). On a fresh `npm install`, `tsc --noEmit` will fail with `Cannot find module 'geist/font/mono'`. The comment on line 10 even acknowledges this risk ("Geist's `next/font` package isn't installed by default — if `geist` isn't available, swap to `next/font/google`'s JetBrains_Mono") but the fix wasn't applied.
- **Why critical:** Breaks the `web-check` CI job; blocks every PR.
- **Suggested fix:** Either:
  - Add `"geist": "1.3.1"` (or current) to `web/package.json` dependencies, OR
  - Swap to `next/font/google`:
    ```ts
    import { Inter, JetBrains_Mono } from "next/font/google";
    const jetBrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
    // then className={`${inter.variable} ${jetBrainsMono.variable}`}
    ```
  The second option keeps the existing `--font-geist-mono` CSS variable so `tailwind.config.ts` doesn't need a follow-up edit.

### C5. `idempotency.ts` uses `require()` inside an ESM (`"type": "module"`-equivalent) Next.js app
- **File:** `web/lib/webhook/idempotency.ts:73-75`
  ```ts
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@upstash/redis") as { Redis: new (cfg: RedisIdempotencyConfig) => UpstashRedisLike };
  this.client = new mod.Redis({ url: cfg.url, token: cfg.token });
  ```
- **Issue:** `web/tsconfig.json` uses `"module": "esnext"`, `"moduleResolution": "bundler"`. There is no global `require` in browser/Edge bundles, and even in the Node runtime route (`tv-webhook/route.ts` uses `runtime = "nodejs"`), Next.js compiles modules to ESM where `require` is not a binding. At minimum `tsc --noEmit` will flag `Cannot find name 'require'`; at runtime, the Redis store path will throw on first construction.
- **Why critical:** As soon as anyone sets `UPSTASH_REDIS_REST_URL`, `getDefaultStore()` instantiates `RedisIdempotencyStore`, which immediately throws on `require()` — taking the entire webhook route down. The fallback (MemoryIdempotencyStore) won't be reached because the constructor throws *before* assignment to `_default`.
- **Suggested fix:** Use a top-level static import (the dep is already in `web/package.json:32` — there's no reason to lazy-require it):
  ```ts
  import { Redis } from "@upstash/redis";
  // ...
  this.client = new Redis({ url: cfg.url, token: cfg.token });
  ```
  Drop the `UpstashRedisLike` shim if you trust the SDK types, or keep it as the call-site narrowing (use `as unknown as UpstashRedisLike`). The "keep dep optional at compile time" comment is moot because the dep is in `dependencies` (not `optionalDependencies`).

---

## Major (should fix this iteration)

### M1. `mcp/src/types.ts` `DataAdapter` interface drifts from `web/lib/types.ts`
- **Files:**
  - `mcp/src/types.ts:146-165` — `subscribeStatus?` and `lastTickAt?` are **optional**; `getSessions` is **required**.
  - `web/lib/types.ts:158-181` — `subscribeStatus` and `lastTickAt` are **required**; `getSessions` is **absent**.
  - `design/code/DataAdapter.ts:108-158` — canonical: `subscribeStatus`/`lastTickAt` required, `getSessions` required.
- **Issue:** Three "synced" copies of the same interface have diverged. The web copy is missing `getSessions` entirely (which `design/code/adapters/YFinanceDataAdapter.ts:261` etc. do implement); the MCP copy makes `subscribeStatus`/`lastTickAt` optional, contradicting design intent (the README says "Handlers are called synchronously with the current status on subscribe").
- **Why major:** Any concrete adapter swapped into `web/lib/data.ts` will satisfy the local interface but break the canonical contract (e.g. consumer code that depends on `subscribeStatus` being synchronous-on-subscribe). And consumers of the MCP adapter can't rely on these methods existing — defeats the purpose of adding them.
- **Suggested fix:** Pick one canonical shape (the design/code copy is the doc'd source of truth) and re-mirror it byte-for-byte in both `web/lib/types.ts` and `mcp/src/types.ts`. Add a CI check: a tiny script that reads all three files, extracts the `DataAdapter`/`BrokerAdapter` blocks, and fails the build if they don't byte-equal.

### M2. `web/lib/brokers.ts` placeholder broker mints `clientOrderId: undefined` on `OrderResult` — schema violation
- **File:** `web/lib/brokers.ts:53-60`
  ```ts
  return {
    orderId: `syn-${this.orderCounter}`,
    clientOrderId: req.clientOrderId,   // ← undefined when req.clientOrderId is undefined
    ...
  };
  ```
- **Issue:** `OrderResult.clientOrderId` is typed `?: string`. With `noUncheckedIndexedAccess: true` in `web/tsconfig.json` and (currently) `exactOptionalPropertyTypes: false`, this compiles, but it's a footgun: enabling `exactOptionalPropertyTypes` (recommended) would immediately break this. The MCP-side `SyntheticBrokerAdapter.placeOrder` (`mcp/src/adapters.ts:212-218`) gets this right with a spread guard. Note also that the same file's `PlaceholderSyntheticBroker` only fills market orders at price `100` (line 52), which makes any preTradeGate "buying power" math meaningless against the synthetic.
- **Suggested fix:** Mirror the MCP-side spread guard:
  ```ts
  return {
    orderId: `syn-${this.orderCounter}`,
    ...(req.clientOrderId !== undefined ? { clientOrderId: req.clientOrderId } : {}),
    status: "filled",
    ...
  };
  ```
  And consider unifying with `mcp/src/adapters.ts`'s richer `SyntheticBrokerAdapter` (tracks cash/positions, uses `req.limitPrice ?? req.stopPrice ?? 100`).

### M3. MCP idempotency key construction collides across (broker, account) — but symbol-namespaced only
- **File:** `mcp/src/gates.ts:81-84`
  ```ts
  function idempotencyKey(req: OrderRequest): string {
    const minuteBucket = Math.floor(Date.now() / 60_000);
    return `${req.symbol}:${req.side}:${req.qty}:${minuteBucket}`;
  }
  ```
- **Issue:** Two independent agents (e.g. dashboard + scripted alert) submitting the *same* `(symbol, side, qty)` in the same minute will collide and one will be rejected with `DUPLICATE_ORDER` even when they're intentional independent orders. Also: `type`, `limitPrice`, `clientOrderId`, `option` legs are not part of the key, so two different option contracts on the same underlying would collide. And there's no broker/account dimension — if a user runs two MCP servers with two brokers from one harness, the in-memory `Map` is per-process so this isn't a hard collision, but the key shape would still drop signal.
- **Why major:** Day-trading workflows do legitimately repeat the same `(symbol, side, qty)` at minute boundaries (e.g. averaging in on a 1-minute scalp). The current shape will trip false-positive `DUPLICATE_ORDER` errors.
- **Suggested fix:** Include `clientOrderId` (when present, that IS the user's idempotency token — short-circuit on it), `type`, and a small `limitPrice` bucket. Or, more simply: if `clientOrderId` is present, use *only* that as the key. Sample:
  ```ts
  function idempotencyKey(req: OrderRequest): string {
    if (req.clientOrderId) return `coid:${req.clientOrderId}`;
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const optionKey = req.option ? `:${req.option.expiration}:${req.option.strike}${req.option.right}` : "";
    const priceKey = req.limitPrice ? `:lp${req.limitPrice.toFixed(2)}` : req.stopPrice ? `:sp${req.stopPrice.toFixed(2)}` : "";
    return `${req.symbol}:${req.side}:${req.type}:${req.qty}${optionKey}${priceKey}:${minuteBucket}`;
  }
  ```

### M4. Webhook idempotency key includes hour-bucket fallback but not the *minute* — minute-bar Pine strategies will dedup against themselves
- **File:** `web/app/api/tv-webhook/route.ts:79-80`
  ```ts
  const bucket = payload.bartime ?? new Date().toISOString().slice(0, 13);
  const key = `${payload.symbol}:${payload.strategy}:${bucket}`;
  ```
- **Issue:** `.slice(0, 13)` keeps `YYYY-MM-DDTHH`, dropping minutes. A 1-minute Pine strategy that fires three signals at `10:01`, `10:02`, `10:03` and forgets to set `bartime` (TV's `time` variable) will produce the same key for all three and dedup to one. The opposite of the intent.
- **Why major:** Silently drops valid signals. The route returns `{ok:true, dedup:true}` so it doesn't even surface as an error. This combines badly with C1 above.
- **Suggested fix:** Slice to minute or include the bar interval and bartime explicitly. If the payload schema requires `bartime` on minute-bar alerts, enforce it in `schema.ts` (`z.string().datetime()`). At a minimum:
  ```ts
  const bucket = payload.bartime ?? new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  ```

### M5. Audit logs append `payload: any` un-redacted — secrets-in-payload leak risk
- **Files:** `web/lib/webhook/auditlog.ts:11-18` + every call site in `tv-webhook/route.ts`.
- **Issue:** `AuditEntry.payload: any` is appended raw. If a misconfigured Pine alert ever includes the `TV_WEBHOOK_SECRET` (e.g. in the body during a debug session, or a copy-paste accident), it lands in `data/webhook-log/YYYY-MM-DD.jsonl` unredacted, which is then synced off-host per the day-trading EXTRACT checklist (line 179: "Backup `data/journal/` off-host"). Headers aren't logged today, but the type signature invites it.
- **Why major:** Long-tail credential leakage. The audit log is also one of the only persistent stores from this codebase and it has no rotation policy.
- **Suggested fix:**
  1. Narrow `payload` to `Partial<TVPayload> | { raw?: unknown }` (still `unknown`, but typed).
  2. Add a `redact()` pass on a small allowlist of dangerous key names (`secret`, `token`, `apiKey`, `password`, `authorization`, `x-tv-secret`).
  3. Add a rotation hint in the docs (`logrotate` example) — currently only mentioned in `EXTRACT.md`.

### M6. `mcp/src/gates.ts` `readState()` does not detect a stale file
- **File:** `mcp/src/gates.ts:52-73, 141-164`
- **Issue:** Independent of C2 (file missing), even when `state.yaml` exists, the gate never checks `updated_at`. A `state.yaml` written at 03:00 on Monday for a green session will *still pass* on Friday. The SECURITY.md claim is "fail-closed if > 4h old"; the code does not implement that at all.
- **Suggested fix:** Already covered in C2's fix snippet — same staleness check applies whether the file is missing or just old.

### M7. `placeOrder` doesn't propagate `clientOrderId` to MCP synthetic when it's the user's only dedup token
- **File:** `mcp/src/adapters.ts:174-221` (already spreads `clientOrderId` correctly) — actually fine. False alarm. **Withdrawn.**

### M7. `lint-skills.ts` will fail `tsc --strict --noUncheckedIndexedAccess` if you ever run it through `tsc`
- **File:** `scripts/lint-skills.ts:44, 95-96, 102`
  ```ts
  if (m) fm[m[1].toLowerCase()] = m[2].trim();    // m[1], m[2] are `string | undefined`
  const target = join(folderAbs, m[1]);            // m[1] could be undefined
  if (m[1].length < 1 || m[2].length < 1) ...
  ```
- **Issue:** Today CI runs the script with `node --experimental-strip-types`, which strips types without type-checking — so this compiles. But the codebase convention (per `AGENTS.md:106`) is "TypeScript strict; no `any`". `noUncheckedIndexedAccess` is enabled in both `web/tsconfig.json` and `mcp/tsconfig.json`. If you ever add a `scripts/tsconfig.json` or a `tsc --noEmit scripts/` job, this breaks.
- **Suggested fix:** Either add narrowing (`const [, k, v] = m ?? [];` then guard), or use non-null assertions consistently (`m![1]!`) and add a `// eslint-disable` comment explaining why regex guarantees the captures exist.

### M8. `SKILLS-AUDIT.md` is stale (and CI re-running the linter today produces a different `iv-surface` line count)
- **File:** `scripts/SKILLS-AUDIT.md:23` says `iv-surface 108 lines`; live linter today reports `116 lines`. Generated timestamp: `2026-05-23T12:26:25.820Z`. Other counts unchanged.
- **Issue:** The audit is mostly current (totals still match: 0 errors / 4 warnings / 1 info) but specific counts are drifting. Either re-generate on every push (cheap — already running in CI) or stop checking line counts into the repo.
- **Suggested fix:** Add a step to the CI workflow: `node --experimental-strip-types scripts/lint-skills.ts --fix-md && git diff --exit-code scripts/SKILLS-AUDIT.md` — fails the build when the audit is out of sync with main.

### M9. `web/.env.example` and `mcp/` lack a `.env.example` — MCP side is undocumented at the env level
- **Files:** `web/.env.example` (exists, clean) and `mcp/` — **no `.env.example`** (verified via `ls`).
- **Issue:** `mcp/README.md` documents `BROKER`, `DATA_REALTIME`, `MCP_RISK_CEILING_PCT`, `MCP_KILL`, `MCP_REPO_ROOT`, plus per-broker creds (`ALPACA_KEY_ID`, etc.), but a new operator has nothing to copy. Asymmetric with `web/.env.example`.
- **Why major:** Secrets-management is the riskiest part of going live; ergonomics here matter. Currently a user has to read the README and hand-assemble.
- **Suggested fix:** Add `mcp/.env.example` mirroring the doc:
  ```bash
  BROKER=synthetic
  DATA_REALTIME=synthetic
  DATA_HISTORICAL=
  MCP_RISK_CEILING_PCT=0.01
  MCP_KILL=0
  MCP_REPO_ROOT=
  SYNTHETIC_STARTING_CASH=100000
  # ALPACA_KEY_ID=
  # ALPACA_SECRET_KEY=
  # ALPACA_MODE=paper
  # IBKR_HOST=127.0.0.1
  # IBKR_PORT=7497
  # IBKR_CLIENT_ID=1
  # IBKR_MODE=paper
  # TRADIER_TOKEN=
  # TRADIER_ACCOUNT=
  # TRADIER_MODE=paper
  # POLYGON_KEY=
  # TWELVEDATA_KEY=
  # YFINANCE_BRIDGE_URL=http://localhost:3000/api/yfinance
  ```
  Add `mcp/.gitignore` line for `.env*` if not already covered by the root `.gitignore`.

### M10. Webhook payload schema rejects valid TradingView tickers
- **File:** `web/lib/webhook/schema.ts:10-13`
  ```ts
  symbol: z.string().min(1).max(8)
    .regex(/^[A-Z][A-Z.\-]{0,7}$/, "uppercase ticker, optional . or -"),
  ```
- **Issue:** Rejects:
  - Class shares like `BRK.B` (passes — 5 chars), but `BRK.A` also passes (fine).
  - `NASDAQ:AAPL` (TV ships exchange-prefixed symbols by default; 11 chars + `:` — rejected on length AND on regex).
  - Forex pairs like `EURUSD` (passes), but TV emits `OANDA:EURUSD` — rejected.
  - Crypto like `BTCUSD` (passes), but TV emits `BINANCE:BTCUSDT` — rejected.
- **Why major:** Most TV Pine `alert()` calls emit `{{ticker}}` which often includes the exchange prefix. The schema will reject most real-world alerts.
- **Suggested fix:** Match the MCP-side schema (`mcp/src/schema.ts:53-57`) which is more permissive:
  ```ts
  symbol: z.string().min(1).max(32).regex(/^[A-Z0-9.\-/:]+$/i, "..."),
  ```
  And document in the route comment that the receiver normalizes (`payload.symbol.split(":").pop()!`) before passing to the broker.

---

## Minor (next-iteration; create issues)

### N1. `HeroChart.tsx` hard-codes color tokens that exist in CSS — color drift risk
- **File:** `web/components/HeroChart.tsx:47-53`
  ```ts
  const BG = "#0B0B12";
  const TEXT = "#A0A0A8";
  const GRID = "#1A1A20";
  const AMBER = "#F0B429";
  const UP = "#22C55E";
  const DOWN = "#EF4444";
  const VOL = "#A78BFA66";
  ```
- **Issue:** `app/globals.css` defines `--success`, `--danger`, `--warning`, `--bg`, `--surface-elevated`, accents. The chart hard-codes hex values that don't match (e.g. `--bg` is `240 22% 6%` HSL which is roughly `#0C0D14`, not `#0B0B12`; `--success` is `142 71% 45%` ≈ `#1ECB5A`, not `#22C55E`). Lightweight Charts doesn't accept CSS variables, so the workaround is to read them at runtime via `getComputedStyle`, but the simpler move is to colocate the source-of-truth.
- **Suggested fix:** Move these to `web/lib/tokens.ts` (or extract from `tokens.css`) and import. At minimum, comment with the matching token name so the next theme update doesn't desync.

### N2. `Watchlist.tsx` synthesizes `earningsInDays`, `float`, `beta` from a hash
- **File:** `web/components/Watchlist.tsx:60-64, 104-107`
- **Issue:** `deterministicNumber()` fakes earnings dates, float, and beta from the symbol hash. Useful for the placeholder; problematic if anyone ships it. There's no TODO marker; no test for "is this real or fake data".
- **Suggested fix:** Either:
  - Return `null` from `buildRow` for these fields and let the cells render `—`, OR
  - Add a `// PLACEHOLDER` block-comment and a runtime warning in dev mode.

### N3. `Watchlist.tsx` magic numbers should be design tokens
- **File:** `web/components/Watchlist.tsx:53-58`
  ```ts
  const SPARK_BARS = 30;
  const ANNOUNCE_DELTA = 0.0025;
  const DOM_THROTTLE_MS = 1000;
  const STALE_ROW_MS = 15_000;
  const STALE_CHECK_MS = 1_000;
  ```
- **Issue:** These are reasonable as in-file constants, but `STALE_ROW_MS = 15_000` mirrors the design/code/adapters/README.md "Connection status protocol" 15s threshold. Drift risk. Same for `HeroChart.tsx:56` (`HISTORY_DAYS = 180`).
- **Suggested fix:** Move shared time thresholds to `web/lib/constants.ts` (or `lib/timings.ts`) with a comment pointing at the brief.

### N4. Repeated formatter inline-Setup pattern in `KpiTile`
- **File:** `web/components/KpiTile.tsx:17-26` — `formatValue()` is a tiny helper that could just be one line at the call site, but more importantly: the delta-glyph + color-class logic is also repeated in `Watchlist.tsx:128-131, 161-165`.
- **Suggested fix:** Extract `web/lib/format.ts` helpers `signedColorClass(value)` and `signGlyph(sign)` so the colors/glyphs are colocated with the formatters.

### N5. `web/app/api/udf/history/route.ts` blindly maps potentially-undefined fields
- **File:** `web/components/HeroChart.tsx:192-207` — `body.o![i] as number` etc. The `!` non-null assertion + `as` cast is OK given the guard on line 182, but the per-element index access still violates `noUncheckedIndexedAccess` in spirit. With the placeholder adapter today there's always-equal-length arrays; with a future broken UDF response, you get silent `NaN` propagation.
- **Suggested fix:** Validate equal lengths upfront and bail on mismatch:
  ```ts
  const n = body.t.length;
  if (body.o.length !== n || body.h.length !== n || body.l.length !== n || body.c.length !== n) {
    throw new Error("UDF history response length mismatch");
  }
  ```

### N6. `mcp/src/gates.ts` "minimal YAML reader" silently misparses arrays/maps/multiline
- **File:** `mcp/src/gates.ts:48-73`
- **Issue:** The 30-line regex YAML reader only handles flat scalar keys. The example state.yaml in `tilt-guard/SKILL.md:26-38` contains only flat keys (good), but if `pre-trade-checklist` ever emits a nested map (e.g. `quotas: { trades: 5, risk: 0.02 }`), the reader silently truncates. The hand-roll exists to "avoid pulling in a full YAML parser" but `mcp/package.json` already pulls in `zod` — adding `yaml` is 30 KB. Web side already uses `yaml`.
- **Suggested fix:** Use `yaml` (npm `yaml`, MIT, ~30 KB). One-line replacement:
  ```ts
  import YAML from "yaml";
  ...
  return (YAML.parse(text) ?? {}) as Record<string, ...>;
  ```
  Removes 25 lines of regex; less surface to get wrong.

### N7. `mcp/src/tools/orders.ts` `replace_order` `additionalProperties: true` weakens JSON-schema validation
- **File:** `mcp/src/tools/orders.ts:117` — `patch: { type: "object", additionalProperties: true }` while the Zod schema `OrderRequestPatchSchema` is `.strict()`. Inconsistent — JSON-schema clients may submit fields that the Zod validator then rejects with a confusing error.
- **Suggested fix:** Hand-write the JSON schema for `patch` matching the order request properties (you can copy the same `properties` block from `place_order`), or generate it from Zod with `zod-to-json-schema` (one-time codegen, not a runtime dep).

---

## Nits (purely cosmetic)

### NIT1. README claims `web/` is "32 files"
- **File:** `README.md:40`
- **Issue:** Live count: `web/` has 27 files (excl. config). Old number. The README's `What's scaffolded` list in `web/README.md` looks right but the parent README is stale.
- **Suggested fix:** Drop the file count, or run `find web -type f -not -path 'web/node_modules/*' | wc -l` and update.

### NIT2. Two TODO comments in production code paths
- **Files:**
  - `web/app/api/tv-webhook/route.ts:14` (`TODO: Redis for multi-instance` — actually solved already by the new strategy; comment is now stale)
  - `web/app/api/tv-webhook/route.ts:18` (`(Replay-attack window TODO ...)`)
  - `web/lib/brokers.ts:116, 120, 124` (`TODO: dynamic-import ./adapters/alpaca` etc.)
  - `web/lib/data.ts:135, 138, 144` (same pattern)
- **Suggested fix:** Convert each to a tracked issue, replace inline `TODO` with `// see issue #NN`. The lint-skills.ts rule `R9 (todo)` only checks SKILL.md; nothing flags TODOs in code today.

### NIT3. Cross-profile routing is mostly consistent but has one missing reciprocation
- **Files:** `profiles/long-term/CLAUDE.md:24` routes intraday to `../day-trading/`. `profiles/day-trading/CLAUDE.md:36` routes long-horizon to `../long-term/`. Reciprocal. **Good.**
- **However:** `profiles/options/CLAUDE.md` routes stock-only setups to `../swing/` or `../day-trading/`. `profiles/swing/CLAUDE.md:33` routes options to `../options/`. **Good.**
- **`profiles/swing/CLAUDE.md:22`** says "`tilt-guard` — kept available but not default". This implicitly says the swing profile *could* use it. But the persona doc has no instruction on what to do if `data/state.yaml` is missing in swing mode — and per the day-trading EXTRACT, "without state.yaml all order tools fail closed" is the design. So swing-mode users who enable tilt-guard inherit the C2 bug.
- **Suggested fix:** Add a one-liner to `profiles/swing/CLAUDE.md` noting that the tilt-guard PreToolUse hook is not registered in this profile by default and that if the user opts in they should run `/pre-trade-checklist init` once to seed `state.yaml`. Same fix as C3 second-order — but cosmetic for swing since tilt-guard isn't default-on there.

---

## What's GOOD (worth preserving)

- **Adapter pattern is genuinely well-designed.** `BrokerAdapter` / `DataAdapter` cleanly abstract Alpaca / IBKR / Tradier / Polygon / yfinance, with `SerialQueue` + `BrokerError`/`DataError` envelopes for uniform error handling. The "Connection status protocol" doc in `design/code/adapters/README.md` is particularly well-thought-out — the synchronous-on-subscribe contract avoids the typical "UI blank for first 200ms" anti-pattern.
- **RecordingAdapter is a quietly excellent piece of infra.** The VCR-style record/replay/passthrough modes with hash-stable JSON fixtures + JSONL stream files is exactly the right level of abstraction for offline broker testing. Atomic write-via-temp-rename, `Date`/`BigInt` tagged round-trip, missing-fixture-with-helpful-message — all the small details right.
- **Pre-trade gate STRUCTURE is sound** even though both implementations have the C2/M6 fail-open bug. The ordering (kill switch → tilt-guard → PDT → BP → risk ceiling → idempotency → audit) is correct and matches the design doc. Fix the staleness check and this hardens up to production-grade.
- **Idempotency strategy abstraction (`IdempotencyStore` interface, Memory ↔ Redis swap via `getDefaultStore()`)** is the right shape for a multi-instance webhook receiver. Just the call sites need to await it (C1).
- **CI workflow is appropriately scoped** — three parallel jobs, no shared state, fast skill-lint (no installs), explicit `--legacy-peer-deps` for React 19 timing. The `--strict` skill-lint mode gates errors only, not warnings — pragmatic.
- **Skill linter (`scripts/lint-skills.ts`)** is a solid local-equivalent of the `skill-creator` analyzer. Rules R1-R10 catch the right things; output formatting is readable.
- **Profile separation is thoughtful and consistent** — the `_comment`-only `settings.json` files explicitly document why hooks are absent in each (especially the day-trading note about choosing tool names first, and the crypto warning about not reusing equity-session hooks). The cross-profile routing in each `CLAUDE.md` is largely symmetric.
- **MCP server design follows real MCP conventions** — `setRequestHandler(ListToolsRequestSchema, ...)`, lazy SSE import, tool registry with single source of truth, Zod-validated args, `McpError` mapping for gate errors with `[CODE]` prefix for client pattern-matching. Stderr-only logging keeps stdout clean for the transport.
- **`web/lib/format.ts` Intl-cached formatters** correctly addresses the "EU/US separator mix" issue called out in the design brief. Cache keys are right (locale + currency + precision).
- **Docs honesty.** `AGENTS.md "Known limitations / open follow-ups"` (line 93-99) candidly lists what's not done (vendor wiring, IV-surface builders, streaming over MCP, `code-map diff`). That's better practice than the docs-vs-reality drift in C3/C4.

---

## Recommended ordering

Priority queue. **The first three are no-debate must-fix-before-merge** (a green CI + a working webhook + an honestly-fail-closed gate is the floor).

1. **C1** — un-break the webhook receiver (one `await` keyword, but irreversibly silent until shipped). Pair with a test against `MemoryIdempotencyStore` that asserts `wasProcessed` is `true` only after `markProcessed`.
2. **C4** — get `web-check` CI green (one line in `package.json` or six lines swapping to JetBrains Mono). Without this, every other fix is blocked from review.
3. **C2 + M6** — close the fail-open gate in both `mcp/src/gates.ts` and `web/lib/webhook/gates.ts` (treat missing file AND stale `updated_at` as a hard `STATE_MISSING`/`STATE_STALE` block). This is the load-bearing safety claim the rest of the system rests on.
4. **C5** — replace `require("@upstash/redis")` with a static import. One-line; unblocks Redis-mode users who would currently crash on first call.
5. **C3** — actually register the `tilt-guard` PreToolUse hook in `profiles/day-trading/.claude/settings.json` + ship `check.py`. Without this the discipline-gate narrative in CLAUDE.md is a fiction.
6. **M1** — single-source the `BrokerAdapter`/`DataAdapter` interfaces. Pick `design/code/` as canonical, byte-mirror to `web/lib/types.ts` and `mcp/src/types.ts`, add a CI check.
7. **M4 + M10** — webhook schema + idempotency key minute-bucket fix. Both small, both needed for any real Pine alert traffic.
8. **M3** — MCP idempotency key shape (use `clientOrderId` when present; include type + price for collision avoidance). Avoids false-positive duplicates in averaging-in flows.
9. **M9 + M5** — `mcp/.env.example` + redact-on-audit. Ops hygiene.
10. **M2 + M7 (the renumbered lint-skills strict)** — `clientOrderId` spread guard; clean up `lint-skills.ts` for future `tsc` integration.
11. **M8** — make `SKILLS-AUDIT.md` regen-and-diff in CI so drift can't accumulate.
12. **All N* and NIT*** — pick up alongside other touches. NIT3 deserves a one-liner in `profiles/swing/CLAUDE.md`; N6 (use real YAML parser in MCP gates) is a freebie once the bigger gate work is in.

After items 1-5 land, the next merge to `main` is genuinely safe to call "the receiver works, the gate fails closed, the CI is honest, and the discipline hook is real." Items 6-12 are quality-of-life and hardening.
