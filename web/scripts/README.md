# web/scripts

One-off Node scripts that operate against the running web app or its data
layer. None of these are part of the Next.js build.

## verify-udf.ts

Smoke-tests every TradingView UDF route on a running dev server against the
contract documented in `design/TRADINGVIEW-INTEGRATION.md` §3.

### Usage

Start the dev server first:

```sh
npm run dev
```

In another terminal, run the verifier:

```sh
# via the package script:
npm run verify-udf

# or directly with tsx:
npx tsx scripts/verify-udf.ts

# or on Node ≥22 with native TS stripping (no extra deps):
node --experimental-strip-types scripts/verify-udf.ts
```

By default it hits `http://localhost:3000`. Override with `UDF_BASE`:

```sh
UDF_BASE=https://staging.example.com npm run verify-udf
```

### Exit codes

- `0` — all routes pass.
- `1` — one or more assertions failed.
- `2` — the script itself crashed (network error, JSON parse, etc.).

### Routes checked

| Route | Assertion |
|---|---|
| `GET /api/udf/time` | `Number(body) > 1_000_000_000` |
| `GET /api/udf/config` | `supports_search === true` && resolutions include `"D"` |
| `GET /api/udf/symbols?symbol=AAPL` | response has `ticker` or `name` |
| `GET /api/udf/search?query=AAP` | array, length ≥ 1 |
| `GET /api/udf/history?...` | `s === "ok"`, all of `t/o/h/l/c/v` equal length |
