"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRepeContext } from "@/lib/repe-context";

interface Decision {
  id: string;
  decision_type: string;
  tool_name: string | null;
  model_used: string | null;
  latency_ms: number | null;
  confidence: number | null;
  grounding_score: number | null;
  success: boolean;
  error_message: string | null;
  actor: string;
  tags: string[];
  created_at: string;
}

interface AuditStats {
  total_decisions: number;
  successful: number;
  failed: number;
  avg_latency_ms: number | null;
  avg_grounding_score: number | null;
}

interface AccuracyStats {
  scored_count: number;
  avg_score: number | null;
  high_count: number;
  mixed_count: number;
  low_count: number;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function successBadge(success: boolean): string {
  return success
    ? "bg-green-500/15 text-green-400 border border-green-500/30"
    : "bg-red-500/15 text-red-400 border border-red-500/30";
}

function groundingColor(score: number | null): string {
  if (score === null) return "text-bm-muted2";
  if (score >= 0.8) return "text-green-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

export default function AiAuditPage() {
  const { businessId, environmentId, loading } = useRepeContext();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [accuracyStats, setAccuracyStats] = useState<AccuracyStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const refresh = useCallback(async () => {
    if (!environmentId || !businessId) return;
    try {
      const url = new URL("/api/re/v2/ai-audit", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      url.searchParams.set("business_id", businessId);
      if (typeFilter !== "All") url.searchParams.set("decision_type", typeFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load audit data");
      const data = await res.json();
      setDecisions(data.decisions || []);
      setStats(data.stats || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [environmentId, businessId, typeFilter]);

  const refreshAccuracy = useCallback(async () => {
    if (!businessId) return;
    try {
      const url = new URL("/api/re/v2/ai-audit/accuracy-stats", window.location.origin);
      url.searchParams.set("business_id", businessId);
      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = await res.json();
      setAccuracyStats(data.stats || null);
    } catch {
      // accuracy stats are supplementary — don't block the page
    }
  }, [businessId]);

  useEffect(() => {
    refresh();
    refreshAccuracy();
  }, [refresh, refreshAccuracy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-bm-muted2">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-bm-white">AI Decision Audit Trail</h1>
        <p className="text-bm-muted2 mt-1">
          Every Winston AI decision is logged and traceable.
        </p>
      </div>

      {/* Stats Strip */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Decisions" value={stats.total_decisions} />
          <StatCard label="Successful" value={stats.successful} />
          <StatCard label="Failed" value={stats.failed} />
          <StatCard
            label="Avg Latency"
            value={stats.avg_latency_ms != null ? `${stats.avg_latency_ms}ms` : "\u2014"}
          />
          <StatCard
            label="Avg Grounding"
            value={
              stats.avg_grounding_score != null
                ? `${(stats.avg_grounding_score * 100).toFixed(0)}%`
                : "\u2014"
            }
          />
        </div>
      )}

      {/* Accuracy Scorecard */}
      {accuracyStats && accuracyStats.scored_count > 0 && (
        <div className="bg-bm-surface/20 border border-bm-border/30 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-bm-white uppercase tracking-wider">
            AI Accuracy Scorecard
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              label="Avg Grounding"
              value={
                accuracyStats.avg_score != null
                  ? `${(accuracyStats.avg_score * 100).toFixed(0)}%`
                  : "\u2014"
              }
            />
            <StatCard label="High Confidence" value={accuracyStats.high_count} />
            <StatCard label="Mixed" value={accuracyStats.mixed_count} />
            <StatCard label="Low Confidence" value={accuracyStats.low_count} />
            <StatCard label="Scored Responses" value={accuracyStats.scored_count} />
          </div>
          {/* Distribution bar */}
          {accuracyStats.scored_count > 0 && (
            <div className="flex h-2 rounded-full overflow-hidden bg-bm-surface/40">
              <div
                className="bg-green-500"
                style={{
                  width: `${(accuracyStats.high_count / accuracyStats.scored_count) * 100}%`,
                }}
              />
              <div
                className="bg-yellow-500"
                style={{
                  width: `${(accuracyStats.mixed_count / accuracyStats.scored_count) * 100}%`,
                }}
              />
              <div
                className="bg-red-500"
                style={{
                  width: `${(accuracyStats.low_count / accuracyStats.scored_count) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2">
        {["All", "tool_call", "response", "classification", "fast_path"].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded text-sm border transition-colors ${
              typeFilter === t
                ? "bg-bm-accent/20 text-bm-accent border-bm-accent/40"
                : "bg-bm-surface/40 text-bm-muted2 border-bm-border/30 hover:bg-bm-surface/60"
            }`}
          >
            {t === "All" ? "All" : t.replace("_", " ")}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded border border-bm-border/30 bg-bm-surface/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/30 text-bm-muted2">
              <th className="text-left p-3 font-medium">Timestamp</th>
              <th className="text-left p-3 font-medium">Type</th>
              <th className="text-left p-3 font-medium">Tool</th>
              <th className="text-left p-3 font-medium">Actor</th>
              <th className="text-right p-3 font-medium">Latency</th>
              <th className="text-right p-3 font-medium">Grounding</th>
              <th className="text-center p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <tr
                key={d.id}
                className="border-b border-bm-border/20 hover:bg-bm-surface/30 transition-colors"
              >
                <td className="p-3 text-bm-muted2 whitespace-nowrap">
                  {formatDate(d.created_at)}
                </td>
                <td className="p-3 text-bm-white">{d.decision_type}</td>
                <td className="p-3 text-bm-white font-mono text-xs">
                  {d.tool_name || "\u2014"}
                </td>
                <td className="p-3 text-bm-muted2">{d.actor}</td>
                <td className="p-3 text-right text-bm-muted2">
                  {d.latency_ms != null ? `${d.latency_ms}ms` : "\u2014"}
                </td>
                <td className={`p-3 text-right ${groundingColor(d.grounding_score)}`}>
                  {d.grounding_score != null
                    ? `${(d.grounding_score * 100).toFixed(0)}%`
                    : "\u2014"}
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs ${successBadge(d.success)}`}
                  >
                    {d.success ? "OK" : "ERR"}
                  </span>
                </td>
              </tr>
            ))}
            {decisions.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-bm-muted2">
                  No audit decisions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-bm-surface/30 border border-bm-border/30 rounded-lg p-4">
      <div className="text-bm-muted2 text-xs uppercase tracking-wider">{label}</div>
      <div className="text-bm-white text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
