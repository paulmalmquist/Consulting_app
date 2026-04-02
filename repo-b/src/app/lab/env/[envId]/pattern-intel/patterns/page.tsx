"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { useSearchParams } from "next/navigation";

const API_BASE = ""; // Same-origin — routes through proxy handlers

type Pattern = {
  pattern_id: string;
  pattern_type: string;
  pattern_description: string;
  confidence_score: number;
  support_count: number;
  industry_tags: string[];
  related_vendors: string[];
  related_workflows: string[];
  status: string;
  visibility_scope: string;
  first_seen_at: string;
  last_seen_at: string;
};

const PATTERN_TYPES = ["vendor", "workflow", "metric", "architecture", "pilot"];

function confidenceBadge(score: number) {
  const pct = (score * 100).toFixed(0);
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (score >= 0.7) return <span className={`${base} bg-green-500/15 text-green-400`}>{pct}%</span>;
  if (score >= 0.4) return <span className={`${base} bg-amber-500/15 text-amber-400`}>{pct}%</span>;
  return <span className={`${base} bg-red-500/15 text-red-400`}>{pct}%</span>;
}

function statusBadge(status: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (status === "confirmed") return <span className={`${base} bg-green-500/15 text-green-400`}>{status}</span>;
  if (status === "emerging") return <span className={`${base} bg-blue-500/15 text-blue-400`}>{status}</span>;
  if (status === "declining") return <span className={`${base} bg-amber-500/15 text-amber-400`}>{status}</span>;
  return <span className={`${base} bg-bm-surface/40 text-bm-muted2`}>{status}</span>;
}

export default function PatternsPage() {
  const { envId } = useDomainEnv();
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") || "";

  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [industryFilter, setIndustryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [minSupport, setMinSupport] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (typeFilter) qs.set("pattern_type", typeFilter);
      if (industryFilter) qs.set("industry", industryFilter);
      if (statusFilter) qs.set("status", statusFilter);
      if (minConfidence) qs.set("min_confidence", minConfidence);
      if (minSupport) qs.set("min_support", minSupport);
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/patterns?${qs}`);
      if (!res.ok) throw new Error(`Patterns: ${res.status}`);
      setPatterns(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load patterns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, industryFilter, statusFilter, minConfidence, minSupport]);

  return (
    <section className="space-y-5" data-testid="pattern-intel-patterns">
      <div>
        <h2 className="text-2xl font-semibold">Patterns</h2>
        <p className="text-sm text-bm-muted2">Faceted explorer for vendor, workflow, metric, architecture, and pilot patterns.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
          <option value="">All Types</option>
          {PATTERN_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <input value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} placeholder="Industry" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm w-36" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="emerging">Emerging</option>
          <option value="confirmed">Confirmed</option>
          <option value="declining">Declining</option>
          <option value="archived">Archived</option>
        </select>
        <input value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)} placeholder="Min confidence (0-1)" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm w-40" type="number" step="0.1" min="0" max="1" />
        <input value={minSupport} onChange={(e) => setMinSupport(e.target.value)} placeholder="Min support" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm w-28" type="number" min="0" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2 bg-bm-surface/30">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Description</th>
              <th className="px-4 py-2 font-medium">Confidence</th>
              <th className="px-4 py-2 font-medium">Support</th>
              <th className="px-4 py-2 font-medium">Industries</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>Loading...</td></tr>
            ) : !patterns.length ? (
              <tr><td className="px-4 py-5 text-bm-muted2" colSpan={6}>No patterns found. Patterns are detected from cross-engagement observations.</td></tr>
            ) : (
              patterns.map((p) => (
                <tr key={p.pattern_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">{p.pattern_type}</span>
                  </td>
                  <td className="px-4 py-3 font-medium max-w-md truncate">{p.pattern_description}</td>
                  <td className="px-4 py-3">{confidenceBadge(p.confidence_score)}</td>
                  <td className="px-4 py-3 text-bm-muted2">{p.support_count} engagements</td>
                  <td className="px-4 py-3 text-bm-muted2">{p.industry_tags?.join(", ") || "\u2014"}</td>
                  <td className="px-4 py-3">{statusBadge(p.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
