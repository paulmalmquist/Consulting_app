"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type IndustryDashboard = {
  industry: string;
  rollup_date: string | null;
  total_engagements: number;
  total_patterns: number;
  top_vendor_stacks: { stack: string[]; count: number }[];
  top_workflow_bottlenecks: { bottleneck: string; count: number }[];
  top_metric_conflicts: { metric: string; variants: number }[];
  top_failure_modes: { mode: string; count: number }[];
  top_successful_pilots: { pilot: string; success_rate: number }[];
  top_architectures: { architecture: string; avg_score: number }[];
  reporting_delay_patterns: { pattern: string; avg_delay_days: number }[];
};

const INDUSTRIES = [
  { key: "real_estate_investment", label: "Real Estate Investment" },
  { key: "construction_pds", label: "Construction / PDS" },
  { key: "legal_ops", label: "Legal Ops" },
];

function DashboardSection<T>({ title, items, render }: { title: string; items: T[] | undefined; render: (v: T) => string }) {
  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {!items?.length ? (
        <p className="text-xs text-bm-muted2">No data available.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="text-sm text-bm-muted2">{render(item)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DashboardsPage() {
  const { envId } = useDomainEnv();
  const [selected, setSelected] = useState(INDUSTRIES[0].key);
  const [dashboard, setDashboard] = useState<IndustryDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/dashboards/${selected}`);
      if (!res.ok) throw new Error(`Dashboard: ${res.status}`);
      setDashboard(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  return (
    <section className="space-y-5" data-testid="pattern-intel-dashboards">
      <div>
        <h2 className="text-2xl font-semibold">Industry Dashboards</h2>
        <p className="text-sm text-bm-muted2">Aggregated intelligence rollups per industry vertical.</p>
      </div>

      {/* Industry tabs */}
      <div className="flex gap-2">
        {INDUSTRIES.map((ind) => (
          <button
            key={ind.key}
            onClick={() => setSelected(ind.key)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              selected === ind.key
                ? "border-bm-accent/60 bg-bm-accent/10"
                : "border-bm-border/70 hover:bg-bm-surface/40"
            }`}
          >
            {ind.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Loading dashboard...</div>
      ) : !dashboard ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">No data for this industry.</div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Engagements</p>
              <p className="mt-1 text-xl font-semibold">{dashboard.total_engagements}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Patterns</p>
              <p className="mt-1 text-xl font-semibold">{dashboard.total_patterns}</p>
            </div>
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Rollup Date</p>
              <p className="mt-1 text-xl font-semibold">{dashboard.rollup_date || "\u2014"}</p>
            </div>
          </div>

          {/* Sections */}
          <DashboardSection title="Common Vendor Stacks" items={dashboard.top_vendor_stacks} render={(v) => `${v.stack?.join(" + ") || "\u2014"} (${v.count})`} />
          <DashboardSection title="Workflow Bottlenecks" items={dashboard.top_workflow_bottlenecks} render={(v) => `${v.bottleneck} (${v.count})`} />
          <DashboardSection title="Metric Inconsistency Hot Spots" items={dashboard.top_metric_conflicts} render={(v) => `${v.metric} \u2014 ${v.variants} variants`} />
          <DashboardSection title="Failure Modes" items={dashboard.top_failure_modes} render={(v) => `${v.mode} (${v.count})`} />
          <DashboardSection title="Pilot Success Rates" items={dashboard.top_successful_pilots} render={(v) => `${v.pilot} \u2014 ${(v.success_rate * 100).toFixed(0)}%`} />
          <DashboardSection title="Winning Architectures" items={dashboard.top_architectures} render={(v) => `${v.architecture} \u2014 score ${v.avg_score?.toFixed(2) || "\u2014"}`} />
        </div>
      )}
    </section>
  );
}
