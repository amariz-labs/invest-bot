---
name: code-map
description: Token-efficient code-knowledge graph of the repo, wrapping the third-party `codegraph` tool. Use before multi-file refactors, when grep-spamming the `web/` tree to find callers, or when a sub-agent is about to read every file in a folder. Returns symbols, imports, exports, callers/callees as compact JSON instead of raw source.
---

# When to use

- Before any refactor that will touch **3 or more files** (rename, move, signature change).
- When you are about to `grep -r` for a symbol across the `web/` tree to find call sites.
- When a sub-agent is about to `Read` every file in a folder to "understand the layout" — that is exactly the cost code-map exists to cut.
- Before `broker-connect` adds a new adapter (who imports the interface?), before `alert-webhook` edits a route (who imports `lib/webhook/*`?), before `dashboard-build` rewrites a component (who imports it?).

For a **one-line symbol lookup** in a single file, a `grep` is still faster — don't reach for code-map.

# Purpose

`code-map` indexes a directory tree (TypeScript and Python primarily; the upstream parser also handles JS/TSX) into a queryable graph of:

- symbols (classes, functions, methods, constants),
- imports and exports,
- callers and callees per symbol,
- per-file dependency edges,
- and, when the upstream supports it, **per-symbol provenance comments** (the LLM-friendly docstring header codegraph writes during indexing).

Claude then queries the graph instead of grepping or re-reading whole files. The graph is structural, not semantic — it tells you *what calls what*, not *whether two types are compatible*.

# Upstream

[colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) — TypeScript, **MIT**, ~17.9k stars, runs **100% locally**. We **do not vendor** it; the user installs the CLI globally on first use. Project description: *"Pre-indexed code knowledge graph for Claude Code, Codex, Cursor, OpenCode, and Hermes Agent — fewer tokens, fewer tool calls, 100% local."*

See [`references/codegraph-quick-start.md`](./references/codegraph-quick-start.md) for install + the 5 most common queries, and [`references/integration-recipes.md`](./references/integration-recipes.md) for repo-specific recipes.

# Recipe

```
# one-time indexing (run once per checkout, again after big merges)
/code-map index --path web --output .claude/cache/code-map/web.graph

# re-index only dirty files since last run (cheap, run on session start)
/code-map refresh

# caller lookup — who calls BrokerAdapter.placeOrder?
/code-map who-calls --symbol "BrokerAdapter.placeOrder"

# import resolution — what does HeroChart.tsx pull in?
/code-map imports --file web/components/HeroChart.tsx

# refactor candidates — symbols nobody calls
/code-map orphans

# recursive dependency tree of a file
/code-map deps --file web/lib/brokers.ts

# terse digest of a directory — for handing to a sub-agent instead of file dumps
/code-map summarize --path design/code/adapters
```

# Install on first use

```bash
# Check the upstream README for the canonical package name and command:
#   https://github.com/colbymchenry/codegraph
# At time of writing the global install looks like:
npm i -g @codegraph/cli
```

If the published package name differs from `@codegraph/cli`, follow the install instructions in the upstream README rather than guessing.

# Integration with the Claude Code session

- Optional `SessionStart` hook in `.claude/settings.json` that runs `codegraph refresh` so the index is fresh when Claude starts work. Skip the hook on cold-cache machines where the first `index` has not run yet.
- Add `.claude/cache/code-map/` to `.gitignore`. The graph is a build artifact, not source.
- When you query, return the **smallest** answer that satisfies the question. Don't dump the whole graph into context — that defeats the purpose.
- Cache lives in `.claude/cache/code-map/<scope>.graph` per indexed root, so you can keep separate graphs for `web/`, `design/code/`, and the `.claude/skills/` markdown set (the last is best handled by regex, not code-map — see Don't).

# Pairing with other skills

- **`broker-connect`** — before scaffolding `lib/adapters/<broker>.ts`, ask `/code-map who-calls --symbol "BrokerAdapter"` to list the existing call sites that may need a method-signature touchup.
- **`alert-webhook`** — before editing `app/api/webhook/route.ts`, ask `/code-map imports --file app/api/webhook/route.ts` and `/code-map who-calls --symbol "verifyTradingViewSignature"` to bound the blast radius.
- **`dashboard-build`** — before touching a shared component (`HeroChart.tsx`, `LockSlider.tsx`, etc.), ask `/code-map who-calls --symbol "HeroChart"` so you know which pages re-render.
- **`tax-loss-harvest`** and **`portfolio-optimize`** — before changing the `Position` or `Account` type in `design/code/BrokerAdapter.ts`, `who-calls` on the field you're renaming.

# Output convention

- Query results go to **stdout** as compact JSON by default; pass `--format md` for human-readable markdown.
- Query results are **ephemeral** — they are not persisted under `reports/`. The persistent artifact is the `.graph` file under `.claude/cache/code-map/`.
- Keep result shape stable across queries so downstream skills can pipe into `jq` without surprises.

# Don't

- **Don't run on an unindexed path.** If the query errors with "no graph found", surface a clear `run /code-map index --path <path> first` message rather than silently grepping.
- **Don't ship the graph file in a commit** — `.claude/cache/code-map/` must be in `.gitignore`. The graph is machine- and checkout-specific.
- **Don't trust the graph after a `git pull`** until you've run `/code-map refresh`. Symbol renames in the incoming diff invalidate cached entries, and stale call-site lists will silently mislead a refactor.
- **Don't use code-map to answer questions a 1-line `grep` would solve faster.** "Where is the string `MAX_RETRIES` defined?" is `grep`-shaped, not graph-shaped.
- **Don't replace `Read` with `code-map` for understanding logic.** The graph is structural; it knows that `placeOrder` calls `validateOrder`, but it doesn't know *why*. For the why, read the file.
- **Don't query the markdown skill set with code-map** — it's a code parser, not a Markdown parser. Use a `grep` over `.claude/skills/**/SKILL.md` for cross-skill references.
- **Don't index `node_modules/`, `.next/`, `dist/`, or `.venv/`** — pass an exclude list (see upstream README). Indexing dependencies wastes minutes and tokens.
