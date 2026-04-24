"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types (mirror backend schemas)
// ---------------------------------------------------------------------------

interface WeeklyTrend {
  week_starting: string;
  clients_seen: number | null;
  weekly_revenue: number | null;
  capacity_utilization: number | null;
  new_referrals: number | null;
  cancellations: number | null;
}

interface Reflection {
  id: string;
  reflection_month: string;
  theme: string | null;
  wins: string | null;
  challenges: string | null;
  adjustment: string | null;
}

interface DashboardData {
  env_id: string;
  has_data: boolean;
  latest_week_starting: string | null;
  latest_clients_seen: number | null;
  latest_weekly_revenue: number | null;
  latest_capacity_utilization: number | null;
  ytd_revenue: number | null;
  ytd_sessions: number | null;
  total_referrals: number | null;
  conversion_rate: number | null;
  trend: WeeklyTrend[];
  latest_reflection: Reflection | null;
}

interface CheckinRow {
  id: string;
  session_date: string;
  clients_seen: number | null;
  revenue_dollars: number | null;
  utilization_pct: number | null;
  cancellations: number | null;
  new_referrals: number | null;
  notes: string | null;
}

interface CheckinsData {
  env_id: string;
  total: number;
  rows: CheckinRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = {
  currency: (n: number | null) =>
    n != null ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—",
  pct: (n: number | null) =>
    n != null ? `${(n * 100).toFixed(1)}%` : "—",
  int: (n: number | null) => (n != null ? String(n) : "—"),
  date: (s: string | null) =>
    s
      ? new Date(s).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "—",
  weekOf: (s: string | null) =>
    s
      ? `Week of ${new Date(s).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}`
      : "—",
};

function utilizationBar(pct: number | null) {
  const v = pct != null ? Math.min(Math.max(pct * 100, 0), 100) : 0;
  const color =
    v >= 80 ? "bg-bm-success" : v >= 60 ? "bg-bm-warning" : "bg-bm-danger";
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-bm-surface2/60">
      <div
        className={cn("h-1 rounded-full transition-all", color)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard component
// ---------------------------------------------------------------------------

export function AlteredMindDashboard({ envId }: { envId: string }) {
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [checkins, setCheckins] = useState<CheckinsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/am/v1/dashboard?env_id=${envId}`).then((r) => r.json()),
      fetch(`/api/am/v1/checkins?env_id=${envId}&limit=10`).then((r) => r.json()),
    ])
      .then(([d, c]) => {
        setDash(d);
        setCheckins(c);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [envId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="font-mono text-xs text-bm-muted2 animate-pulse">
          Loading Altered Mind data…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-bm-danger/30 bg-bm-danger/10 p-4">
        <p className="font-mono text-xs text-bm-danger">
          Failed to load dashboard: {error}
        </p>
      </div>
    );
  }

  if (!dash?.has_data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="font-semibold text-bm-text">No data available</p>
        <p className="font-mono text-xs text-bm-muted2">
          Run the ingestion pipeline to seed this environment.
        </p>
      </div>
    );
  }

  const trend = dash.trend ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-xl font-semibold text-bm-text">
          Altered Mind
        </h1>
        <p className="mt-0.5 font-mono text-xs text-bm-muted2">
          Therapy practice analytics · {fmt.weekOf(dash.latest_week_starting)}
        </p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Clients This Week"
          value={fmt.int(dash.latest_clients_seen)}
          size="large"
        />
        <MetricCard
          label="Weekly Revenue"
          value={fmt.currency(dash.latest_weekly_revenue)}
          size="large"
        />
        <MetricCard
          label="Capacity"
          value={fmt.pct(dash.latest_capacity_utilization)}
          size="large"
        />
        <MetricCard
          label="YTD Revenue"
          value={fmt.currency(dash.ytd_revenue)}
          size="large"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="YTD Sessions"
          value={fmt.int(dash.ytd_sessions)}
        />
        <MetricCard
          label="Total Referrals"
          value={fmt.int(dash.total_referrals)}
        />
        <MetricCard
          label="Conversion Rate"
          value={fmt.pct(dash.conversion_rate)}
        />
        <div />
      </div>

      {/* Trend sparkline table */}
      {trend.length > 0 && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            8-Week Trend
          </h2>
          <div className="overflow-x-auto rounded-lg border border-bm-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                  {["Week", "Clients", "Revenue", "Utilization", "Referrals", "Cancels"].map(
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
                {trend.map((row, i) => (
                  <tr
                    key={row.week_starting}
                    className={cn(
                      "border-b border-bm-border/20 transition-colors hover:bg-bm-surface2/30",
                      i === trend.length - 1 && "border-b-0 font-medium"
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs text-bm-muted">
                      <Link
                        href={`/lab/env/${envId}/operator/altered-mind/week/${row.week_starting}`}
                        className="hover:text-bm-accent hover:underline"
                      >
                        {fmt.date(row.week_starting)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.int(row.clients_seen)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.currency(row.weekly_revenue)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-bm-text">
                          {fmt.pct(row.capacity_utilization)}
                        </span>
                        <div className="w-16">
                          {utilizationBar(row.capacity_utilization)}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.int(row.new_referrals)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.int(row.cancellations)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recent check-ins */}
      {checkins && checkins.total > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
              Recent Check-ins ({checkins.total} total)
            </h2>
            <Link
              href={`/lab/env/${envId}/operator/altered-mind/trends`}
              className="font-mono text-[10px] text-bm-accent hover:underline"
            >
              View trends →
            </Link>
          </div>
          <div className="overflow-x-auto rounded-lg border border-bm-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/40 bg-bm-surface2/40">
                  {["Date", "Clients", "Revenue", "Util %", "Cancels", "Referrals", "Notes"].map(
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
                {checkins.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-bm-border/20 transition-colors hover:bg-bm-surface2/30"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-bm-muted">
                      <Link
                        href={`/lab/env/${envId}/operator/altered-mind/week/${row.session_date}`}
                        className="hover:text-bm-accent hover:underline"
                      >
                        {fmt.date(row.session_date)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.int(row.clients_seen)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.currency(row.revenue_dollars)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.pct(row.utilization_pct)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.int(row.cancellations)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-bm-text">
                      {fmt.int(row.new_referrals)}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-xs text-bm-muted2">
                      {row.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Latest reflection */}
      {dash.latest_reflection && (
        <section>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Latest Reflection · {dash.latest_reflection.reflection_month}
          </h2>
          <div className="rounded-lg border border-bm-border/50 bg-bm-surface2/30 p-4">
            {dash.latest_reflection.theme && (
              <p className="mb-2 font-semibold text-bm-text">
                {dash.latest_reflection.theme}
              </p>
            )}
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              {[
                { label: "Wins", value: dash.latest_reflection.wins },
                { label: "Challenges", value: dash.latest_reflection.challenges },
                { label: "Adjustment", value: dash.latest_reflection.adjustment },
              ].map(({ label, value }) =>
                value ? (
                  <div key={label}>
                    <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
                      {label}
                    </p>
                    <p className="text-bm-muted">{value}</p>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
