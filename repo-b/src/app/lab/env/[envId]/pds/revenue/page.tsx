"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatCurrency, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";
import { ForecastVersionSelector } from "@/components/pds-enterprise/ForecastVersionSelector";
import { GovernanceTrackToggle } from "@/components/pds-enterprise/GovernanceTrackToggle";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ---------- types ---------- */

type KpiData = {
  total_revenue_ytd: number;
  vs_budget_pct: number;
  vs_prior_year_pct: number;
  backlog: number;
};

type TimeSeriesRow = {
  period: string;
  actual: number | null;
  [key: string]: number | string | null; // forecast version keys
};

type MixSlice = {
  name: string;
  value: number;
};

const MIX_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b"];

/* ---------- component ---------- */

export default function PdsRevenuePage() {
  const { envId, businessId } = useDomainEnv();

  const [selectedVersions, setSelectedVersions] = useState<string[]>(["budget"]);
  const [governanceTrack, setGovernanceTrack] = useState<"all" | "variable" | "dedicated">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesRow[]>([]);
  const [mix, setMix] = useState<MixSlice[]>([]);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
        governance_track: governanceTrack,
        versions: selectedVersions.join(","),
      };

      const [tsRes, mixRes] = await Promise.all([
        bosFetch<{ kpi: KpiData; rows: TimeSeriesRow[] }>("/api/pds/v2/revenue/time-series", { params }),
        bosFetch<{ slices: MixSlice[] }>("/api/pds/v2/revenue/mix", { params }),
      ]);

      setKpi(tsRes.kpi);
      setTimeSeries(tsRes.rows);
      setMix(mixRes.slices);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, governanceTrack, selectedVersions]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- KPI card helper ---------- */
  function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-5 py-4">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      </div>
    );
  }

  /* ---------- render ---------- */
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-red-200">
        <p className="font-medium">Error loading revenue data</p>
        <p className="mt-1 text-sm text-red-300">{error}</p>
        <button onClick={fetchData} className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Fee Revenue Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Track fee revenue, compare forecast versions, and analyze revenue mix.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <ForecastVersionSelector selected={selectedVersions} onChange={setSelectedVersions} />
        <GovernanceTrackToggle value={governanceTrack} onChange={setGovernanceTrack} />
      </div>

      {/* KPI Strip */}
      {kpi && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Total Revenue YTD" value={formatCurrency(kpi.total_revenue_ytd)} />
          <KpiCard
            label="vs Budget"
            value={formatPercent(kpi.vs_budget_pct / 100)}
            sub={kpi.vs_budget_pct >= 0 ? "On track" : "Below plan"}
          />
          <KpiCard
            label="vs Prior Year"
            value={formatPercent(kpi.vs_prior_year_pct / 100)}
            sub={kpi.vs_prior_year_pct >= 0 ? "Growth" : "Decline"}
          />
          <KpiCard label="Backlog" value={formatCurrency(kpi.backlog)} />
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Time Series Chart */}
        <div className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Revenue Over Time</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend />
              <Bar dataKey="actual" name="Actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              {selectedVersions.map((v, i) => (
                <Line
                  key={v}
                  dataKey={v}
                  name={v.replace(/_/g, " ")}
                  stroke={MIX_COLORS[(i + 1) % MIX_COLORS.length]}
                  strokeDasharray="6 3"
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue Mix Donut */}
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Revenue Mix</h2>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={mix}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }: { name: string; percent: number }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {mix.map((_, idx) => (
                  <Cell key={idx} fill={MIX_COLORS[idx % MIX_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
