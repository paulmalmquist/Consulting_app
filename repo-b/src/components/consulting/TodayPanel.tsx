"use client";

import { type ExecutionCard } from "@/lib/cro-api";

function fmtCurrency(raw: number | string | null | undefined): string {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (n == null || isNaN(n)) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function TodayPanel({
  cards,
  staleCount,
  revenueAtRisk,
  envId,
  businessId,
  onSelectCard,
  onMarkDone,
}: {
  cards: ExecutionCard[];
  staleCount: number;
  revenueAtRisk: number;
  envId: string;
  businessId: string;
  onSelectCard: (id: string) => void;
  onMarkDone: (id: string) => void;
}) {
  if (cards.length === 0 && staleCount === 0) return null;

  // Sort: overdue first, then by amount desc
  const sorted = [...cards].sort((a, b) => {
    const aOverdue = a.next_action_due && a.next_action_due < new Date().toISOString().slice(0, 10) ? 1 : 0;
    const bOverdue = b.next_action_due && b.next_action_due < new Date().toISOString().slice(0, 10) ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    return (b.amount || 0) - (a.amount || 0);
  });

  const top5 = sorted.slice(0, 5);

  return (
    <div className="rounded-xl border border-bm-border/60 bg-bm-surface/20 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-bm-text">
          Today
        </h2>
        {revenueAtRisk > 0 ? (
          <span className="text-xs text-orange-400 font-medium">
            {fmtCurrency(revenueAtRisk)} at risk ({staleCount} stale)
          </span>
        ) : null}
      </div>

      {top5.length === 0 ? (
        <p className="text-xs text-bm-muted2">No actions due today. Check stale deals.</p>
      ) : (
        <div className="space-y-1.5">
          {top5.map((card, i) => (
            <div
              key={card.crm_opportunity_id}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-bm-surface/30 transition-colors group"
            >
              <span className="text-[11px] font-semibold text-bm-muted2 w-4 shrink-0">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-bm-text">
                  {card.account_name || "—"}
                </span>
                <span className="text-xs text-bm-muted2 ml-2">
                  {card.next_action_description || "Define next step"}
                </span>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-bm-muted2">
                  <span className={card.execution_pressure === "critical" ? "text-red-400" : card.execution_pressure === "high" ? "text-orange-400" : ""}>
                    {card.execution_pressure}
                  </span>
                  <span>{card.deal_drift_status}</span>
                  {card.latest_angle_used ? <span>last angle: {card.latest_angle_used}</span> : null}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onSelectCard(card.crm_opportunity_id)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-bm-accent hover:bg-bm-accent/10"
                >
                  Open
                </button>
                <button
                  onClick={() => onMarkDone(card.crm_opportunity_id)}
                  className="rounded px-2 py-0.5 text-[10px] font-medium text-emerald-400 hover:bg-emerald-400/10"
                >
                  Done
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
