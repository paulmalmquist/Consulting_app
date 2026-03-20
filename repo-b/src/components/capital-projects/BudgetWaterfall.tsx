"use client";

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

interface BudgetWaterfallProps {
  originalBudget: number;
  approvedCOs: number;
  revisedBudget: number;
  drawnToDate: number;
  remaining: number;
}

export function BudgetWaterfall({ originalBudget, approvedCOs, revisedBudget, drawnToDate, remaining }: BudgetWaterfallProps) {
  const max = Math.max(originalBudget, revisedBudget, drawnToDate + remaining, 1);

  const segments = [
    { label: "Original Budget", value: originalBudget, color: "bg-slate-500" },
    { label: "+ Approved COs", value: approvedCOs, color: approvedCOs >= 0 ? "bg-amber-500" : "bg-rose-500" },
    { label: "Revised Budget", value: revisedBudget, color: "bg-blue-500" },
    { label: "Drawn to Date", value: drawnToDate, color: "bg-emerald-500" },
    { label: "Remaining", value: remaining, color: "bg-bm-surface" },
  ];

  return (
    <div className="space-y-3">
      {segments.map(seg => {
        const pct = Math.max(0, Math.min(100, (Math.abs(seg.value) / max) * 100));
        return (
          <div key={seg.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{seg.label}</span>
              <span className="font-mono text-xs text-bm-text">{formatMoney(seg.value)}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-bm-border/20">
              <div className={`h-full rounded-full ${seg.color}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
