"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatPercent } from "@/components/pds-enterprise/pdsEnterprise";
import {
  UTILIZATION_THRESHOLDS,
  INDUSTRY_BENCHMARK,
  FIRM_TARGET,
  utilizationBg,
  utilizationColor,
} from "@/lib/pds-thresholds";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ---------- types ---------- */

type KpiData = {
  firm_utilization_pct: number;
  bench_count: number;
};

type HeatmapRow = {
  employee_id: string;
  employee_name: string;
  role: string;
  months: Record<string, number>; // key = "2026-01", value = utilization pct
};

type CapacityDemandRow = {
  period: string;
  supply: number;
  demand: number;
  gap: number;
};

/* ---------- component ---------- */

export default function PdsResourcesPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapRow[]>([]);
  const [heatmapMonths, setHeatmapMonths] = useState<string[]>([]);
  const [capacityDemand, setCapacityDemand] = useState<CapacityDemandRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
      };

      const [hmRes, cdRes] = await Promise.all([
        bosFetch<{ kpi: KpiData; months: string[]; rows: HeatmapRow[] }>("/api/pds/v2/utilization/heatmap", { params }),
        bosFetch<{ rows: CapacityDemandRow[] }>("/api/pds/v2/utilization/capacity-demand", { params }),
      ]);

      setKpi(hmRes.kpi);
      setHeatmap(hmRes.rows ?? []);
      setHeatmapMonths(hmRes.months ?? []);
      setCapacityDemand(cdRes.rows ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load utilization data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- KPI helpers ---------- */
  function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
    return (
      <div className={`rounded-lg border px-5 py-4 ${highlight ? "border-blue-500/40 bg-blue-500/10" : "border-zinc-700 bg-zinc-800/60"}`}>
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
        <p className="font-medium">Error loading utilization data</p>
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
        <h1 className="text-2xl font-bold text-zinc-100">Utilization Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor firm-wide utilization, identify capacity gaps, and manage bench resources.
        </p>
      </div>

      {/* KPI Strip */}
      {kpi && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Firm Utilization"
            value={formatPercent(kpi.firm_utilization_pct / 100)}
            highlight
          />
          <KpiCard
            label="vs Benchmark"
            value={`${INDUSTRY_BENCHMARK}%`}
            sub={kpi.firm_utilization_pct >= INDUSTRY_BENCHMARK ? "Above benchmark" : "Below benchmark"}
          />
          <KpiCard
            label="vs Target"
            value={`${FIRM_TARGET}%`}
            sub={kpi.firm_utilization_pct >= FIRM_TARGET ? "On target" : "Below target"}
          />
          <KpiCard label="Bench Count" value={String(kpi.bench_count)} sub="Unassigned resources" />
        </div>
      )}

      {/* Utilization Heatmap */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Utilization Heatmap</h2>
        {heatmap.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th className="py-2 text-left font-medium">Employee</th>
                  <th className="py-2 text-left font-medium">Role</th>
                  {heatmapMonths.map((m) => (
                    <th key={m} className="py-2 text-center font-medium">
                      {m.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row) => (
                  <tr key={row.employee_id} className="border-b border-zinc-800">
                    <td className="py-1.5 text-zinc-200">{row.employee_name}</td>
                    <td className="py-1.5 text-zinc-400">{row.role}</td>
                    {heatmapMonths.map((m) => {
                      const pct = row.months[m] ?? 0;
                      return (
                        <td key={m} className="py-1.5 text-center">
                          <span
                            className={`inline-block min-w-[2.5rem] rounded px-1 py-0.5 text-xs font-medium ${utilizationBg(pct)} ${utilizationColor(pct)}`}
                          >
                            {pct}%
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">No heatmap data available</p>
        )}

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-gray-200" />
            &lt;{UTILIZATION_THRESHOLDS.severely_under}% Severe
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-yellow-100" />
            {UTILIZATION_THRESHOLDS.severely_under}-{UTILIZATION_THRESHOLDS.under}% Under
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-green-100" />
            {UTILIZATION_THRESHOLDS.under}-{UTILIZATION_THRESHOLDS.target_high}% Target
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-orange-100" />
            {UTILIZATION_THRESHOLDS.target_high}-{UTILIZATION_THRESHOLDS.high}% High
          </span>
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-red-100" />
            &gt;{UTILIZATION_THRESHOLDS.high}% Overtime
          </span>
        </div>
      </div>

      {/* Capacity vs Demand */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Capacity vs Demand</h2>
        {capacityDemand.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={capacityDemand}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#6b7280" />
              <Area
                type="monotone"
                dataKey="supply"
                name="Supply (FTE)"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="demand"
                name="Demand (FTE)"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="gap"
                name="Gap"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.1}
                strokeWidth={1}
                strokeDasharray="4 2"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">No capacity data available</p>
        )}
      </div>
    </div>
  );
}
