"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatPercent } from "@/components/pds-enterprise/pdsEnterprise";
import { utilizationColor, UTILIZATION_THRESHOLDS } from "@/lib/pds-thresholds";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

/* ---------- types ---------- */

type DistributionBin = {
  bin: string;
  count: number;
  pct_low: number;
  pct_high: number;
};

type BenchEmployee = {
  employee_id: string;
  employee_name: string;
  role: string;
  last_billable_date: string | null;
  weeks_on_bench: number;
  skills: string[];
};

type OvertimeAlert = {
  employee_id: string;
  employee_name: string;
  role: string;
  utilization_pct: number;
  hours_over: number;
};

/* ---------- component ---------- */

export default function PdsTimecardsPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [distribution, setDistribution] = useState<DistributionBin[]>([]);
  const [bench, setBench] = useState<BenchEmployee[]>([]);
  const [overtime, setOvertime] = useState<OvertimeAlert[]>([]);

  const [benchSort, setBenchSort] = useState<keyof BenchEmployee>("weeks_on_bench");
  const [benchAsc, setBenchAsc] = useState(false);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
      };

      const [distRes, benchRes] = await Promise.all([
        bosFetch<{ bins: DistributionBin[]; overtime_alerts: OvertimeAlert[] }>("/api/pds/v2/utilization/distribution", { params }),
        bosFetch<{ employees: BenchEmployee[] }>("/api/pds/v2/utilization/bench", { params }),
      ]);

      setDistribution(distRes.bins ?? []);
      setOvertime(distRes.overtime_alerts ?? []);
      setBench(benchRes.employees ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load timecard data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBenchSort = (field: keyof BenchEmployee) => {
    if (benchSort === field) {
      setBenchAsc(!benchAsc);
    } else {
      setBenchSort(field);
      setBenchAsc(true);
    }
  };

  const sortedBench = [...bench].sort((a, b) => {
    const av = a[benchSort];
    const bv = b[benchSort];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return benchAsc ? cmp : -cmp;
  });

  const binColor = (bin: DistributionBin): string => {
    const mid = (bin.pct_low + bin.pct_high) / 2;
    if (mid < UTILIZATION_THRESHOLDS.severely_under) return "#9ca3af";
    if (mid < UTILIZATION_THRESHOLDS.under) return "#eab308";
    if (mid < UTILIZATION_THRESHOLDS.target_high) return "#22c55e";
    if (mid < UTILIZATION_THRESHOLDS.high) return "#f97316";
    return "#ef4444";
  };

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
        <p className="font-medium">Error loading timecard data</p>
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
        <h1 className="text-2xl font-bold text-zinc-100">Timecard Analytics</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Analyze workload distribution, bench resources, and overtime alerts.
        </p>
      </div>

      {/* Workload Distribution Histogram */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Workload Distribution</h2>
        {distribution.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="bin" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                label={{ value: "Employees", angle: -90, position: "insideLeft", fill: "#9ca3af", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              />
              <ReferenceLine x="70-80%" stroke="#3b82f6" strokeDasharray="4 2" label={{ value: "Target", fill: "#3b82f6", fontSize: 11 }} />
              <Bar dataKey="count" name="Employees" radius={[4, 4, 0, 0]}>
                {distribution.map((bin, idx) => (
                  <Cell key={idx} fill={binColor(bin)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">No distribution data available</p>
        )}
      </div>

      {/* Overtime Alerts */}
      {overtime.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <h2 className="mb-3 text-sm font-medium text-red-300">
            Overtime Alerts ({overtime.length} employees &gt;110%)
          </h2>
          <div className="space-y-2">
            {overtime.map((emp) => (
              <div
                key={emp.employee_id}
                className="flex items-center justify-between rounded border border-red-500/20 bg-zinc-900/60 px-4 py-2 text-sm"
              >
                <div>
                  <span className="font-medium text-zinc-200">{emp.employee_name}</span>
                  <span className="ml-2 text-zinc-500">{emp.role}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`font-mono font-medium ${utilizationColor(emp.utilization_pct)}`}>
                    {formatPercent(emp.utilization_pct / 100)}
                  </span>
                  <span className="text-xs text-zinc-500">+{emp.hours_over}h over</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bench List */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">
          Bench Resources ({bench.length})
        </h2>
        {sortedBench.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  {(
                    [
                      ["employee_name", "Name"],
                      ["role", "Role"],
                      ["weeks_on_bench", "Weeks on Bench"],
                      ["last_billable_date", "Last Billable"],
                    ] as [keyof BenchEmployee, string][]
                  ).map(([field, label]) => (
                    <th
                      key={field}
                      onClick={() => handleBenchSort(field)}
                      className="cursor-pointer py-2 text-left text-xs font-medium hover:text-zinc-200"
                    >
                      {label} {benchSort === field ? (benchAsc ? "\u25B2" : "\u25BC") : ""}
                    </th>
                  ))}
                  <th className="py-2 text-left text-xs font-medium text-zinc-400">Skills</th>
                </tr>
              </thead>
              <tbody>
                {sortedBench.map((emp) => (
                  <tr key={emp.employee_id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="py-2 text-zinc-200">{emp.employee_name}</td>
                    <td className="py-2 text-zinc-400">{emp.role}</td>
                    <td className="py-2 text-zinc-300">
                      <span className={emp.weeks_on_bench > 4 ? "text-red-400 font-medium" : ""}>
                        {emp.weeks_on_bench}
                      </span>
                    </td>
                    <td className="py-2 text-zinc-400">
                      {emp.last_billable_date ?? "Never"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {emp.skills.map((s) => (
                          <span key={s} className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">No one on the bench</p>
        )}
      </div>
    </div>
  );
}
