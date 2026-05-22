// Voltrex-style count-up tween for KPI tiles and derived deposit-panel values.
// framer-motion + Intl.NumberFormat. Respects prefers-reduced-motion.
// See ../DASHBOARD-BRIEF.md §8 for rationale.

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from "framer-motion";

export interface AnimatedNumberProps {
  value: number;
  format?: Intl.NumberFormatOptions;
  locale?: string;
  duration?: number;          // seconds, default 0.36
  ariaLabel?: string;
}

export function AnimatedNumber({
  value,
  format = { maximumFractionDigits: 2 },
  locale = "en-US",
  duration = 0.36,
  ariaLabel,
}: AnimatedNumberProps) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);

  const fmt = new Intl.NumberFormat(locale, format);
  const text = useTransform(mv, v => fmt.format(v));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, {
      duration,
      ease: [0.2, 0, 0, 1], // motion.standard from tokens.ts
    });
    return controls.stop;
  }, [value, reduce, duration, mv]);

  return (
    <motion.span
      className="num"
      aria-live="polite"
      aria-atomic="true"
      aria-label={ariaLabel}
    >
      {text}
    </motion.span>
  );
}
