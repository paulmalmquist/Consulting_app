"use client";

import React, { useEffect, useState } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const API_BASE = process.env.NEXT_PUBLIC_BOS_API_URL || "http://localhost:8000";

type Prediction = {
  prediction_id: string;
  engagement_id: string;
  prediction_type: string;
  industry: string | null;
  vendor_stack: string[];
  workflows: string[];
  likely_issues: { issue: string; confidence: number; matched_pattern_id?: string }[];
  recommended_discovery_requests: { request: string; reason: string }[];
  matched_patterns: string[];
  overall_confidence: number | null;
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

export default function PredictionsPage() {
  const { envId, businessId } = useDomainEnv();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ env_id: envId });
      if (businessId) qs.set("business_id", businessId);
      const res = await fetch(`${API_BASE}/api/pattern-intel/v1/predictions/early-warning?${qs}`);
      if (!res.ok) throw new Error(`Predictions: ${res.status}`);
      setPredictions(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load predictions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  return (
    <section className="space-y-5" data-testid="pattern-intel-predictions">
      <div>
        <h2 className="text-2xl font-semibold">Early Warning Predictions</h2>
        <p className="text-sm text-bm-muted2">Account-level predictions based on industry, vendor stack, and workflow pattern matching.</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => void refresh()} className="ml-4 text-xs underline">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-bm-border/70 p-5 text-sm text-bm-muted2">Loading predictions...</div>
      ) : !predictions.length ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-5 text-sm text-bm-muted2">
          No predictions yet. Early Warning runs automatically when new Discovery Lab accounts are created or updated.
        </div>
      ) : (
        <div className="space-y-3">
          {predictions.map((pred) => (
            <div key={pred.prediction_id} className="rounded-xl border border-bm-border/70 bg-bm-surface/20 overflow-hidden">
              <button
                type="button"
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-bm-surface/30"
                onClick={() => setExpanded(expanded === pred.prediction_id ? null : pred.prediction_id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{pred.industry || "Unknown Industry"}</span>
                  {confidenceBadge(pred.overall_confidence)}
                  <span className="text-xs text-bm-muted2">{pred.likely_issues.length} likely issues</span>
                  <span className="text-xs text-bm-muted2">{pred.matched_patterns.length} matched patterns</span>
                </div>
                <span className="text-xs text-bm-muted2">{expanded === pred.prediction_id ? "\u25B2" : "\u25BC"}</span>
              </button>

              {expanded === pred.prediction_id && (
                <div className="border-t border-bm-border/40 px-4 py-3 space-y-3">
                  {pred.vendor_stack.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Vendor Stack</p>
                      <div className="flex flex-wrap gap-1">
                        {pred.vendor_stack.map((v) => (
                          <span key={v} className="inline-block rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs">{v}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {pred.likely_issues.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Likely Issues</p>
                      <ul className="space-y-1">
                        {pred.likely_issues.map((issue, i) => (
                          <li key={i} className="text-sm flex items-center gap-2">
                            <span>{issue.issue}</span>
                            {confidenceBadge(issue.confidence)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pred.recommended_discovery_requests.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-1">Recommended Discovery Requests</p>
                      <ul className="space-y-1">
                        {pred.recommended_discovery_requests.map((req, i) => (
                          <li key={i} className="text-sm text-bm-muted2">{req.request} &mdash; {req.reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
