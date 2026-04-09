"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { formatNumber, formatPercent } from "@/components/pds-enterprise/pdsEnterprise";
import { bosFetch } from "@/lib/bos-api";

type CapacityForecastRow = {
  month: string;
  headcount: number;
  supply_hours: number;
  demand_hours: number;
  gap_hours: number;
  gap_pct: number;
};

type BenchRow = {
  employee_id: string;
  employee_name: string;
  role_level: string;
  region: string | null;
  allocation_pct: number;
  availability_pct: number;
  assignment_count: number;
};

function StatCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{subtext}</p>
    </div>
  );
}

export default function CapacityPlanningPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<CapacityForecastRow[]>([]);
  const [bench, setBench] = useState<BenchRow[]>([]);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
      };

      const [forecastRes, benchRes] = await Promise.all([
        bosFetch<{ forecast: CapacityForecastRow[] }>("/api/pds/v2/utilization/capacity-demand", { params }),
        bosFetch<{ bench: BenchRow[] }>("/api/pds/v2/utilization/bench", { params }),
      ]);

      setForecast(forecastRes.forecast ?? []);
      setBench(benchRes.bench ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load capacity planning data");
    } finally {
      setLoading(false);
    }
  }, [businessId, envId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const latest = forecast.at(-1);
  const peakDemand = useMemo(() => forecast.reduce((max, row) => Math.max(max, Number(row.demand_hours || 0)), 0), [forecast]);
  const tightMonths = useMemo(() => forecast.filter((row) => Number(row.gap_hours || 0) < 0).length, [forecast]);
  const mostAvailableBench = useMemo(
    () => [...bench].sort((left, right) => Number(right.availability_pct || 0) - Number(left.availability_pct || 0)).slice(0, 8),
    [bench],
  );

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
        <p className="font-medium">Error loading capacity planning data</p>
        <p className="mt-1 text-sm text-red-300">{error}</p>
        <button onClick={fetchData} className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Capacity Planning</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Compare forward demand against available supply and pull the highest-availability bench into the staffing conversation.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Latest Gap"
          value={latest ? formatNumber(latest.gap_hours, 0) : "0"}
          subtext={latest ? `${latest.month} capacity gap (hours)` : "No forecast horizon loaded"}
        />
        <StatCard
          label="Gap %"
          value={latest ? formatPercent(latest.gap_pct / 100) : "0%"}
          subtext="Positive = spare capacity, negative = shortfall"
        />
        <StatCard
          label="Peak Demand"
          value={formatNumber(peakDemand, 0)}
          subtext="Highest demand month in the current horizon"
        />
        <StatCard
          label="Tight Months"
          value={formatNumber(tightMonths, 0)}
          subtext="Months with demand exceeding supply"
        />
      </div>

      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Supply vs Demand Horizon</h2>
        {forecast.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={forecast}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
              <Legend />
              <ReferenceLine y={0} stroke="#6b7280" />
              <Area type="monotone" dataKey="supply_hours" name="Supply Hours" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.16} strokeWidth={2} />
              <Area type="monotone" dataKey="demand_hours" name="Demand Hours" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.16} strokeWidth={2} />
              <Area type="monotone" dataKey="gap_hours" name="Gap Hours" stroke="#ef4444" fill="#ef4444" fillOpacity={0.08} strokeWidth={1} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-10 text-center text-sm text-zinc-500">No capacity forecast is available for this environment yet.</p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Monthly Planning Detail</h2>
          {forecast.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    <th className="py-2 text-left font-medium">Month</th>
                    <th className="py-2 text-left font-medium">Headcount</th>
                    <th className="py-2 text-left font-medium">Supply</th>
                    <th className="py-2 text-left font-medium">Demand</th>
                    <th className="py-2 text-left font-medium">Gap</th>
                    <th className="py-2 text-left font-medium">Gap %</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((row) => (
                    <tr key={row.month} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="py-2 text-zinc-200">{row.month}</td>
                      <td className="py-2 text-zinc-300">{formatNumber(row.headcount, 0)}</td>
                      <td className="py-2 text-zinc-300">{formatNumber(row.supply_hours, 0)}</td>
                      <td className="py-2 text-zinc-300">{formatNumber(row.demand_hours, 0)}</td>
                      <td className={`py-2 ${row.gap_hours < 0 ? "text-red-400" : "text-green-400"}`}>{formatNumber(row.gap_hours, 0)}</td>
                      <td className={`py-2 ${row.gap_pct < 0 ? "text-red-400" : "text-green-400"}`}>{formatPercent(row.gap_pct / 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-500">No planning rows available.</p>
          )}
        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Highest Availability Bench</h2>
          {mostAvailableBench.length > 0 ? (
            <div className="space-y-3">
              {mostAvailableBench.map((employee) => (
                <div key={employee.employee_id} className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-zinc-100">{employee.employee_name}</p>
                      <p className="text-xs text-zinc-500">
                        {employee.role_level} {employee.region ? `· ${employee.region}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300">
                      {formatPercent(employee.availability_pct / 100)} free
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">
                    Allocation {formatPercent(employee.allocation_pct / 100)} across {formatNumber(employee.assignment_count, 0)} active assignments.
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-zinc-500">No bench resources are available in the current horizon.</p>
          )}
        </section>
      </div>
    </div>
  );
}
