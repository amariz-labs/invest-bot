# code-map integration recipes

Repo-specific patterns for pairing `code-map` with our skill pack. Each recipe shows the exact query and the expected refactor surface.

---

## Recipe 1 — "Before adding a new BrokerAdapter, who imports the interface?"

When `broker-connect` is about to scaffold `lib/adapters/<broker>.ts`, we need to know which callers will see the new adapter's surface area — and whether they depend on the abstract `BrokerAdapter` interface or on a specific concrete class.

```
/code-map who-calls --symbol "BrokerAdapter"
/code-map who-calls --symbol "BrokerAdapter.placeOrder"
/code-map who-calls --symbol "BrokerAdapter.getAccount"
/code-map imports --file design/code/BrokerAdapter.ts
```

Expected refactor surface:

- `web/lib/brokers.ts` — adapter wiring; will need a new `case "<broker>"` branch.
- `web/app/api/webhook/route.ts` — invokes `placeOrder`; check whether the new adapter's order-type coverage matches.
- `web/lib/orders/submit.ts` — same.
- Anything under `web/app/(dashboard)/**` that reads positions — confirm the new adapter implements `getPositions` with the same `Position` shape.

If `who-calls` returns a call site outside these three areas, stop and investigate before scaffolding — there may be a coupling the docs don't capture.

---

## Recipe 2 — "Before deleting a deprecated skill, are any other skills referencing it?"

`code-map` does **not** index markdown, so SKILL.md cross-references need a regex pass.

```bash
# 1. Code references — does any code in web/ or design/code/ import the skill's output files?
/code-map who-calls --symbol "<symbol-the-skill-emits>"

# 2. Markdown cross-references — does any other SKILL.md mention it?
grep -rn "<deprecated-skill-name>" .claude/skills/ --include='*.md'

# 3. Settings hooks — is the skill wired into a SessionStart / PreToolUse hook?
grep -n "<deprecated-skill-name>" .claude/settings.json .claude/settings.local.json 2>/dev/null
```

Only proceed with deletion when all three return empty (or only the skill's own folder).

---

## Recipe 3 — "Find dead code in `web/lib/`"

```
/code-map index --path web --output .claude/cache/code-map/web.graph
/code-map orphans --min-confidence 0.9
```

Then verify each candidate **by hand** because orphan detection has known false-positive modes:

- Exports consumed via `import()` (dynamic) — code-map may or may not resolve these depending on the upstream version.
- Exports consumed via string-keyed registry lookup (`registry["fooHandler"]`) — not resolvable without semantic analysis.
- Public API surface intentionally exported for downstream consumers (re-exports from a package entrypoint) — orphans inside the package, not actually dead.

For each candidate, run a final `grep -rn "<symbol>" web/ --include='*.ts*'` to confirm zero references before deleting.

---

## Recipe 4 — "Sub-agent is about to read every file in `design/code/adapters`"

Instead of letting the sub-agent burn tokens on full-file reads:

```
/code-map summarize --path design/code/adapters --format md
```

Hand the markdown digest to the sub-agent. It will have the public surface — class names, method signatures, exports — without the bodies. If the sub-agent then needs a specific method's logic, it can `Read` that one file directly.

---

## Notes on what these recipes do **not** cover

- **Type compatibility** between two interfaces — code-map is structural; use `tsc --noEmit` or `mypy` for that.
- **Runtime call graphs** that depend on values (handler maps, plugin registries) — code-map sees the registration site but not the dispatch.
- **Markdown / YAML / JSON config references** — not parsed; use regex.
