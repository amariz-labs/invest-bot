#!/usr/bin/env node
// SKILL.md linter for the Financial-Planner repo.
//
// Walks .claude/skills/ and checks each SKILL.md against the conventions
// documented in .claude/skills/README.md. Run with:
//
//   node --experimental-strip-types scripts/lint-skills.ts            # Node 22+
//   npx tsx scripts/lint-skills.ts                                    # any Node
//   node --experimental-strip-types scripts/lint-skills.ts --json     # emit JSON
//   node --experimental-strip-types scripts/lint-skills.ts --fix-md   # write SKILLS-AUDIT.md
//
// This is our local equivalent of anthropics' skill-creator analyzer.
// It's deliberately lenient: warnings, not failures, unless --strict is passed.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

type Severity = "error" | "warn" | "info";
interface Finding { severity: Severity; rule: string; message: string }
interface SkillReport { folder: string; path: string; lines: number; findings: Finding[] }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const SKILLS_DIR = join(REPO, ".claude", "skills");

function listSkillFolders(): string[] {
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => join(SKILLS_DIR, e.name))
    .filter(p => existsSync(join(p, "SKILL.md")));
}

function parseFrontmatter(src: string): { fm: Record<string, string>; rest: string; ok: boolean } {
  if (!src.startsWith("---\n")) return { fm: {}, rest: src, ok: false };
  const end = src.indexOf("\n---", 4);
  if (end === -1) return { fm: {}, rest: src, ok: false };
  const block = src.slice(4, end);
  const rest = src.slice(end + 4).replace(/^\n/, "");
  const fm: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-z_-]+):\s*(.+)$/i);
    if (m) fm[m[1].toLowerCase()] = m[2].trim();
  }
  return { fm, rest, ok: true };
}

function lintSkill(folderAbs: string): SkillReport {
  const path = join(folderAbs, "SKILL.md");
  const src = readFileSync(path, "utf8");
  const folder = basename(folderAbs);
  const findings: Finding[] = [];
  const add = (severity: Severity, rule: string, message: string) =>
    findings.push({ severity, rule, message });

  const lines = src.split("\n").length;

  // R1: YAML frontmatter present
  const { fm, rest, ok: fmOk } = parseFrontmatter(src);
  if (!fmOk) add("error", "frontmatter-missing", "SKILL.md must start with YAML `---` frontmatter");

  // R2: `name` present and matches folder
  if (!fm.name) add("error", "name-missing", "frontmatter must include `name:`");
  else if (fm.name !== folder) add("error", "name-mismatch", `frontmatter name "${fm.name}" must equal folder "${folder}"`);

  // R3: `description` present, reasonable length, starts with capital
  const desc = fm.description ?? "";
  if (!desc) add("error", "description-missing", "frontmatter must include `description:`");
  else {
    if (desc.length < 40) add("warn", "description-short", `description is ${desc.length} chars; recommend ≥ 40`);
    if (desc.length > 600) add("warn", "description-long", `description is ${desc.length} chars; recommend ≤ 600`);
    if (!/^[A-Z]/.test(desc)) add("warn", "description-capital", "description should start with a capital letter");
  }

  // R4: required sections
  const hasSection = (re: RegExp) => re.test(rest);
  if (!hasSection(/^#\s*When to use\b/m) && !hasSection(/^#\s*What it does\b/m) && !hasSection(/^#\s*Purpose\b/mi))
    add("warn", "no-when-to-use", "no `# When to use` / `# What it does` / `# Purpose` section found");
  if (!hasSection(/^#\s*Don'?t\b/m) && !hasSection(/^##\s*"?Don'?t/m))
    add("warn", "no-dont", "no `# Don't` section — every skill should document anti-patterns");

  // R5: balanced fenced code blocks
  const fences = (src.match(/^```/gm) ?? []).length;
  if (fences % 2 !== 0) add("error", "code-fences-unbalanced", `odd number of code fences (${fences}); did you forget a closing \`\`\`?`);

  // R6: file length sanity
  if (lines < 30) add("warn", "too-short", `${lines} lines; skills shorter than 30 lines often lack context`);
  if (lines > 350) add("info", "long", `${lines} lines; consider splitting references into a /references folder`);

  // R7: internal links to other skills resolve
  const linkRe = /\]\((\.\.\/[^)\s]+\/SKILL\.md)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(rest)) !== null) {
    const target = join(folderAbs, m[1]);
    if (!existsSync(target)) add("error", "broken-link", `broken link to ${m[1]}`);
  }

  // R8: external GitHub links should look real
  const ghRe = /\(https:\/\/github\.com\/([^/)\s]+)\/([^/)\s#]+)/g;
  while ((m = ghRe.exec(rest)) !== null) {
    if (m[1].length < 1 || m[2].length < 1) add("warn", "suspicious-link", `suspicious github link: ${m[0]}`);
  }

  // R9: TODO / FIXME / XXX leftovers
  if (/\b(TODO|FIXME|XXX)\b/.test(rest)) add("info", "todo", "contains TODO/FIXME/XXX — intentional?");

  // R10: "Install on first use" section paired with a code block
  const installIdx = rest.search(/^#\s*Install on first use\b/m);
  if (installIdx !== -1) {
    const after = rest.slice(installIdx, installIdx + 400);
    if (!/```/.test(after)) add("warn", "install-no-code", "`# Install on first use` section but no code block in next 400 chars");
  }

  return { folder, path, lines, findings };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function main() {
  const args = new Set(process.argv.slice(2));
  const reports = listSkillFolders().map(lintSkill).sort((a, b) => a.folder.localeCompare(b.folder));

  const totals = { errors: 0, warns: 0, infos: 0 };
  for (const r of reports) for (const f of r.findings) totals[`${f.severity}s` as keyof typeof totals]++;

  if (args.has("--json")) {
    process.stdout.write(JSON.stringify({ totals, reports }, null, 2) + "\n");
    process.exit(totals.errors > 0 && args.has("--strict") ? 1 : 0);
  }

  // Pretty stdout report
  const RESET = "\x1b[0m";
  const RED = "\x1b[31m";
  const YEL = "\x1b[33m";
  const BLU = "\x1b[34m";
  const DIM = "\x1b[2m";
  const BLD = "\x1b[1m";

  const lines: string[] = [];
  const pushBoth = (s: string) => { lines.push(s); console.log(s); };
  const stripAnsi = (s: string) => s.replace(/\x1b\[\d+m/g, "");

  pushBoth(`${BLD}SKILL.md audit — ${reports.length} skills${RESET}`);
  pushBoth(`${DIM}${SKILLS_DIR}${RESET}`);
  pushBoth("");

  for (const r of reports) {
    const tag = r.findings.length === 0 ? `${DIM}clean${RESET}` :
      r.findings.some(f => f.severity === "error") ? `${RED}error${RESET}` :
      r.findings.some(f => f.severity === "warn") ? `${YEL}warn${RESET}` :
      `${BLU}info${RESET}`;
    pushBoth(`  ${tag.padEnd(20)} ${r.folder.padEnd(30)} ${DIM}${r.lines} lines${RESET}`);
    for (const f of r.findings) {
      const color = f.severity === "error" ? RED : f.severity === "warn" ? YEL : BLU;
      pushBoth(`      ${color}${f.severity}${RESET} ${DIM}${f.rule}${RESET}  ${f.message}`);
    }
  }

  pushBoth("");
  pushBoth(`${BLD}totals${RESET}  ${RED}errors=${totals.errors}${RESET}  ${YEL}warns=${totals.warns}${RESET}  ${BLU}infos=${totals.infos}${RESET}`);

  if (args.has("--fix-md")) {
    const audit = stripAnsi(lines.join("\n"));
    const out = `# SKILLS audit\n\nGenerated by \`scripts/lint-skills.ts\` on ${new Date().toISOString()}.\n\n\`\`\`\n${audit}\n\`\`\`\n`;
    writeFileSync(join(REPO, "scripts", "SKILLS-AUDIT.md"), out);
    console.log("\nwrote scripts/SKILLS-AUDIT.md");
  }

  process.exit(totals.errors > 0 && args.has("--strict") ? 1 : 0);
}

main();
