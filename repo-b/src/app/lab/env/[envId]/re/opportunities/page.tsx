"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";
import {
  listReOpportunities,
  type ReOpportunity,
} from "@/lib/bos-api";

// ── Stage badge colors ────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  signal: "bg-slate-700 text-slate-200",
  hypothesis: "bg-indigo-900/60 text-indigo-300",
  underwriting: "bg-blue-900/60 text-blue-300",
  modeled: "bg-cyan-900/60 text-cyan-300",
  ic_ready: "bg-amber-900/60 text-amber-300",
  approved: "bg-orange-900/60 text-orange-300",
  live: "bg-emerald-900/60 text-emerald-300",
  archived: "bg-zinc-800 text-zinc-500",
};

function StageBadge({ stage }: { stage: string }) {
  const cls = STAGE_COLORS[stage] ?? "bg-zinc-800 text-zinc-400";
  const label = stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ── Score bar (5-point color) ─────────────────────────────────────────────────

function ScoreBar({ score, source }: { score: number | null; source: string }) {
  if (score == null) return <span className="text-bm-muted2 text-xs">—</span>;
  const w = Math.round(Math.max(0, Math.min(100, score)));
  const colorCls =
    w >= 85 ? "bg-emerald-500" :
    w >= 70 ? "bg-green-500" :
    w >= 55 ? "bg-yellow-500" :
    w >= 40 ? "bg-orange-500" :
              "bg-red-500";
  const label = source === "modeled" ? "(Mod.)" : "(Est.)";
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="h-1.5 w-16 rounded-full bg-bm-border/30 overflow-hidden flex-shrink-0">
        <div className={`h-full rounded-full ${colorCls}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-xs tabular-nums text-bm-text">{w.toFixed(1)}</span>
      <span className="text-[10px] text-bm-muted2">{label}</span>
    </div>
  );
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function daysAgo(dt: string | null | undefined): string {
  if (!dt) return "—";
  const d = new Date(dt);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "1d";
  return `${diff}d`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const { envId, businessId } = useRepeContext();
  const base = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [opps, setOpps] = useState<ReOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // URL-param filters
  const stageFilter = searchParams.get("stage") ?? undefined;
  const fundFilter = searchParams.get("fund") ?? undefined;
  const minScore = searchParams.get("min_score") ? Number(searchParams.get("min_score")) : undefined;

  useEffect(() => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    listReOpportunities(envId, {
      stage: stageFilter,
      fund_id: fundFilter,
      min_score: minScore,
    })
      .then(setOpps)
      .catch((e) => setError(e?.message ?? "Failed to load opportunities"))
      .finally(() => setLoading(false));
  }, [envId, stageFilter, fundFilter, minScore]);

  const kpis: KpiDef[] = useMemo(() => {
    const total = opps.length;
    const avgScore =
      opps.filter((o) => o.composite_score != null).reduce((s, o) => s + Number(o.composite_score), 0) /
      (opps.filter((o) => o.composite_score != null).length || 1);
    const signalCount = opps.reduce((s, o) => s + (o.signal_count ?? 0), 0);
    const inUnderwriting = opps.filter((o) => o.stage === "underwriting").length;
    const icReady = opps.filter((o) => o.stage === "ic_ready").length;
    const approvedLive = opps.filter((o) => o.stage === "approved" || o.stage === "live").length;

    return [
      { label: "Total", value: total },
      { label: "Avg Score", value: isNaN(avgScore) ? "—" : avgScore.toFixed(1) },
      { label: "Signals Tracked", value: signalCount },
      { label: "In Underwriting", value: inUnderwriting },
      { label: "IC Ready", value: icReady },
      { label: "Approved / Live", value: approvedLive },
    ];
  }, [opps]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-bm-muted2 text-sm">Loading opportunities…</span>
      </div>
    );
  }

  if (error) {
    return <StateCard state="error" title="Failed to load" message={error} />;
  }

  return (
    <div className="flex flex-col gap-0 min-h-0">
      {/* KPI band */}
      <KpiStrip kpis={kpis} variant="band" className="px-4 pt-3" />

      {/* Filter bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-bm-border/30 text-xs text-bm-muted2">
        {(["signal", "hypothesis", "underwriting", "modeled", "ic_ready", "approved", "live"] as const).map((s) => {
          const active = stageFilter === s;
          return (
            <button
              key={s}
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                if (active) {
                  params.delete("stage");
                } else {
                  params.set("stage", s);
                }
                router.push(`${base}/opportunities?${params.toString()}`);
              }}
              className={`rounded px-2 py-0.5 transition-colors ${
                active
                  ? "bg-bm-accent/20 text-bm-accent border border-bm-accent/40"
                  : "hover:bg-bm-surface2 border border-transparent"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          );
        })}
        {stageFilter && (
          <button
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("stage");
              router.push(`${base}/opportunities?${params.toString()}`);
            }}
            className="ml-auto text-bm-muted hover:text-bm-text"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      {opps.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-bm-muted2 text-sm">
          No opportunities match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-bm-border/30 text-bm-muted2 text-[11px] uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Market</th>
                <th className="px-3 py-2 font-medium">Strategy</th>
                <th className="px-3 py-2 font-medium">Stage</th>
                <th className="px-3 py-2 font-medium text-right">Signals</th>
                <th className="px-3 py-2 font-medium">Score</th>
                <th className="px-3 py-2 font-medium text-right">Equity</th>
                <th className="px-3 py-2 font-medium text-right">Age</th>
                <th className="px-3 py-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {opps.map((opp) => (
                <tr
                  key={opp.opportunity_id}
                  onClick={() => router.push(`${base}/opportunities/${opp.opportunity_id}`)}
                  className="border-b border-bm-border/20 hover:bg-bm-surface2/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2 font-medium text-bm-text max-w-[200px] truncate">
                    {opp.name}
                    {opp.ai_generated && (
                      <span className="ml-1.5 rounded bg-violet-900/40 px-1 text-[9px] text-violet-400 uppercase tracking-wide">
                        AI
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-bm-muted2">{opp.market ?? "—"}</td>
                  <td className="px-3 py-2 text-bm-muted2">{opp.strategy?.replace(/_/g, " ") ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StageBadge stage={opp.stage} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-bm-muted2">
                    {opp.signal_count ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    <ScoreBar score={opp.composite_score} source={opp.score_source} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtMoney(opp.target_equity_check)}
                  </td>
                  <td className="px-3 py-2 text-right text-bm-muted2">
                    {daysAgo(opp.created_at)}
                  </td>
                  <td className="px-3 py-2 text-bm-muted2">→</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
