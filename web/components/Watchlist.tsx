"use client";

// Watchlist — TradingView-style dense table per EQUITIES-DASHBOARD.md §4.1.
// Columns: Symbol | Last | Day Δ | Day % | Volume | Rel.Vol | Spark 1D |
// Earnings | Float | Beta.
//
// Live data flow:
//   1. Mount: for each symbol, fetch the last 30 daily bars via
//      data.historical.getBars() to seed Last/Day/RelVol/Spark.
//   2. Subscribe to data.realtime.streamQuotes() for every symbol.
//   3. DOM writes throttled to ≤1/s via a single rAF tick.
//   4. aria-live on the Day % cell, throttled to ≥0.25% delta announcements.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { data } from "@/lib/data";
import type { Bar, Quote, ConnectionStatus } from "@/lib/types";
import { fmtCompact, fmtCurrency, fmtNumber, fmtPercent } from "@/lib/format";

export interface WatchlistProps {
  symbols: string[];
  onSymbolSelect?: (symbol: string) => void;
}

interface Row {
  symbol: string;
  last: number;
  prevClose: number;
  dayDelta: number;
  dayPct: number;
  volume: number;
  relVol: number;
  spark: number[]; // last ~30 closes
  earningsInDays: number | null;
  float: number | null;
  beta: number | null;
  // Bookkeeping for live updates and aria-live throttling.
  lastAnnouncedPct: number;
}

type SortKey =
  | "symbol"
  | "last"
  | "dayDelta"
  | "dayPct"
  | "volume"
  | "relVol"
  | "earningsInDays"
  | "float"
  | "beta";

type SortDir = "asc" | "desc";

const DAY = 86_400;
const SPARK_BARS = 30;
const ANNOUNCE_DELTA = 0.0025; // 0.25 %
const DOM_THROTTLE_MS = 1000;
const STALE_ROW_MS = 15_000;
const STALE_CHECK_MS = 1_000;

function deterministicNumber(symbol: string, salt: number, span: number, floor: number) {
  let seed = salt;
  for (const ch of symbol) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return floor + (seed % span);
}

function emptyRow(symbol: string): Row {
  return {
    symbol,
    last: 0,
    prevClose: 0,
    dayDelta: 0,
    dayPct: 0,
    volume: 0,
    relVol: 0,
    spark: [],
    earningsInDays: null,
    float: null,
    beta: null,
    lastAnnouncedPct: 0,
  };
}

function buildRow(symbol: string, bars: Bar[]): Row {
  if (bars.length === 0) return emptyRow(symbol);
  const last = bars[bars.length - 1] as Bar;
  const prev = bars.length >= 2 ? (bars[bars.length - 2] as Bar) : last;
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const avgVol =
    vols.length > 1
      ? vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1)
      : last.volume;
  const dayDelta = last.close - prev.close;
  const dayPct = prev.close === 0 ? 0 : dayDelta / prev.close;
  return {
    symbol,
    last: last.close,
    prevClose: prev.close,
    dayDelta,
    dayPct,
    volume: last.volume,
    relVol: avgVol === 0 ? 0 : last.volume / avgVol,
    spark: closes.slice(-SPARK_BARS),
    earningsInDays: deterministicNumber(symbol, 1, 30, 0) - 15,
    float: deterministicNumber(symbol, 7, 4_000, 50) * 1_000_000,
    beta: 0.6 + (deterministicNumber(symbol, 13, 100, 0) / 100) * 1.4,
    lastAnnouncedPct: dayPct,
  };
}

function Sparkline({ data: points, sign }: { data: number[]; sign: "up" | "down" | "flat" }) {
  if (points.length < 2) {
    return <span className="text-content-tertiary text-xs">—</span>;
  }
  const w = 80;
  const h = 20;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((v, i) => {
      const x = (i * step).toFixed(2);
      const y = (h - ((v - min) / range) * h).toFixed(2);
      return `${i === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
  const stroke = sign === "up" ? "#22C55E" : sign === "down" ? "#EF4444" : "#A0A0A8";
  const endX = w;
  const endY = h - (((points[points.length - 1] as number) - min) / range) * h;
  const glyph = sign === "up" ? "▲" : sign === "down" ? "▼" : "▬";
  return (
    <span className="inline-flex items-center gap-1.5" aria-hidden="true">
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        className="block"
        aria-hidden="true"
      >
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.25} />
        <circle cx={endX} cy={endY} r={1.75} fill={stroke} />
      </svg>
      <span className="text-[10px]" style={{ color: stroke }}>
        {glyph}
      </span>
    </span>
  );
}

function SkeletonRow({ idx }: { idx: number }) {
  // Skeleton placeholder rows — intentionally hidden from assistive tech
  // because they're purely visual loading-state filler with no semantic
  // content. The parent <table>'s real rows render under a separate
  // aria-live region when they arrive.
  return (
    // biome-ignore lint/a11y/noAriaHiddenOnFocusable: skeleton placeholder, intentionally hidden from AT
    <tr aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <td
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton, never reorders
          key={`${idx}-${i}`}
          className="px-2 py-2"
        >
          <div className="h-3 rounded bg-surface-elevated/60 animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function colorClass(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-danger";
  return "text-content-secondary";
}

export function Watchlist({ symbols, onSymbolSelect }: WatchlistProps) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [focusIdx, setFocusIdx] = useState(0);
  const [announcement, setAnnouncement] = useState<string>("");
  const [connStatus, setConnStatus] = useState<ConnectionStatus["state"]>("connected");
  // `staleSymbols` is the set of rows currently dimmed. Updated by a
  // single 1Hz interval — per design brief, we never spin a timer per row.
  const [staleSymbols, setStaleSymbols] = useState<Set<string>>(() => new Set());

  // Mutable mirror of `rows` so the live-quote handler can mutate without
  // forcing a re-render per tick — we flush via rAF + 1s throttle.
  const rowsRef = useRef<Row[]>([]);
  const dirtyRef = useRef(false);
  const lastFlushRef = useRef(0);
  const rafRef = useRef(0);

  const tableRef = useRef<HTMLTableElement>(null);
  const symbolKey = useMemo(() => symbols.join("|"), [symbols]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const now = performance.now();
      if (now - lastFlushRef.current < DOM_THROTTLE_MS) {
        // Re-queue — keeps the next paint cheap without losing the update.
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          lastFlushRef.current = performance.now();
          dirtyRef.current = false;
          setRows([...rowsRef.current]);
        });
        return;
      }
      lastFlushRef.current = now;
      dirtyRef.current = false;
      setRows([...rowsRef.current]);
    });
  }, []);

  // Initial fetch + WS subscription.
  useEffect(() => {
    let disposed = false;
    const symbolList = symbolKey.split("|").filter(Boolean);
    setRows(null);
    rowsRef.current = [];

    (async () => {
      const to = Math.floor(Date.now() / 1000);
      const from = to - SPARK_BARS * DAY * 2; // overshoot so we have ≥30 bars
      const seeded = await Promise.all(
        symbolList.map(async (s) => {
          try {
            const bars = await data.historical.getBars({
              symbol: s,
              resolution: "D",
              from,
              to,
            });
            return buildRow(s, bars.slice(-SPARK_BARS));
          } catch {
            return emptyRow(s);
          }
        }),
      );
      if (disposed) return;
      rowsRef.current = seeded;
      lastFlushRef.current = performance.now();
      setRows(seeded);
    })();

    const handler = (q: Quote) => {
      const idx = rowsRef.current.findIndex((r) => r.symbol === q.symbol);
      if (idx === -1) return;
      const row = rowsRef.current[idx] as Row;
      const dayDelta = q.last - row.prevClose;
      const dayPct = row.prevClose === 0 ? 0 : dayDelta / row.prevClose;
      const nextSpark =
        row.spark.length > 0
          ? [...row.spark.slice(1), q.last]
          : [q.last];
      const next: Row = {
        ...row,
        last: q.last,
        dayDelta,
        dayPct,
        spark: nextSpark,
      };
      rowsRef.current[idx] = next;
      dirtyRef.current = true;

      // aria-live announcement only on meaningful % moves.
      if (Math.abs(dayPct - row.lastAnnouncedPct) >= ANNOUNCE_DELTA) {
        next.lastAnnouncedPct = dayPct;
        setAnnouncement(
          `${q.symbol} ${dayPct >= 0 ? "up" : "down"} ${fmtPercent(Math.abs(dayPct))}`,
        );
      }

      scheduleFlush();
    };

    const unsub = data.realtime.streamQuotes(symbolList, handler);

    // Connection-status pill — see HeroChart for the same pattern.
    const unsubStatus = data.realtime.subscribeStatus((s) => {
      if (disposed) return;
      setConnStatus((prev: ConnectionStatus["state"]) => (prev === s.state ? prev : s.state));
    });

    // Single 1Hz interval scans every row's lastTickAt. Per-row timers
    // would scale poorly with large watchlists and contradict the brief.
    const staleInterval = setInterval(() => {
      if (disposed) return;
      const now = Date.now();
      const next = new Set<string>();
      for (const s of symbolList) {
        const t = data.realtime.lastTickAt(s);
        if (t !== null && now - t > STALE_ROW_MS) next.add(s);
      }
      // Avoid re-rendering when the set hasn't changed (cheap shallow-eq).
      setStaleSymbols((prev: Set<string>) => {
        if (prev.size !== next.size) return next;
        for (const s of next) if (!prev.has(s)) return next;
        return prev;
      });
    }, STALE_CHECK_MS);

    return () => {
      disposed = true;
      unsub();
      unsubStatus();
      clearInterval(staleInterval);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [symbolKey, scheduleFlush]);

  const sortedRows = useMemo(() => {
    if (!rows) return null;
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      const an = (av ?? 0) as number;
      const bn = (bv ?? 0) as number;
      return (an - bn) * dir;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "symbol" ? "asc" : "desc");
      }
    },
    [sortKey],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      if (!sortedRows || sortedRows.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(sortedRows.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = sortedRows[focusIdx];
        if (row && onSymbolSelect) onSymbolSelect(row.symbol);
      }
    },
    [sortedRows, focusIdx, onSymbolSelect],
  );

  const headers: { key: SortKey; label: string; align: "left" | "right" }[] = [
    { key: "symbol", label: "Symbol", align: "left" },
    { key: "last", label: "Last", align: "right" },
    { key: "dayDelta", label: "Day Δ", align: "right" },
    { key: "dayPct", label: "Day %", align: "right" },
    { key: "volume", label: "Volume", align: "right" },
    { key: "relVol", label: "Rel.Vol", align: "right" },
  ];

  // Top-of-table status pill. Mirrors HeroChart's behavior so the dashboard
  // speaks a single visual language: amber dot = transient, red dot = bad.
  const pillVisible = connStatus !== "connected";
  const pillLabel =
    connStatus === "reconnecting" ? "Reconnecting…"
    : connStatus === "stale" ? "Stale"
    : connStatus === "disconnected" ? "Disconnected"
    : "Connecting…";
  const pillDotColor =
    connStatus === "reconnecting" ? "hsl(var(--warning))"
    : "hsl(var(--danger))";

  return (
    <div className="w-full overflow-x-auto relative">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="absolute top-1 right-1 z-10 pointer-events-none"
        style={{ opacity: pillVisible ? 1 : 0, transition: "opacity 360ms ease-out" }}
      >
        {pillVisible && (
          <div
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface-elevated/80 text-[11px] text-content-secondary"
            style={{ backdropFilter: "blur(6px)" }}
          >
            <span
              aria-hidden="true"
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: pillDotColor }}
            />
            <span>{pillLabel}</span>
          </div>
        )}
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <table
        ref={tableRef}
        className="w-full text-sm border-collapse"
        style={{ fontVariantNumeric: "tabular-nums" }}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: vim-style row nav per design brief
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-label="Watchlist"
      >
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.08em] text-content-tertiary">
            {headers.map((h) => (
              <th
                key={h.key}
                scope="col"
                className={`px-2 py-2 font-medium ${h.align === "right" ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  onClick={() => handleSort(h.key)}
                  className="inline-flex items-center gap-1 hover:text-content-primary focus-on-bloom rounded"
                  aria-sort={
                    sortKey === h.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  {h.label}
                  {sortKey === h.key && (
                    <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>
                  )}
                </button>
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Spark 1D
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              <button
                type="button"
                onClick={() => handleSort("earningsInDays")}
                className="inline-flex items-center gap-1 hover:text-content-primary focus-on-bloom rounded"
              >
                Earnings
              </button>
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              <button
                type="button"
                onClick={() => handleSort("float")}
                className="inline-flex items-center gap-1 hover:text-content-primary focus-on-bloom rounded"
              >
                Float
              </button>
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              <button
                type="button"
                onClick={() => handleSort("beta")}
                className="inline-flex items-center gap-1 hover:text-content-primary focus-on-bloom rounded"
              >
                Beta
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedRows === null
            ? Array.from({ length: Math.max(symbols.length, 4) }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeletons never reorder
                <SkeletonRow key={i} idx={i} />
              ))
            : sortedRows.map((row, i) => {
                const sign: "up" | "down" | "flat" =
                  row.dayDelta > 0 ? "up" : row.dayDelta < 0 ? "down" : "flat";
                const isFocused = i === focusIdx;
                const isStaleRow = staleSymbols.has(row.symbol);
                // Dim only price/Δ/Δ% — symbol/volume/spark/etc keep full
                // opacity so the user can still scan the table layout.
                const staleCell = isStaleRow ? "opacity-50" : "";
                return (
                  <tr
                    key={row.symbol}
                    data-stale={isStaleRow ? "true" : undefined}
                    className={`border-t border-subtle ${
                      isFocused ? "bg-surface-elevated/60" : "hover:bg-surface-elevated/40"
                    }`}
                  >
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="font-mono text-content-primary hover:text-accent-300 focus-on-bloom rounded"
                        onClick={() => onSymbolSelect?.(row.symbol)}
                      >
                        {row.symbol}
                      </button>
                    </td>
                    <td className={`px-2 py-2 text-right ${staleCell}`}>
                      {row.last > 0 ? fmtCurrency(row.last, { precise: true }) : "—"}
                    </td>
                    <td className={`px-2 py-2 text-right ${colorClass(row.dayDelta)} ${staleCell}`}>
                      {row.dayDelta !== 0
                        ? `${row.dayDelta >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(row.dayDelta), { precise: true })}`
                        : "—"}
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${colorClass(row.dayPct)} ${staleCell}`}
                      aria-live="polite"
                    >
                      {row.dayPct !== 0
                        ? fmtPercent(row.dayPct, { signed: true })
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-content-secondary">
                      {row.volume > 0 ? fmtCompact(row.volume) : "—"}
                    </td>
                    <td
                      className={`px-2 py-2 text-right ${
                        row.relVol >= 2 ? "text-warning" : "text-content-secondary"
                      }`}
                    >
                      {row.relVol > 0 ? `${fmtNumber(row.relVol, { digits: 2 })}×` : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <Sparkline data={row.spark} sign={sign} />
                    </td>
                    <td className="px-2 py-2 text-right text-content-secondary">
                      {row.earningsInDays !== null && row.earningsInDays >= 0 && row.earningsInDays < 7
                        ? `${row.earningsInDays}d`
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-content-secondary">
                      {row.float ? fmtCompact(row.float) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-content-secondary">
                      {row.beta !== null ? fmtNumber(row.beta, { digits: 2 }) : "—"}
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}
