"use client";

import type { PipelineStripItem } from "@/lib/cro-api";

function formatValue(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

export default function PipelineStrip({ items }: { items: PipelineStripItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between px-3 py-2 border-b border-bm-border/40">
        <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
          Pipeline
        </span>
      </div>
      <div className="flex divide-x divide-bm-border/25 overflow-x-auto">
        {items.map((s) => (
          <div key={s.stage_key} className="flex-1 min-w-[90px] px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wider text-bm-muted2 truncate">{s.stage_label}</p>
            <p className="text-base font-semibold text-bm-text tabular-nums">{s.deal_count}</p>
            <p className="text-[10px] text-bm-muted2 tabular-nums">{formatValue(s.total_value)}</p>
            {s.stale_count > 0 ? (
              <p className="text-[9px] text-red-400">{s.stale_count} stale</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
