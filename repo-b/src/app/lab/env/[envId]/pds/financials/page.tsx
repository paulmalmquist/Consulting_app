"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatCurrency } from "@/components/pds-enterprise/pdsEnterprise";
import { VarianceTable } from "@/components/pds-enterprise/VarianceTable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

/* ---------- types ---------- */

type ComparisonType = "budget_vs_actual" | "forecast_vs_actual" | "forecast_vs_budget" | "prior_year_vs_actual";

type VarianceRow = {
  period: string;
  base_revenue: number | null;
  compare_revenue: number | null;
  variance_amount: number | null;
  variance_pct: number | null;
};

type WaterfallStep = {
  name: string;
  value: number;
  cumulative: number;
};

const COMPARISON_OPTIONS: { key: ComparisonType; label: string; base: string; compare: string }[] = [
  { key: "budget_vs_actual", label: "Budget vs Actual", base: "Budget", compare: "Actual" },
  { key: "forecast_vs_actual", label: "Forecast vs Actual", base: "Forecast", compare: "Actual" },
  { key: "forecast_vs_budget", label: "Forecast vs Budget", base: "Budget", compare: "Forecast" },
  { key: "prior_year_vs_actual", label: "Prior Year vs Actual", base: "Prior Year", compare: "Actual" },
];

/* ---------- component ---------- */

export default function PdsFinancialsPage() {
  const { envId, businessId } = useDomainEnv();

  const [compType, setCompType] = useState<ComparisonType>("budget_vs_actual");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [varianceData, setVarianceData] = useState<VarianceRow[]>([]);
  const [waterfallData, setWaterfallData] = useState<WaterfallStep[]>([]);

  const selectedOption = COMPARISON_OPTIONS.find((o) => o.key === compType) ?? COMPARISON_OPTIONS[0];

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
        comparison: compType,
      };

      const [varRes, wfRes] = await Promise.all([
        bosFetch<{ rows: VarianceRow[] }>("/api/pds/v2/revenue/variance", { params }),
        bosFetch<{ steps: WaterfallStep[] }>("/api/pds/v2/revenue/waterfall", { params }),
      ]);

      setVarianceData(varRes.rows);
      setWaterfallData(wfRes.steps);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load financials data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, compType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        <p className="font-medium">Error loading financials</p>
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
        <h1 className="text-2xl font-bold text-zinc-100">Variance Analysis</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Compare budget, forecast, and prior-year performance to identify revenue drivers and gaps.
        </p>
      </div>

      {/* Comparison Selector */}
      <div className="flex flex-wrap gap-2">
        {COMPARISON_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setCompType(opt.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              compType === opt.key
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Waterfall Chart */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">
          {selectedOption.base} to {selectedOption.compare} Bridge
        </h2>
        {waterfallData.length > 0 ? (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={waterfallData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <ReferenceLine y={0} stroke="#6b7280" />
              <Bar dataKey="value" name="Change" radius={[4, 4, 0, 0]}>
                {waterfallData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.value >= 0 ? "#22c55e" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">No waterfall data available</p>
        )}
      </div>

      {/* Variance Table */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Period Detail</h2>
        {varianceData.length > 0 ? (
          <VarianceTable data={varianceData} baseLabel={selectedOption.base} compareLabel={selectedOption.compare} />
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">No variance data available</p>
        )}
      </div>
    </div>
  );
}
