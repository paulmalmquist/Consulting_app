"use client";

import type { IndustryBreakdownItem } from "@/lib/cro-api";

function formatValue(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${n.toLocaleString()}`;
}

export default function IndustryBreakdown({
  items,
  onFilterIndustry,
}: {
  items: IndustryBreakdownItem[];
  onFilterIndustry: (industry: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between px-3 py-2 border-b border-bm-border/40">
        <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
          By Industry
        </span>
      </div>
      <div className="divide-y divide-bm-border/25">
        {items.map((row) => (
          <button
            key={row.industry}
            type="button"
            onClick={() => onFilterIndustry(row.industry)}
            className="grid w-full grid-cols-[1fr_auto] items-center px-3 py-2 text-left hover:bg-bm-surface/10"
          >
            <div>
              <p className="text-xs font-medium text-bm-text">{row.industry}</p>
              <p className="text-[10px] text-bm-muted2">
                {row.deal_count} deals · {formatValue(row.total_value)}
              </p>
            </div>
            {row.needs_attention_count > 0 ? (
              <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-400">
                {row.needs_attention_count} need attention
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}
