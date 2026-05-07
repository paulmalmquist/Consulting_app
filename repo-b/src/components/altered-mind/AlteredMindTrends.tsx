"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { ApiError, fetchJson } from "@/lib/fetchJson";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WeeklyRow {
  id: string;
  week_starting: string;
  clients_seen: number | null;
  openings: number | null;
  cancellations: number | null;
  no_shows: number | null;
  new_referrals: number | null;
  weekly_revenue: number | null;
  capacity_utilization: number | null;
  self_pay_sessions: number | null;
  insurance_sessions: number | null;
  topics: Record<string, number | null>;
}

interface PlatformSummary {
  platform: string;
  total_leads: number;
  consults: number;
  intakes: number;
  conversions: number;
  conversion_rate: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = {
  currency: (n: number | null) =>
    n != null ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—",
  pct: (n: number | null) => (n != null ? `${(n * 100).toFixed(1)}%` : "—"),
  int: (n: number | null) => (n != null ? String(n) : "—"),
  date: (s: string) =>
    new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
};

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-bm-surface2/60">
        <div
          className={cn("h-1.5 rounded-full", className ?? "bg-bm-accent")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-bm-muted">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trends page component
// ---------------------------------------------------------------------------

export function AlteredMindTrends({ envId }: { envId: string }) {
  const [metrics, setMetrics] = useState<{ total_weeks: number; weeks: WeeklyRow[] } | null>(null);
  const [goals, setGoals] = useState<{
    total_referrals: number;
    platform_breakdown: PlatformSummary[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchJson<{ total_weeks: number; weeks: WeeklyRow[] }>(
        `/api/am/v1/metrics?env_id=${envId}&limit=16`
      ),
      fetchJson<{ total_referrals: number; platform_breakdown: PlatformSummary[] }>(
        `/api/am/v1/goals?env_id=${envId}`
      ),
    ])
      .then(([m, g]) => {
        setMetrics(m);
        setGoals(g);
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
      <div className="flex h-64 items-center justify-center">
        <p className="font-mono text-xs text-bm-muted2 animate-pulse">Loading trends…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 p-4">
        <p className="font-mono text-xs text-bm-danger">Error: {error}</p>
      </div>
    );
  }

  if (!metrics || metrics.total_weeks === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="font-semibold text-bm-text">No data available</p>
        <p className="font-mono text-xs text-bm-muted2">
          No weekly summaries found for this environment.
        </p>
      </div>
    );
  }

  const weeks = metrics.weeks;
  const maxRevenue = Math.max(...weeks.map((w) => w.weekly_revenue ?? 0));
  const maxClients = Math.max(...weeks.map((w) => w.clients_seen ?? 0));

  // Topic totals across all weeks
  const topicTotals: Record<string, number> = {};
  for (const w of weeks) {
    for (const [k, v] of Object.entries(w.topics ?? {})) {
      if (v != null) topicTotals[k] = (topicTotals[k] ?? 0) + v;
    }
  }
  const maxTopicCount = Math.max(...Object.values(topicTotals), 1);
  const topicLabels: Record<string, string> = {
    anxiety: "Anxiety",
    depression: "Depression",
    adhd: "ADHD",
    burnout: "Burnout",
    relationships: "Relationships",
    trauma_ptsd: "Trauma/PTSD",
    grief_loss: "Grief & Loss",
    life_transitions: "Life Transitions",
    relapse_prev: "Relapse Prevention",
    other: "Other",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-bm-text">
            Trends
          </h1>
          <p className="mt-0.5 font-mono text-xs text-bm-muted2">
            {metrics.total_weeks} weeks of data
          </p>
        </div>
        <Link
          href={`/lab/env/${envId}/operator/altered-mind`}
          className="font-mono text-xs text-bm-muted2 hover:text-bm-accent"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Weekly revenue + client volume table */}
      <section>
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Weekly Performance
        </h2>
        <div className="overflow-x-auto rounded-lg border border-bm-border/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                {["Week", "Clients", "Revenue trend", "Revenue", "Util", "Cancels", "Self-pay", "Insurance"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr
                  key={w.id}
                  className="border-b border-bm-border/20 transition-colors hover:bg-bm-surface2/30"
                >
                  <td className="px-3 py-2 font-mono text-xs text-bm-muted">
                    <Link
                      href={`/lab/env/${envId}/operator/altered-mind/week/${w.week_starting}`}
                      className="hover:text-bm-accent hover:underline"
                    >
                      {fmt.date(w.week_starting)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Bar
                      value={w.clients_seen ?? 0}
                      max={maxClients}
                      className="bg-bm-accent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Bar
                      value={w.weekly_revenue ?? 0}
                      max={maxRevenue}
                      className="bg-bm-success"
                    />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmt.currency(w.weekly_revenue)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmt.pct(w.capacity_utilization)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmt.int(w.cancellations)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmt.int(w.self_pay_sessions)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-bm-text">
                    {fmt.int(w.insurance_sessions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Topic distribution */}
      <section>
        <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Session Topic Distribution (all weeks)
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(topicTotals)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([key, count]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-md bg-bm-surface2/20 px-3 py-2">
                <span className="text-sm text-bm-muted">
                  {topicLabels[key] ?? key}
                </span>
                <Bar
                  value={count}
                  max={maxTopicCount}
                  className="bg-bm-accent/70"
                />
              </div>
            ))}
        </div>
      </section>

      {/* Referral platform breakdown */}
      {goals && goals.platform_breakdown.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Referral Funnel by Platform ({goals.total_referrals} total leads)
          </h2>
          <div className="overflow-x-auto rounded-lg border border-bm-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                  {["Platform", "Leads", "Consults", "Intakes", "Conversions", "Rate"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-bm-muted2"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {goals.platform_breakdown.map((p) => (
                  <tr
                    key={p.platform}
                    className="border-b border-bm-border/20 transition-colors hover:bg-bm-surface2/30"
                  >
                    <td className="px-3 py-2 font-medium text-bm-text">
                      {p.platform}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">{p.total_leads}</td>
                    <td className="px-3 py-2 tabular-nums text-bm-muted">{p.consults}</td>
                    <td className="px-3 py-2 tabular-nums text-bm-muted">{p.intakes}</td>
                    <td className="px-3 py-2 tabular-nums text-bm-text font-medium">
                      {p.conversions}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[10px]",
                          p.conversion_rate >= 0.3
                            ? "bg-bm-success/15 text-bm-success"
                            : p.conversion_rate >= 0.1
                            ? "bg-bm-warning/15 text-bm-warning"
                            : "bg-bm-danger/15 text-bm-danger"
                        )}
                      >
                        {(p.conversion_rate * 100).toFixed(0)}%
                      </span>
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
