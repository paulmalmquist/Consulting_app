"use client";

import { cn } from "@/lib/cn";
import type { CpDrawRequest } from "@/types/capital-projects";

function statusColor(status: string): string {
  switch (status) {
    case "draft": return "bg-slate-500";
    case "pending_review": return "bg-amber-500";
    case "revision_requested": return "bg-orange-500";
    case "approved": return "bg-emerald-500";
    case "submitted_to_lender": return "bg-blue-500";
    case "funded": return "bg-cyan-500";
    case "rejected": return "bg-rose-500";
    default: return "bg-slate-500";
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DrawTimeline({ draws }: { draws: CpDrawRequest[] }) {
  if (!draws || draws.length === 0) {
    return <p className="text-xs text-bm-muted2">No draw history.</p>;
  }

  const sorted = [...draws].sort((a, b) => a.draw_number - b.draw_number);

  return (
    <div className="flex items-start gap-1 overflow-x-auto py-2">
      {sorted.map((draw, idx) => (
        <div key={draw.draw_request_id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={cn("h-3 w-3 rounded-full", statusColor(draw.status))} />
            <div className="mt-1 text-center">
              <p className="font-mono text-[10px] font-bold text-bm-text">#{draw.draw_number}</p>
              <p className="text-[9px] text-bm-muted2">{statusLabel(draw.status)}</p>
              <p className="font-mono text-[9px] text-bm-muted2">{formatMoney(draw.total_amount_due)}</p>
              <p className="text-[8px] text-bm-muted2">{formatDate(draw.funded_at || draw.approved_at || draw.submitted_at || draw.created_at)}</p>
            </div>
          </div>
          {idx < sorted.length - 1 && (
            <div className="mx-1 h-px w-6 bg-bm-border/40" />
          )}
        </div>
      ))}
    </div>
  );
}
