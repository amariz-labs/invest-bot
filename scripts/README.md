# `scripts/` — top-level utilities

Standalone scripts that aren't tied to `web/` or `mcp/`. Each one is intended to be runnable with **Node 22+** and zero npm install — they use only the standard library and the repo's own files.

## Files

| File | What it does | How to run |
|---|---|---|
| [`lint-skills.ts`](./lint-skills.ts) | Audits every `.claude/skills/<name>/SKILL.md` against repo conventions: YAML frontmatter present, `name` matches folder, required sections, balanced code fences, internal-link integrity, "Install on first use" code blocks. Local equivalent of `anthropics/skill-creator`'s analyzer. | `node --experimental-strip-types scripts/lint-skills.ts`  <br/>`node --experimental-strip-types scripts/lint-skills.ts --json` (machine-readable)  <br/>`node --experimental-strip-types scripts/lint-skills.ts --fix-md` (write `SKILLS-AUDIT.md`)  <br/>`node --experimental-strip-types scripts/lint-skills.ts --strict` (exit 1 on errors — used by CI) |
| [`SKILLS-AUDIT.md`](./SKILLS-AUDIT.md) | Last snapshot of the linter output. Committed for convenience. Regenerate with `--fix-md`. | open in any markdown viewer |

## CI hook

The `.github/workflows/ci.yml` workflow runs the linter on every push and PR:

```yaml
- name: Lint skills (strict)
  run: node --experimental-strip-types scripts/lint-skills.ts --strict
```

Strict mode exits non-zero if any skill has an `error`-severity finding. Warnings and infos are allowed (they currently include the four "install-no-code" warnings on the meta-orchestrator skills — intentional, those don't pip-install anything).

## Adding a new check

Open `lint-skills.ts` and add a rule inside `lintSkill()`. Each rule reads `src` / `rest` / `fm` and calls `add(severity, ruleId, message)`. Keep rules cheap (regex over a single SKILL.md, no I/O).

Examples of rules worth adding later:
- Frontmatter `description` ends with a period.
- No skill links to a path that exists in `node_modules/`.
- Every SKILL.md with a `# Credits` section uses the agreed format.

## Why not put this under `web/scripts/` or `mcp/scripts/`?

Because the linter walks `../.claude/skills/` — it's a repo-wide tool, not a Next.js app concern. Anything finance-specific or runtime-dependent goes under `web/scripts/` (e.g. `verify-udf.ts`).
