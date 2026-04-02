"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import Link from "next/link";

const API_BASE = ""; // Same-origin — routes through proxy handlers

type DashboardKpis = {
  total_engagements: number;
  total_patterns: number;
  total_predictions: number;
  prediction_hit_rate: number | null;
  industries_covered: number;
  top_recurring_failures: { failure_mode: string; category: string; cnt: number }[];
  top_successful_pilots: { pilot_name: string; pilot_type: string; weighted_success_score: number; industry: string }[];
  recent_case_feed_drafts: { item_id: string; title: string; industry: string; status: string; created_at: string }[];
};

function fmtDate(d?: string | null): string {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function confidenceBadge(score: number | null) {
  if (score === null) return <span className="text-bm-muted2">\u2014</span>;
  const pct = (score * 100).toFixed(0);
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (score >= 0.7) return <span className={`${base} bg-green-500/15 text-green-400`}>{pct}%</span>;
  if (score >= 0.4) return <span className={`${base} bg-amber-500/15 text-amber-400`}>{pct}%</span>;
  return <span className={`${base} bg-red-500/15 text-red-400`}>{pct}%</span>;
}

export default function PatternIntelCommandCenterPage() {
  const { envId, businessId } = useDomainEnv();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/dashboard?${qs}`);
      if (!res.ok) throw new Error(`Dashboard: ${res.status}`);
      const data = await res.json();
      setKpis(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  return (
    <section className="space-y-5" data-testid="pattern-intel-command-center">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold">Execution Pattern Intelligence</h2>
        <p className="text-sm text-bm-muted2">
          Cross-engagement intelligence layer — patterns, predictions, recommendations, and case-feed drafts aggregated from upstream workspaces.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Engagements", value: kpis?.total_engagements ?? 0 },
          { label: "Patterns", value: kpis?.total_patterns ?? 0 },
          { label: "Predictions", value: kpis?.total_predictions ?? 0 },
          { label: "Hit Rate", value: kpis?.prediction_hit_rate != null ? `${(kpis.prediction_hit_rate * 100).toFixed(0)}%` : "\u2014" },
          { label: "Industries", value: kpis?.industries_covered ?? 0 },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{label}</p>
            <p className="mt-1 text-xl font-semibold">{loading ? "\u2014" : value}</p>
          </div>
        ))}
      </div>

      {/* Top Recurring Failures */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Top Recurring Failures</h3>
          <Link href={`/lab/env/${envId}/pattern-intel/patterns?type=vendor`} className="text-xs text-bm-muted2 hover:underline">All patterns &rarr;</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Failure Mode</th>
              <th className="px-4 py-2 font-medium">Category</th>
              <th className="px-4 py-2 font-medium">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={3}>Loading...</td></tr>
            ) : !kpis?.top_recurring_failures?.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={3}>No failure observations yet.</td></tr>
            ) : (
              kpis.top_recurring_failures.map((f, i) => (
                <tr key={i} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{f.failure_mode}</td>
                  <td className="px-4 py-3 text-bm-muted2">{f.category || "\u2014"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{f.cnt}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Top Successful Pilots */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Top Successful Pilots</h3>
          <Link href={`/lab/env/${envId}/pattern-intel/patterns?type=pilot`} className="text-xs text-bm-muted2 hover:underline">Pilot patterns &rarr;</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Pilot</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>Loading...</td></tr>
            ) : !kpis?.top_successful_pilots?.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>No completed pilot observations yet.</td></tr>
            ) : (
              kpis.top_successful_pilots.map((p, i) => (
                <tr key={i} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{p.pilot_name}</td>
                  <td className="px-4 py-3 text-bm-muted2">{p.pilot_type || "\u2014"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{p.industry || "\u2014"}</td>
                  <td className="px-4 py-3">{confidenceBadge(p.weighted_success_score)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Case Feed Drafts */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <div className="border-b border-bm-border/50 px-4 py-3 flex items-center justify-between bg-bm-surface/30">
          <h3 className="text-sm font-semibold">Recent Case Feed Drafts</h3>
          <Link href={`/lab/env/${envId}/pattern-intel/case-feed`} className="text-xs text-bm-muted2 hover:underline">All drafts &rarr;</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Industry</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>Loading...</td></tr>
            ) : !kpis?.recent_case_feed_drafts?.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={4}>No case-feed drafts yet.</td></tr>
            ) : (
              kpis.recent_case_feed_drafts.map((d) => (
                <tr key={d.item_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{d.title}</td>
                  <td className="px-4 py-3 text-bm-muted2">{d.industry || "\u2014"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{fmtDate(d.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
