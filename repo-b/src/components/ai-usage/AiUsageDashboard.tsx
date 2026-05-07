"use client";

import React, { useEffect, useState } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/cn";
import { ApiError, fetchJson } from "@/lib/fetchJson";

interface Summary {
  env_id: string;
  days: number;
  total_calls: number;
  total_cost_cents: number;
  by_model: Record<string, { calls: number; cost_cents: number }>;
  by_source: Record<string, { calls: number; cost_cents: number }>;
  by_business_unit: Record<string, { calls: number; cost_cents: number }>;
}

interface SkillRow {
  skill: string;
  calls: number;
  billed_input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  avg_duration_ms: number | null;
}

interface BySkill {
  env_id: string;
  rows: SkillRow[];
}

interface Recommendation {
  id: string;
  rule_code: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  body_md: string;
  target_skill: string | null;
  target_workflow: string | null;
  target_user_email: string | null;
  est_monthly_savings_cents: number;
  confidence_pct: number;
  state: string;
  first_detected_at: string;
  last_detected_at: string;
}

interface Recs {
  env_id: string;
  rows: Recommendation[];
}

const fmtCents = (c: number | null | undefined) =>
  c == null ? "—" : `$${(c / 100).toFixed(2)}`;
const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");

const SEVERITY_COLOR: Record<string, string> = {
  info: "bg-bm-muted2/20 text-bm-muted2",
  low: "bg-bm-warning/20 text-bm-warning",
  medium: "bg-bm-warning/30 text-bm-warning",
  high: "bg-bm-danger/20 text-bm-danger",
  critical: "bg-bm-danger/40 text-bm-danger",
};

export function AiUsageDashboard({ envId }: { envId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [skills, setSkills] = useState<BySkill | null>(null);
  const [recs, setRecs] = useState<Recs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchJson<Summary>(`/api/ai-usage/v1/summary?env_id=${envId}&days=30`),
      fetchJson<BySkill>(`/api/ai-usage/v1/by-skill?env_id=${envId}`),
      fetchJson<Recs>(`/api/ai-usage/v1/recommendations?env_id=${envId}`),
    ])
      .then(([s, k, rc]) => {
        setSummary(s);
        setSkills(k);
        setRecs(rc);
      })
      .catch((e) => {
        if (e instanceof ApiError) {
          const detail = (e.body as { detail?: string } | null)?.detail ?? "no detail";
          setError(`API ${e.status}: ${detail}`);
        } else {
          setError(String(e));
        }
      })
      .finally(() => setLoading(false));
  }, [envId]);

  if (loading) {
    return (
      <p className="font-mono text-xs text-bm-muted2 animate-pulse">
        Loading AI usage data…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 p-4">
        <p className="font-mono text-xs text-bm-danger">
          Failed to load AI usage: {error}
        </p>
      </div>
    );
  }

  if (!summary || summary.total_calls === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="font-semibold text-bm-text">No AI usage recorded yet</p>
        <p className="font-mono text-xs text-bm-muted2">
          Wire your clients to POST to /api/ai-usage/v1/events to start tracking.
        </p>
      </div>
    );
  }

  const openRecs = recs?.rows ?? [];
  const potentialSavings = openRecs.reduce(
    (sum, r) => sum + r.est_monthly_savings_cents,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-bm-text">
          AI Usage Attribution
        </h1>
        <p className="mt-0.5 font-mono text-xs text-bm-muted2">
          Last {summary.days} days · {summary.total_calls.toLocaleString()} API calls
        </p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="30-Day Spend"
          value={fmtCents(summary.total_cost_cents)}
          size="large"
        />
        <MetricCard
          label="API Calls"
          value={fmtInt(summary.total_calls)}
          size="large"
        />
        <MetricCard
          label="Open Recommendations"
          value={fmtInt(openRecs.length)}
          size="large"
        />
        <MetricCard
          label="Potential Monthly Savings"
          value={fmtCents(potentialSavings)}
          size="large"
        />
      </div>

      {/* Recommendations */}
      {openRecs.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Recommendations · sorted by estimated monthly savings
          </h2>
          <div className="space-y-3">
            {openRecs.map((r) => (
              <article
                key={r.id}
                className="rounded-lg border border-bm-border/50 bg-bm-surface2/30 p-4"
              >
                <header className="mb-2 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      SEVERITY_COLOR[r.severity] ?? SEVERITY_COLOR.info
                    )}
                  >
                    {r.severity}
                  </span>
                  <span className="font-mono text-[10px] text-bm-muted2">
                    {r.rule_code}
                  </span>
                  <span className="ml-auto font-semibold text-bm-text">
                    {fmtCents(r.est_monthly_savings_cents)}/mo
                  </span>
                  <span className="font-mono text-[10px] text-bm-muted2">
                    {r.confidence_pct}% confidence
                  </span>
                </header>
                <h3 className="mb-1 font-semibold text-bm-text">{r.title}</h3>
                <p className="whitespace-pre-wrap text-sm text-bm-muted">
                  {r.body_md}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Spend by model */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Spend by Model
        </h2>
        <div className="overflow-x-auto rounded-lg border border-bm-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                {["Model", "Calls", "Cost", "Share"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.by_model).map(([model, m]) => (
                <tr
                  key={model}
                  className="border-b border-bm-border/20"
                >
                  <td className="px-3 py-2 font-mono text-xs text-bm-text">
                    {model}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmtInt(m.calls)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmtCents(m.cost_cents)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-muted2">
                    {summary.total_cost_cents > 0
                      ? `${((m.cost_cents / summary.total_cost_cents) * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Spend by business unit */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Spend by Business Unit
        </h2>
        <div className="overflow-x-auto rounded-lg border border-bm-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                {["Business Unit", "Calls", "Cost", "Share"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.by_business_unit).map(([bu, m]) => (
                <tr key={bu} className="border-b border-bm-border/20">
                  <td className="px-3 py-2 text-bm-text">{bu}</td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmtInt(m.calls)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmtCents(m.cost_cents)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-muted2">
                    {summary.total_cost_cents > 0
                      ? `${((m.cost_cents / summary.total_cost_cents) * 100).toFixed(0)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top skills */}
      {skills && skills.rows.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Top Skills by Cost
          </h2>
          <div className="overflow-x-auto rounded-lg border border-bm-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                  {["Skill", "Calls", "Input Tokens", "Output Tokens", "Cost", "Avg Duration"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skills.rows.slice(0, 20).map((s) => (
                  <tr key={s.skill} className="border-b border-bm-border/20">
                    <td className="px-3 py-2 font-mono text-xs text-bm-text">
                      {s.skill}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmtInt(s.calls)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmtInt(s.billed_input_tokens)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmtInt(s.output_tokens)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmtCents(s.cost_cents)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-muted2">
                      {s.avg_duration_ms ? `${(s.avg_duration_ms / 1000).toFixed(1)}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
