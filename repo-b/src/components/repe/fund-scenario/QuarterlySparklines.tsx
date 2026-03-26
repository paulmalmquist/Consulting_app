"use client";

import { TrendingUp } from "lucide-react";
import { fmtPct, fmtMultiple, fmtMoney } from "@/lib/format-utils";

export type SparklinePoint = {
  quarter: string;
  value: number;
};

export type QuarterlySparklineData = {
  gross_irr: SparklinePoint[];
  tvpi: SparklinePoint[];
  nav: SparklinePoint[];
};

function MiniSparkline({ points, color }: { points: SparklinePoint[]; color: string }) {
  if (points.length < 2) return <span className="text-[10px] text-bm-muted">--</span>;

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const step = w / (points.length - 1);

  const pathD = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p.value - min) / range) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="inline-block">
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QuarterlySparklines({
  data,
  onViewDetail,
}: {
  data?: QuarterlySparklineData | null;
  onViewDetail?: () => void;
}) {
  if (!data) {
    return (
      <div className="rounded-lg border border-bm-border/30 bg-bm-surface/5 p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
            <TrendingUp size={12} /> Quarterly Trends
          </h3>
          {onViewDetail && (
            <button onClick={onViewDetail} className="text-[11px] text-bm-accent hover:text-bm-accent/80">
              View Cash Flows &rarr;
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-bm-muted2 italic">
          Quarterly trend data will appear here once multi-quarter data is available.
        </p>
      </div>
    );
  }

  const lastIrr = data.gross_irr.at(-1);
  const lastTvpi = data.tvpi.at(-1);
  const lastNav = data.nav.at(-1);

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-bm-muted">
          <TrendingUp size={12} /> Quarterly Trends
        </h3>
        {onViewDetail && (
          <button onClick={onViewDetail} className="text-[11px] text-bm-accent hover:text-bm-accent/80">
            View Cash Flows &rarr;
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <div className="text-[10px] uppercase text-bm-muted mb-1">Gross IRR</div>
          <div className="flex items-end gap-2">
            <MiniSparkline points={data.gross_irr} color="#60a5fa" />
            <span className="text-xs font-medium text-bm-text">{lastIrr ? fmtPct(lastIrr.value) : "--"}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-bm-muted mb-1">TVPI</div>
          <div className="flex items-end gap-2">
            <MiniSparkline points={data.tvpi} color="#34d399" />
            <span className="text-xs font-medium text-bm-text">{lastTvpi ? fmtMultiple(lastTvpi.value) : "--"}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-bm-muted mb-1">NAV</div>
          <div className="flex items-end gap-2">
            <MiniSparkline points={data.nav} color="#a78bfa" />
            <span className="text-xs font-medium text-bm-text">{lastNav ? fmtMoney(lastNav.value) : "--"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
