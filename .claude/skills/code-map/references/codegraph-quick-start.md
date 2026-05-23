# codegraph quick-start

Concise pointer card for using [`colbymchenry/codegraph`](https://github.com/colbymchenry/codegraph) from inside the `code-map` skill. Not a substitute for the upstream README — when in doubt, follow upstream.

## Install

See the upstream README at <https://github.com/colbymchenry/codegraph>. The repo is TypeScript / MIT and runs entirely locally. Do **not** vendor the source; install the published CLI globally and call it as a subprocess.

After install, verify with `codegraph --version` (or the equivalent the README documents).

## The five most common queries

Output shapes below are illustrative — confirm against the upstream's `--help` and adjust if the actual CLI flag names differ.

### 1. Index a tree

```
codegraph index --path web --output .claude/cache/code-map/web.graph \
  --exclude node_modules,.next,dist,.venv,coverage
```

One-time on a fresh checkout. Re-run when you add a new top-level folder.

### 2. `who-calls` — find callers of a symbol

```
codegraph who-calls --graph .claude/cache/code-map/web.graph \
  --symbol "BrokerAdapter.placeOrder"
```

Example output shape:

```json
{
  "symbol": "BrokerAdapter.placeOrder",
  "callers": [
    { "file": "web/app/api/webhook/route.ts", "line": 142, "context": "await adapter.placeOrder(req)" },
    { "file": "web/lib/orders/submit.ts", "line": 88,  "context": "return broker.placeOrder(order)" }
  ]
}
```

### 3. `imports` — what does this file pull in?

```
codegraph imports --graph .claude/cache/code-map/web.graph \
  --file web/components/HeroChart.tsx
```

```json
{
  "file": "web/components/HeroChart.tsx",
  "imports": [
    { "from": "lightweight-charts", "names": ["createChart", "ColorType"] },
    { "from": "@/lib/data",          "names": ["fetchBars"] },
    { "from": "@/design/code/tokens", "names": ["tokens"] }
  ]
}
```

### 4. `orphans` — symbols nobody calls

```
codegraph orphans --graph .claude/cache/code-map/web.graph --min-confidence 0.9
```

```json
[
  { "symbol": "formatPnlLegacy", "file": "web/lib/format.ts", "line": 212 },
  { "symbol": "OldChartShim",    "file": "web/components/_legacy/OldChartShim.tsx" }
]
```

Verify each by hand — exports consumed only via dynamic import or string-keyed lookup will show up as false positives.

### 5. `summarize` — terse directory digest

```
codegraph summarize --graph .claude/cache/code-map/web.graph \
  --path design/code/adapters --format md
```

Returns a markdown digest (symbol list per file, public surface) suitable for handing to a sub-agent in place of dumping every file.

## Performance notes

- Large monorepos (>50k files) — scope indexing to the directory you'll actually refactor, not the repo root. Per-scope graphs are cheap.
- Many JS deps — always exclude `node_modules`, `.next`, `dist`, `.venv`, `coverage`, `.turbo`, `target` (Rust), `__pycache__`.
- TSX with very large JSX trees — indexing is slower than plain TS; expect ~2-3x. Consider excluding test fixtures.
- Re-indexing — `codegraph refresh` only re-parses dirty files since the last index. Use this on `SessionStart`, not full `index`.

## License

MIT — safe to depend on. We don't bundle it; we shell out to the global CLI, so our repo stays unencumbered.
