"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = ""; // Same-origin — routes through proxy handlers

type Recommendation = {
  recommendation_id: string;
  engagement_id: string;
  recommendation_type: string;
  title: string;
  description: string | null;
  confidence: number | null;
  matched_patterns: string[];
  evidence: { pattern_id: string; support_count: number; why_match: string }[];
  rank: number;
  status: string;
  created_at: string;
};

function confidenceBadge(score: number | null) {
  if (score === null) return <span className="text-bm-muted2">\u2014</span>;
  const pct = (score * 100).toFixed(0);
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  if (score >= 0.7) return <span className={`${base} bg-green-500/15 text-green-400`}>{pct}%</span>;
  if (score >= 0.4) return <span className={`${base} bg-amber-500/15 text-amber-400`}>{pct}%</span>;
  return <span className={`${base} bg-red-500/15 text-red-400`}>{pct}%</span>;
}

function typeBadge(type: string) {
  const base = "inline-block rounded-full px-2 py-0.5 text-xs font-medium";
  const colors: Record<string, string> = {
    pilot: "bg-purple-500/15 text-purple-400",
    architecture: "bg-cyan-500/15 text-cyan-400",
    module: "bg-blue-500/15 text-blue-400",
    discovery_request: "bg-amber-500/15 text-amber-400",
  };
  return <span className={`${base} ${colors[type] || "bg-bm-surface/40 text-bm-muted2"}`}>{type.replace("_", " ")}</span>;
}

export default function RecommendationsPage() {
  const { envId, businessId } = useDomainEnv();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/recommendations?${qs}`);
      if (!res.ok) throw new Error(`Recommendations: ${res.status}`);
      setRecs(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  return (
    <section className="space-y-5" data-testid="pattern-intel-recommendations">
      <div>
        <h2 className="text-2xl font-semibold">Recommendations</h2>
        <p className="text-sm text-bm-muted2">Ranked pilots, architectures, and modules with evidence from matched patterns and graph neighbors.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Loading recommendations...</div>
      ) : !recs.length ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
          No recommendations yet. Recommendations are generated from pattern matching against successful cohorts.
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((rec) => (
            <div key={rec.recommendation_id} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-bm-muted2 font-mono">#{rec.rank}</span>
                    <h3 className="text-sm font-semibold">{rec.title}</h3>
                    {typeBadge(rec.recommendation_type)}
                    {confidenceBadge(rec.confidence)}
                  </div>
                  {rec.description && <p className="text-sm text-bm-muted2">{rec.description}</p>}
                </div>
                <span className="inline-block rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs text-bm-muted2">{rec.status}</span>
              </div>

              {rec.evidence.length > 0 && (
                <div className="border-t border-bm-border/30 pt-2">
                  <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Evidence</p>
                  <ul className="space-y-1">
                    {rec.evidence.map((e, i) => (
                      <li key={i} className="text-xs text-bm-muted2">
                        Pattern {e.pattern_id.slice(0, 8)} ({e.support_count} supporting engagements) &mdash; {e.why_match}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
