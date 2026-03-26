"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { RagBadge } from "@/components/pds-enterprise/RagBadge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/* ---------- types ---------- */

type ProjectHealth = {
  project_id: string;
  project_name: string;
  composite_score: number;
  rag_status: "green" | "amber" | "red";
  dimensions: {
    schedule: { score: number; spi: number };
    budget: { score: number; cpi: number };
    quality: { score: number };
    risk: { score: number; open_risks: number };
  };
};

type PortfolioHealth = {
  total_active: number;
  avg_health_score: number;
  distribution: { green: number; amber: number; red: number };
  worst_10: ProjectHealth[];
};

/* ---------- helpers ---------- */

function spiStatus(spi: number): "green" | "amber" | "red" {
  if (spi >= 0.95) return "green";
  if (spi >= 0.85) return "amber";
  return "red";
}

function spiLabel(spi: number): string {
  if (spi >= 0.95) return "On Track";
  if (spi >= 0.85) return "At Risk";
  return "Behind";
}

const RAG_FILL: Record<string, string> = {
  green: "#22c55e",
  amber: "#eab308",
  red: "#ef4444",
};

/* ---------- component ---------- */

export default function PdsScheduleHealthPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioHealth | null>(null);

  const params = { env_id: envId, business_id: businessId ?? undefined };

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await bosFetch<PortfolioHealth>(
        "/api/pds/v2/analytics/portfolio-health",
        { params },
      );
      setPortfolio(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------- derived schedule metrics ---------- */

  const projects = portfolio?.worst_10 ?? [];
  const scheduleProjects = projects
    .filter((p) => p.dimensions?.schedule)
    .sort((a, b) => (a.dimensions.schedule.spi ?? 1) - (b.dimensions.schedule.spi ?? 1));

  const avgSpi =
    scheduleProjects.length > 0
      ? scheduleProjects.reduce((s, p) => s + (p.dimensions.schedule.spi ?? 1), 0) /
        scheduleProjects.length
      : null;

  const behindCount = scheduleProjects.filter(
    (p) => (p.dimensions.schedule.spi ?? 1) < 0.85,
  ).length;

  const atRiskCount = scheduleProjects.filter(
    (p) => {
      const spi = p.dimensions.schedule.spi ?? 1;
      return spi >= 0.85 && spi < 0.95;
    },
  ).length;

  const onTrackCount = scheduleProjects.filter(
    (p) => (p.dimensions.schedule.spi ?? 1) >= 0.95,
  ).length;

  /* SPI bar chart data */
  const spiChartData = scheduleProjects.map((p) => ({
    name: p.project_name.length > 25 ? p.project_name.slice(0, 22) + "..." : p.project_name,
    spi: Number((p.dimensions.schedule.spi ?? 1).toFixed(2)),
    status: spiStatus(p.dimensions.schedule.spi ?? 1),
  }));

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
        <p className="font-medium">Error loading schedule data</p>
        <p className="mt-1 text-sm text-red-300">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Schedule Health</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Track schedule performance index (SPI) across the project portfolio. SPI &ge; 0.95 is on
          track, 0.85–0.95 is at risk, and &lt; 0.85 is behind schedule.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Total Projects</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {portfolio?.total_active ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Avg SPI</p>
          <p className="mt-1 text-2xl font-bold text-zinc-100">
            {avgSpi != null ? avgSpi.toFixed(2) : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Behind Schedule</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{behindCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <p className="text-xs font-medium uppercase text-zinc-500">On Track</p>
          <p className="mt-1 text-2xl font-bold text-green-400">{onTrackCount}</p>
        </div>
      </div>

      {/* Distribution summary */}
      {portfolio && (
        <div className="flex gap-3 text-sm">
          <span className="rounded-full bg-green-500/20 px-3 py-1 text-green-300">
            {portfolio.distribution.green} Green
          </span>
          <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-yellow-300">
            {portfolio.distribution.amber} Amber
          </span>
          <span className="rounded-full bg-red-500/20 px-3 py-1 text-red-300">
            {portfolio.distribution.red} Red
          </span>
        </div>
      )}

      {/* SPI Bar Chart */}
      {spiChartData.length > 0 ? (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">
            Schedule Performance Index by Project
          </h2>
          <ResponsiveContainer width="100%" height={Math.max(240, spiChartData.length * 40)}>
            <BarChart data={spiChartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                type="number"
                domain={[0, 1.2]}
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                tickFormatter={(v: number) => v.toFixed(1)}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                width={160}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: 8,
                }}
                formatter={(value: number) => [value.toFixed(2), "SPI"]}
              />
              <Bar dataKey="spi" radius={[0, 4, 4, 0]}>
                {spiChartData.map((entry, idx) => (
                  <Cell key={idx} fill={RAG_FILL[entry.status] ?? "#6366f1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-12 text-center text-sm text-zinc-500">
          No schedule data available for the current portfolio.
        </div>
      )}

      {/* Project Table */}
      {scheduleProjects.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Projects by Schedule Risk</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-700 text-zinc-400">
                  <th className="py-2 text-left font-medium">Project</th>
                  <th className="py-2 text-left font-medium">SPI</th>
                  <th className="py-2 text-left font-medium">Schedule Score</th>
                  <th className="py-2 text-left font-medium">Status</th>
                  <th className="py-2 text-left font-medium">Overall</th>
                </tr>
              </thead>
              <tbody>
                {scheduleProjects.map((p) => {
                  const spi = p.dimensions.schedule.spi ?? 1;
                  return (
                    <tr
                      key={p.project_id}
                      className="border-b border-zinc-800 hover:bg-zinc-800/50"
                    >
                      <td className="py-2 text-zinc-200">{p.project_name}</td>
                      <td className="py-2 font-mono text-zinc-300">{spi.toFixed(2)}</td>
                      <td className="py-2 text-zinc-300">
                        {p.dimensions.schedule.score?.toFixed(0) ?? "—"}
                      </td>
                      <td className="py-2">
                        <RagBadge status={spiStatus(spi)} label={spiLabel(spi)} />
                      </td>
                      <td className="py-2">
                        <RagBadge status={p.rag_status} label={p.composite_score.toFixed(0)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
