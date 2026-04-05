"use client";

import type { StuckMoneyItem } from "@/lib/cro-api";

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `$${n.toLocaleString()}`;
}

export default function StuckMoney({ items }: { items: StuckMoneyItem[] }) {
  if (items.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between px-3 py-2 border-b border-bm-border/40">
        <span className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2 font-semibold">
          Stuck Money
        </span>
        <span className="text-[10px] text-red-400">{items.length} deals blocked</span>
      </div>
      <div className="divide-y divide-bm-border/25">
        {items.map((row) => (
          <div
            key={row.crm_opportunity_id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2"
          >
            <span className="text-base font-semibold text-bm-text tabular-nums">
              {formatCurrency(row.amount)}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-bm-text truncate">{row.account_name || row.name}</p>
              <p className="text-[10px] text-bm-muted2 truncate">
                {row.stage_label || "—"}
                {row.industry ? ` · ${row.industry}` : ""}
              </p>
            </div>
            <div className="text-right">
              {row.next_action_description ? (
                <p className="text-[10px] text-amber-400 truncate max-w-[140px]">
                  {row.next_action_description}
                </p>
              ) : (
                <p className="text-[10px] text-red-400">No action</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
