// Locale-aware number formatters. Every numeric value rendered anywhere in
// the app should pass through this module — never hand-roll thousand
// separators. The Voltrex source screenshot mixed EU and US separators on
// one screen; threading every numeric through a single Intl.NumberFormat
// instance prevents that class of bug. See DASHBOARD-BRIEF.md §2/§11.

const DEFAULT_LOCALE = "en-US";

const ccyCompactCache = new Map<string, Intl.NumberFormat>();
const ccyPreciseCache = new Map<string, Intl.NumberFormat>();
const pctCache = new Map<string, Intl.NumberFormat>();
const compactCache = new Map<string, Intl.NumberFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();

function key(locale: string, ...rest: string[]): string {
  return [locale, ...rest].join("|");
}

/** Currency, compact for >=10k ($24.5k, $1.20M). */
export function fmtCurrency(
  value: number,
  opts: { locale?: string; currency?: string; precise?: boolean } = {},
): string {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const currency = opts.currency ?? "USD";
  const precise = opts.precise ?? Math.abs(value) < 10_000;
  const cache = precise ? ccyPreciseCache : ccyCompactCache;
  const k = key(locale, currency, precise ? "p" : "c");
  let fmt = cache.get(k);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: precise ? "standard" : "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2,
      minimumFractionDigits: precise ? 2 : 0,
    });
    cache.set(k, fmt);
  }
  return fmt.format(value);
}

/** Percent — pass a ratio (0.0123 → "1.23%"). */
export function fmtPercent(
  ratio: number,
  opts: { locale?: string; signed?: boolean; digits?: number } = {},
): string {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const digits = opts.digits ?? 2;
  const k = key(locale, String(digits), opts.signed ? "s" : "u");
  let fmt = pctCache.get(k);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "percent",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: opts.signed ? "exceptZero" : "auto",
    });
    pctCache.set(k, fmt);
  }
  return fmt.format(ratio);
}

/** Compact number (1.2M, 340K). For volumes, follower counts, etc. */
export function fmtCompact(value: number, opts: { locale?: string } = {}): string {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  let fmt = compactCache.get(locale);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 2,
    });
    compactCache.set(locale, fmt);
  }
  return fmt.format(value);
}

/** Plain number with grouping. Use for shares, qty, integers. */
export function fmtNumber(
  value: number,
  opts: { locale?: string; digits?: number } = {},
): string {
  const locale = opts.locale ?? DEFAULT_LOCALE;
  const digits = opts.digits ?? 2;
  const k = key(locale, String(digits));
  let fmt = numberCache.get(k);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
    numberCache.set(k, fmt);
  }
  return fmt.format(value);
}

/** Truncate an Ethereum-style address: 0xBwqw…1248. Hover should reveal full. */
export function truncateAddress(addr: string, head = 4, tail = 4): string {
  if (!addr) return "";
  if (!addr.startsWith("0x") || addr.length <= 2 + head + tail) return addr;
  return `${addr.slice(0, 2 + head)}…${addr.slice(-tail)}`;
}
