"use client";
import React, { useEffect, useState } from "react";

import { getPdsPipeline, type PdsV2PipelineSummary } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { formatCurrency } from "@/components/pds-enterprise/pdsEnterprise";

const STAGE_LABELS: Record<string, string> = {
  prospect: "Prospects",
  pursuit: "Pursuits",
  won: "Won",
  converted: "Converted to Backlog",
};

const STAGE_COLORS: Record<string, string> = {
  prospect: "bg-pds-signalYellow/30",
  pursuit: "bg-pds-signalOrange/30",
  won: "bg-pds-signalGreen/30",
  converted: "bg-pds-gold/30",
};

export default function PipelinePage() {
  const { envId, businessId } = useDomainEnv();
  const [data, setData] = useState<PdsV2PipelineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getPdsPipeline(envId, { business_id: businessId || undefined });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load pipeline");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [envId, businessId]);

  if (loading && !data) {
    return <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-6 text-sm text-bm-muted2">Loading pipeline...</div>;
  }

  if (error && !data) {
    return <div className="rounded-3xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-6 text-sm text-red-200">{error}</div>;
  }

  if (!data) return null;

  const maxStageValue = Math.max(...data.stages.map((s) => Number(s.unweighted_value)), 1);

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-gold)/0.14),transparent_45%),linear-gradient(145deg,#111820,#0b1015)] p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-gold/70">Portfolio</p>
        <h2 className="text-2xl font-semibold">Pipeline</h2>
        <p className="mt-1 text-sm text-bm-muted2">Track business development from prospects through pursuits, wins, and backlog conversion.</p>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="pds-pipeline-kpis">
        <article className="relative overflow-hidden rounded-2xl border border-pds-divider bg-pds-card/30 p-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-pds-gold/40" />
          <div className="pl-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Total Pipeline</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(data.total_pipeline_value)}</p>
            <p className="mt-2 text-xs text-bm-muted2">Unweighted value</p>
          </div>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-pds-divider bg-pds-card/30 p-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-pds-signalGreen" />
          <div className="pl-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Weighted Value</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrency(data.total_weighted_value)}</p>
            <p className="mt-2 text-xs text-bm-muted2">Probability-adjusted</p>
          </div>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-pds-divider bg-pds-card/30 p-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-pds-signalYellow" />
          <div className="pl-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Active Deals</p>
            <p className="mt-2 text-2xl font-semibold">{data.deals.length}</p>
            <p className="mt-2 text-xs text-bm-muted2">Across all stages</p>
          </div>
        </article>
        <article className="relative overflow-hidden rounded-2xl border border-pds-divider bg-pds-card/30 p-4">
          <div className="absolute left-0 top-0 h-full w-1 bg-pds-signalOrange" />
          <div className="pl-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Win Rate</p>
            <p className="mt-2 text-2xl font-semibold">
              {data.deals.length > 0
                ? `${Math.round((data.stages.filter((s) => s.stage === "won" || s.stage === "converted").reduce((sum, s) => sum + s.count, 0) / data.deals.length) * 100)}%`
                : "—"}
            </p>
            <p className="mt-2 text-xs text-bm-muted2">Won + converted</p>
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-gold/70">Stage Funnel</p>
        <h3 className="text-lg font-semibold">Pipeline by Stage</h3>
        <div className="mt-4 space-y-3">
          {data.stages.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-4">
              <span className="w-40 shrink-0 text-sm font-medium">{STAGE_LABELS[stage.stage] || stage.stage}</span>
              <div className="flex-1">
                <div
                  className={`h-8 rounded-lg ${STAGE_COLORS[stage.stage] || "bg-bm-surface/40"} flex items-center px-3 text-xs font-medium`}
                  style={{ width: `${Math.max((Number(stage.unweighted_value) / maxStageValue) * 100, 8)}%` }}
                >
                  {formatCurrency(stage.unweighted_value)}
                </div>
              </div>
              <span className="w-16 shrink-0 text-right text-sm text-bm-muted2">{stage.count} deals</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-gold/70">Deal List</p>
        <h3 className="text-lg font-semibold">All Pipeline Deals</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
              <tr className="border-b border-bm-border/50">
                <th className="pb-3 pr-4 font-medium">Deal</th>
                <th className="pb-3 pr-4 font-medium">Account</th>
                <th className="pb-3 pr-4 font-medium">Stage</th>
                <th className="pb-3 pr-4 font-medium">Value</th>
                <th className="pb-3 pr-4 font-medium">Probability</th>
                <th className="pb-3 pr-4 font-medium">Expected Close</th>
                <th className="pb-3 pr-4 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {data.deals.map((deal) => (
                <tr key={deal.deal_id} className="border-b border-bm-border/40 last:border-b-0">
                  <td className="py-3 pr-4 font-medium">{deal.deal_name}</td>
                  <td className="py-3 pr-4 text-bm-muted2">{deal.account_name || "—"}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      deal.stage === "won" || deal.stage === "converted"
                        ? "bg-pds-signalGreen/15 text-emerald-200"
                        : deal.stage === "pursuit"
                          ? "bg-pds-signalOrange/15 text-orange-200"
                          : "bg-pds-signalYellow/15 text-amber-200"
                    }`}>
                      {STAGE_LABELS[deal.stage] || deal.stage}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{formatCurrency(deal.deal_value)}</td>
                  <td className="py-3 pr-4">{Number(deal.probability_pct)}%</td>
                  <td className="py-3 pr-4 text-bm-muted2">{deal.expected_close_date || "—"}</td>
                  <td className="py-3 pr-4 text-bm-muted2">{deal.owner_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
