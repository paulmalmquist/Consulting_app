"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatPercent, formatNumber } from "@/components/pds-enterprise/pdsEnterprise";
import { DAU_MAU_BENCHMARKS } from "@/lib/pds-thresholds";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

/* ---------- types ---------- */

type ToolOverview = {
  tool_id: string;
  tool_name: string;
  adoption_rate_pct: number;
  dau_mau_ratio: number;
  active_users: number;
  licensed_users: number;
};

type HealthScoreRow = {
  account_id: string;
  account_name: string;
  health_score: number;
  adoption_pct: number;
  engagement_score: number;
  trend: "improving" | "stable" | "declining";
};

type TrendPoint = {
  period: string;
  [tool: string]: number | string; // tool_name -> dau_mau_ratio
};

const TREND_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#22c55e", "#ef4444", "#ec4899"];

/* ---------- helpers ---------- */

function healthScoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 60) return "text-yellow-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

function healthScoreBg(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-yellow-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-red-500";
}

function dauMauLabel(ratio: number): { label: string; color: string } {
  if (ratio >= DAU_MAU_BENCHMARKS.excellent) return { label: "Excellent", color: "text-green-400" };
  if (ratio >= DAU_MAU_BENCHMARKS.average) return { label: "Average", color: "text-yellow-400" };
  if (ratio >= DAU_MAU_BENCHMARKS.low) return { label: "Low", color: "text-orange-400" };
  return { label: "Critical", color: "text-red-400" };
}

/* ---------- component ---------- */

export default function PdsAdoptionPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tools, setTools] = useState<ToolOverview[]>([]);
  const [healthScores, setHealthScores] = useState<HealthScoreRow[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [trendToolNames, setTrendToolNames] = useState<string[]>([]);

  const [sortField, setSortField] = useState<keyof HealthScoreRow>("health_score");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
      };

      const [overviewRes, healthRes, trendsRes] = await Promise.all([
        bosFetch<{ tools: ToolOverview[] }>("/api/pds/v2/adoption/overview", { params }),
        bosFetch<{ accounts: HealthScoreRow[] }>("/api/pds/v2/adoption/health-score", { params }),
        bosFetch<{ tool_names: string[]; rows: TrendPoint[] }>("/api/pds/v2/adoption/trends", { params }),
      ]);

      setTools(overviewRes.tools ?? []);
      setHealthScores(healthRes.accounts ?? []);
      setTrends(trendsRes.rows ?? []);
      setTrendToolNames(trendsRes.tool_names ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load adoption data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: keyof HealthScoreRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedHealth = [...healthScores].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortAsc ? cmp : -cmp;
  });

  const TREND_ARROWS: Record<string, string> = {
    improving: "\u2191",
    stable: "\u2192",
    declining: "\u2193",
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
        <p className="font-medium">Error loading adoption data</p>
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
        <h1 className="text-2xl font-bold text-zinc-100">Technology Adoption</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Monitor tool adoption rates, DAU/MAU engagement, and account health scores.
        </p>
      </div>

      {/* Tool Adoption Cards */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-zinc-300">Tool Overview</h2>
        {tools.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((tool) => {
              const dau = dauMauLabel(tool.dau_mau_ratio);
              return (
                <div
                  key={tool.tool_id}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4"
                >
                  <h3 className="text-sm font-semibold text-zinc-100">{tool.tool_name}</h3>

                  <div className="mt-3 space-y-2">
                    {/* Adoption Rate */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Adoption</span>
                      <span className="font-medium text-zinc-200">
                        {formatPercent(tool.adoption_rate_pct / 100)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-700">
                      <div
                        className="h-1.5 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${Math.min(tool.adoption_rate_pct, 100)}%` }}
                      />
                    </div>

                    {/* DAU/MAU */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">DAU/MAU</span>
                      <span className={`font-medium ${dau.color}`}>
                        {tool.dau_mau_ratio}% ({dau.label})
                      </span>
                    </div>

                    {/* Active vs Licensed */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Active / Licensed</span>
                      <span className="font-medium text-zinc-200">
                        {formatNumber(tool.active_users)} / {formatNumber(tool.licensed_users)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">No tool data available</p>
        )}
      </div>

      {/* Adoption Trend Chart */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">DAU/MAU Trend by Tool</h2>
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 60]}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(value: number) => [`${value}%`, undefined]}
              />
              <Legend />
              <ReferenceLine
                y={DAU_MAU_BENCHMARKS.excellent}
                stroke="#22c55e"
                strokeDasharray="4 2"
                label={{ value: "Excellent", fill: "#22c55e", fontSize: 10, position: "right" }}
              />
              <ReferenceLine
                y={DAU_MAU_BENCHMARKS.average}
                stroke="#eab308"
                strokeDasharray="4 2"
                label={{ value: "Average", fill: "#eab308", fontSize: 10, position: "right" }}
              />
              <ReferenceLine
                y={DAU_MAU_BENCHMARKS.low}
                stroke="#f97316"
                strokeDasharray="4 2"
                label={{ value: "Low", fill: "#f97316", fontSize: 10, position: "right" }}
              />
              {trendToolNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  name={name}
                  stroke={TREND_COLORS[i % TREND_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">No trend data available</p>
        )}
      </div>

      {/* Account Health Score Table */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Account Health Scores</h2>
        {sortedHealth.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  {(
                    [
                      ["account_name", "Account"],
                      ["health_score", "Health Score"],
                      ["adoption_pct", "Adoption %"],
                      ["engagement_score", "Engagement"],
                      ["trend", "Trend"],
                    ] as [keyof HealthScoreRow, string][]
                  ).map(([field, label]) => (
                    <th
                      key={field}
                      onClick={() => handleSort(field)}
                      className="cursor-pointer py-2 text-left text-xs font-medium hover:text-zinc-200"
                    >
                      {label} {sortField === field ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedHealth.map((row) => (
                  <tr key={row.account_id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="py-2 text-zinc-200">{row.account_name}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-zinc-700">
                          <div
                            className={`h-2 rounded-full ${healthScoreBg(row.health_score)} transition-all`}
                            style={{ width: `${row.health_score}%` }}
                          />
                        </div>
                        <span className={`font-mono text-xs font-medium ${healthScoreColor(row.health_score)}`}>
                          {row.health_score}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-zinc-300">{formatPercent(row.adoption_pct / 100)}</td>
                    <td className="py-2 text-zinc-300">{row.engagement_score}</td>
                    <td className="py-2">
                      <span
                        className={`text-sm ${
                          row.trend === "improving"
                            ? "text-green-400"
                            : row.trend === "declining"
                              ? "text-red-400"
                              : "text-zinc-400"
                        }`}
                      >
                        {TREND_ARROWS[row.trend]} {row.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">No health score data available</p>
        )}
      </div>
    </div>
  );
}
