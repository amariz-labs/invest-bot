// Voltrex-style discrete locking-period slider.
// React 19 + Radix UI + Tailwind 4.
// See ../DASHBOARD-BRIEF.md §7 for rationale.

import * as Slider from "@radix-ui/react-slider";

export interface LockStop {
  label: string;       // "0", "7d", "30d", "180d", "365d"
  days: number;
  boost: number;       // percent multiplier
}

export const DEFAULT_STOPS: LockStop[] = [
  { label: "0",    days: 0,   boost: 0  },
  { label: "7d",   days: 7,   boost: 3  },
  { label: "30d",  days: 30,  boost: 6  },
  { label: "180d", days: 180, boost: 9  },
  { label: "365d", days: 365, boost: 12 },
];

export interface LockSliderProps {
  value: number;                  // index into stops
  onChange(index: number): void;
  stops?: LockStop[];
  estimatedReceive?: string;      // e.g. "1,234.56 USDT" — fed into the live region
}

export function LockSlider({
  value,
  onChange,
  stops = DEFAULT_STOPS,
  estimatedReceive,
}: LockSliderProps) {
  const stop = stops[value];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <label id="lock-label" className="text-zinc-400">Locking Period</label>
        <span className="text-zinc-100 num">{stop.label === "0" ? "None" : stop.label}</span>
      </div>

      <Slider.Root
        className="relative flex h-10 w-full touch-none select-none items-center"
        min={0}
        max={stops.length - 1}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-labelledby="lock-label"
      >
        <Slider.Track className="relative h-1 grow rounded-full bg-zinc-800">
          <Slider.Range className="absolute h-full rounded-full bg-emerald-500" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="Locking period"
          aria-valuetext={`${stop.days} days, ${stop.boost} percent boost`}
          className="block h-6 w-6 rounded-full bg-white shadow ring-2 ring-emerald-500
                     focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/70"
        />
      </Slider.Root>

      {/* Stop ticks, aligned to value-indices */}
      <div className="flex justify-between text-[11px] text-zinc-500 num">
        {stops.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onChange(i)}
            className={i === value ? "text-zinc-200 font-medium" : ""}
            aria-current={i === value ? "true" : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">Lock Boost</span>
        <output className="text-emerald-400 num">+{stop.boost}%</output>
      </div>

      {/* Live region: announces the *consequence* of each arrow press, not just the index */}
      <output
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {stop.days === 0
          ? "No lock selected."
          : `Locking ${stop.days} days for ${stop.boost} percent boost.`}
        {estimatedReceive && ` You will receive ${estimatedReceive}.`}
      </output>
    </div>
  );
}
