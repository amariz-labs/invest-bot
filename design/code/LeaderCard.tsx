// Voltrex-style copy-trade leader card.
// React 19 + Tailwind 4 + shadcn/ui + lucide-react.
// See ../DASHBOARD-BRIEF.md §6 and ../VISUAL-AUDIT.md §5 for rationale.

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Sparkline } from "@/components/chart/Sparkline";

type Trend = "up" | "down" | "flat";
type Capacity = { current: number; max: number };

export interface LeaderCardProps {
  leader: { id: string; name: string; avatarUrl: string; favorited?: boolean };
  capacity: Capacity;
  sparkline: { points: number[]; trend: Trend };
  roi: { absolute: number; pct: number; windowDays: 7 | 30 | "all" };
  metrics: {
    aum: number;
    mdd30d: number;          // percent
    mddAll: number;          // percent — added vs the Dribbble shot, see brief §6
    sharpe: number | null;   // null -> "—"
    accountAgeDays: number;  // survivorship-bias antidote, see brief §6
  };
  fees?: { performance: number; management: number };
  onFavorite?(id: string): void;
  onMock?(id: string): void;
  onCopy?(id: string): void;
}

const fmtCcy = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat("en-US", {
  style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function LeaderCard({
  leader, capacity, sparkline, roi, metrics, fees, onFavorite, onMock, onCopy,
}: LeaderCardProps) {
  const isFull = capacity.current >= capacity.max;
  const isYoung = metrics.accountAgeDays < 90;          // survivorship guard
  const isRisky = metrics.mdd30d > 20 || (metrics.sharpe ?? 0) < 3;

  const TrendIcon =
    sparkline.trend === "up" ? ArrowUpRight :
    sparkline.trend === "down" ? ArrowDownRight :
    Minus;

  const accentColor =
    sparkline.trend === "up" ? "text-emerald-400" :
    sparkline.trend === "down" ? "text-rose-400" :
    "text-zinc-400";

  // De-saturate green when the trade is risky or the account is young — see brief §6.
  const roiTone = isRisky || isYoung ? "text-emerald-400/55" : accentColor;

  const mddTone =
    metrics.mdd30d > 25 ? "text-rose-400" :
    metrics.mdd30d > 15 ? "text-amber-400" :
    "text-zinc-200";

  return (
    <Card
      className="relative overflow-hidden border-zinc-800
                 bg-gradient-to-br from-zinc-900 to-zinc-950"
      aria-labelledby={`leader-${leader.id}-name`}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="flex items-center gap-3">
          <img
            src={leader.avatarUrl}
            alt=""
            className="size-9 rounded-full ring-1 ring-zinc-700"
          />
          <div>
            <div id={`leader-${leader.id}-name`} className="text-sm font-medium text-zinc-100">
              {leader.name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs num">
                {capacity.current}/{capacity.max}
              </Badge>
              {isYoung && (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-amber-400 border-amber-500/30">
                  New
                </Badge>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => onFavorite?.(leader.id)}
          aria-label={leader.favorited ? "Unfavorite" : "Favorite"}
          aria-pressed={leader.favorited}
        >
          <Star
            className={`size-4 ${leader.favorited ? "fill-amber-400 text-amber-400" : "text-zinc-500"}`}
            aria-hidden
          />
        </button>
      </CardHeader>

      <CardContent className="space-y-3 pb-3">
        <Sparkline
          points={sparkline.points}
          className={`h-10 w-full ${accentColor}`}
          aria-hidden
        />
        <div role="group" aria-label={`Return on investment ${roi.absolute} (${fmtPct.format(roi.pct / 100)}) over ${roi.windowDays} ${roi.windowDays === "all" ? "" : "days"}`}>
          <div className={`flex items-center gap-1 text-2xl font-semibold num ${roiTone}`}>
            <TrendIcon className="size-5" aria-hidden />
            {roi.absolute >= 0 ? "+" : ""}{fmtCcy.format(roi.absolute)}
          </div>
          <div className="text-xs text-zinc-400 num">
            ROI {roi.absolute >= 0 ? "+" : ""}{fmtPct.format(roi.pct / 100)} · {roi.windowDays === "all" ? "all-time" : `${roi.windowDays}D`}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
          <div>
            <dt>AUM</dt>
            <dd className="num text-zinc-200">{fmtCcy.format(metrics.aum)}</dd>
          </div>
          <div>
            <dt title="Max drawdown, last 30 days">30D MDD</dt>
            <dd className={`num ${mddTone}`}>{metrics.mdd30d.toFixed(2)}%</dd>
          </div>
          <div>
            <dt>Sharpe</dt>
            <dd className="num text-zinc-200">
              {metrics.sharpe?.toFixed(2) ?? (
                <span title="Insufficient trading history (<30 days)">—</span>
              )}
            </dd>
          </div>
        </dl>

        {fees && (
          <div className="text-[11px] text-zinc-500 num">
            Fees · perf {fmtPct.format(fees.performance)} · mgmt {fmtPct.format(fees.management)}
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onMock?.(leader.id)}
        >
          Try Mock
        </Button>
        <Button
          size="sm"
          disabled={isFull}
          aria-disabled={isFull}
          className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-500"
          onClick={() => onCopy?.(leader.id)}
        >
          {isFull ? "Waitlist" : "Copy"}
        </Button>
      </CardFooter>
    </Card>
  );
}
