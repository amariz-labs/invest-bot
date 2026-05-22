// Voltrex-style design tokens (TypeScript export).
// Drop into a Next.js + Tailwind + shadcn project alongside tokens.css.
// See ../DASHBOARD-BRIEF.md §1 for rationale.

export const colors = {
  bg: "#0B0B12",
  surface: "#12121A",
  surfaceElevated: "#18181F",
  borderSubtle: "rgba(255,255,255,0.06)",
  borderStrong: "rgba(255,255,255,0.10)",

  contentPrimary: "rgba(255,255,255,0.96)",
  contentSecondary: "rgba(255,255,255,0.72)",
  contentTertiary: "rgba(255,255,255,0.65)", // raised from 0.55 for AAA over dark surfaces

  accent: {
    50:  "#EDE9FE",
    100: "#C4B5FD",
    200: "#A78BFA",
    300: "#8B5CF6", // brand violet
    400: "#7C3AED",
    500: "#6D28D9", // deep bloom core
    600: "#4C1D95",
  },

  success: "#22C55E",
  successFg: "#052E14",
  danger: "#EF4444",
  warning: "#F0B429", // chart line, epoch progress
  warningHi: "#FBBF24",

  focusRing: "#A78BFA", // dual-ring with 2px white inner on bloom areas
} as const;

export const typography = {
  fontFamily: {
    sans: '"Inter var", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Geist Mono", ui-monospace, SFMono-Regular, monospace',
  },
  fontFeatureSettings: '"tnum" 1, "cv11" 1, "ss01" 1, "zero" 1',
  fontVariantNumeric: "tabular-nums slashed-zero",
  scale: {
    kpiHero:      { px: 40, weight: 600, tracking: "-0.02em"  },
    kpiSecondary: { px: 28, weight: 600, tracking: "-0.015em" },
    sectionHead:  { px: 20, weight: 600, tracking: "-0.01em"  },
    cardHead:     { px: 16, weight: 500, tracking: "0"        },
    body:         { px: 14, weight: 400, tracking: "0"        },
    caption:      { px: 11, weight: 400, tracking: "0.01em"   },
    eyebrow:      { px: 10, weight: 500, tracking: "0.08em", textTransform: "uppercase" as const },
  },
} as const;

export const space = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  6:  24,
  8:  32,
  12: 48,
} as const;

export const radius = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
  pill: 9999,
} as const;

export const motion = {
  duration: { xs: 100, sm: 150, md: 220, lg: 360, xl: 560 },
  ease: {
    standard:   [0.2, 0, 0, 1]   as const,
    decelerate: [0, 0, 0.2, 1]   as const,
    accelerate: [0.3, 0, 1, 1]   as const,
    anticipate: [0.5, -0.4, 0.3, 1.4] as const,
    linear:     [0, 0, 1, 1]     as const,
  },
} as const;

export const shadows = {
  bloom: "0 0 240px 80px hsl(263 70% 50% / 0.35)",
  card:  "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.40)",
} as const;
