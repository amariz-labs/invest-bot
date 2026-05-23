// Atomic file I/O + JSON safe-codec for RecordingAdapter fixtures.
//
// Why split into its own module? Two reasons:
//   1) The recorder needs to survive process crashes without leaving
//      half-written fixtures on disk (which would silently bias replays).
//   2) We need a stable JSON codec that round-trips Date and BigInt — both
//      appear in broker/data SDK results (timestamps, share counts, etc.).
//
// Conventions:
//   - Write `<path>.tmp.<rand>` then rename to `<path>` (POSIX rename is atomic
//     on the same filesystem). Never write the final path directly.
//   - JSONL streams use append; partial last-line is tolerated by readers.
//   - Hash args via sha256 of stable-stringified JSON; truncate to 12 hex chars.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

// ----- safe JSON codec -------------------------------------------------------

const DATE_TAG = "__date__";
const BIGINT_TAG = "__bigint__";

type Tagged = { [DATE_TAG]: string } | { [BIGINT_TAG]: string };

function isTagged(v: unknown): v is Tagged {
  return typeof v === "object" && v !== null
    && (DATE_TAG in (v as object) || BIGINT_TAG in (v as object));
}

// JSON.stringify replacer that encodes Date and BigInt with tagged markers.
function encodeReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (typeof value === "bigint") return { [BIGINT_TAG]: value.toString() };
  return value;
}

// JSON.parse reviver that decodes the tagged markers back to native values.
function decodeReviver(_key: string, value: unknown): unknown {
  if (!isTagged(value)) return value;
  if (DATE_TAG in value) return new Date(value[DATE_TAG]);
  if (BIGINT_TAG in value) return BigInt(value[BIGINT_TAG]);
  return value;
}

export function safeStringify(value: unknown, pretty = true): string {
  return JSON.stringify(value, encodeReplacer, pretty ? 2 : 0);
}

export function safeParse<T = unknown>(text: string): T {
  return JSON.parse(text, decodeReviver) as T;
}

// ----- stable hashing --------------------------------------------------------

// Deterministic stringify (sorted keys, recursive). Used only for hashing.
// Cycles are not expected in adapter args; we guard them to avoid an infinite
// loop in case a caller passes a cyclic object by accident.
function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "bigint") return JSON.stringify({ [BIGINT_TAG]: value.toString() });
    if (typeof value === "undefined") return "null";
    if (typeof value === "function") return "null";
    return JSON.stringify(value);
  }
  if (value instanceof Date) return JSON.stringify({ [DATE_TAG]: value.toISOString() });
  if (seen.has(value as object)) return '"__cycle__"';
  seen.add(value as object);
  if (Array.isArray(value)) {
    return `[${value.map(v => stableStringify(v, seen)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k], seen)}`);
  return `{${parts.join(",")}}`;
}

export function hashArgs(args: readonly unknown[]): string {
  const repr = stableStringify(args);
  return createHash("sha256").update(repr).digest("hex").slice(0, 12);
}

// ----- atomic file I/O -------------------------------------------------------

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${randomBytes(6).toString("hex")}`;
  const body = safeStringify(data);
  try {
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, filePath);
  } catch (err) {
    // Best-effort cleanup; ignore unlink errors.
    await fs.unlink(tmp).catch(() => undefined);
    throw err;
  }
}

export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const text = await fs.readFile(filePath, "utf8");
  return safeParse<T>(text);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function appendJsonl(filePath: string, line: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  // Append is atomic per-line on POSIX up to PIPE_BUF (4096 bytes); our lines
  // are usually well under that. For larger lines a separate writer-process
  // model is needed, but per-event tick frames are tiny in practice.
  await fs.appendFile(filePath, `${safeStringify(line, false)}\n`, "utf8");
}

export async function readJsonl<T = unknown>(filePath: string): Promise<T[]> {
  const text = await fs.readFile(filePath, "utf8");
  const out: T[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      out.push(safeParse<T>(line));
    } catch {
      // Skip malformed trailing line (process crash mid-write). Documented
      // tolerance: the JSONL reader survives a truncated last line.
    }
  }
  return out;
}
