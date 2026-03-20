"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRepeContext } from "@/lib/repe-context";
import { listCpDraws, createCpDraw } from "@/lib/bos-api";
import type { CpDrawRequest } from "@/types/capital-projects";
import { cn } from "@/lib/cn";

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string) {
  switch (status) {
    case "draft": return "border-slate-500/50 bg-slate-500/10 text-slate-300";
    case "pending_review": return "border-amber-500/50 bg-amber-500/10 text-amber-300";
    case "revision_requested": return "border-orange-500/50 bg-orange-500/10 text-orange-300";
    case "approved": return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    case "submitted_to_lender": return "border-blue-500/50 bg-blue-500/10 text-blue-300";
    case "funded": return "border-cyan-500/50 bg-cyan-500/10 text-cyan-300";
    case "rejected": return "border-rose-500/50 bg-rose-500/10 text-rose-300";
    default: return "border-bm-border/50 bg-bm-surface/10 text-bm-muted";
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default function DrawListPage({ params }: { params: { projectId: string } }) {
  const { envId, businessId } = useRepeContext();
  const [draws, setDraws] = useState<CpDrawRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!envId || !businessId) return;
    setLoading(true);
    listCpDraws(params.projectId, envId, businessId)
      .then(setDraws)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [envId, businessId, params.projectId]);

  const handleCreate = async () => {
    if (!envId || !businessId) return;
    setCreating(true);
    try {
      const newDraw = await createCpDraw(params.projectId, {}, envId, businessId);
      setDraws(prev => [newDraw, ...prev]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-bm-text">Draw Requests</h1>
          <p className="mt-1 text-xs text-bm-muted2">{draws.length} draw{draws.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50"
        >
          {creating ? "Creating..." : "+ New Draw"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-bm-danger/40 bg-bm-danger/10 px-4 py-3 text-sm text-bm-danger">{error}</div>
      )}

      {/* Draw list */}
      {draws.length === 0 ? (
        <div className="rounded-xl border border-bm-border/40 bg-bm-surface/30 p-8 text-center">
          <p className="text-sm text-bm-muted2">No draw requests yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 bg-bm-surface/40">
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Draw #</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Title</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Status</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Period</th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">This Draw</th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Amount Due</th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Variances</th>
              </tr>
            </thead>
            <tbody>
              {draws.map(draw => (
                <tr key={draw.draw_request_id} className="border-b border-bm-border/20 hover:bg-bm-surface/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/capital-projects/projects/${params.projectId}/draws/${draw.draw_request_id}`}
                      className="font-mono font-medium text-bm-accent hover:underline"
                    >
                      #{draw.draw_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-bm-text">{draw.title || `Draw #${draw.draw_number}`}</td>
                  <td className="px-4 py-3">
                    <span className={cn("inline-block rounded-md border px-2 py-0.5 text-xs font-medium", statusBadge(draw.status))}>
                      {statusLabel(draw.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2 text-xs">
                    {formatDate(draw.billing_period_start)} — {formatDate(draw.billing_period_end)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-bm-text">{formatMoney(draw.total_current_draw)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-bm-text">{formatMoney(draw.total_amount_due)}</td>
                  <td className="px-4 py-3 text-right">
                    {draw.variance_count && draw.variance_count > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                        {draw.variance_count}
                      </span>
                    ) : (
                      <span className="text-xs text-bm-muted2">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
