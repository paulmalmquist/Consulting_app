"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatCurrency } from "@/components/pds-enterprise/pdsEnterprise";
import { RagBadge } from "@/components/pds-enterprise/RagBadge";
import { AccountHealthDonut } from "@/components/pds-enterprise/AccountHealthDonut";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
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

type EvmData = {
  bac: number;
  ev: number;
  ac: number;
  pv: number;
  cpi: number;
  spi: number;
  eac: number;
  vac: number;
  tcpi: number;
  s_curve: { period: string; pv: number; ev: number; ac: number }[];
};

type Prediction = {
  probability_of_delay: number;
  likely_delay_days: number;
  top_risk_factors: string[];
  recommended_actions: string[];
};

/* ---------- component ---------- */

export default function PdsRiskPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioHealth | null>(null);

  // Detail drawer
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [evmData, setEvmData] = useState<EvmData | null>(null);
  const [healthDetail, setHealthDetail] = useState<ProjectHealth | null>(null);
  const [prediction, setPrediction] = useState<{ prediction: Prediction } | null>(null);
  const [predicting, setPredicting] = useState(false);

  const params = { env_id: envId, business_id: businessId ?? undefined };

  const fetchPortfolio = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await bosFetch<PortfolioHealth>("/api/pds/v2/analytics/portfolio-health", { params });
      setPortfolio(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  const openProject = useCallback(async (projectId: string) => {
    setSelectedProject(projectId);
    setPrediction(null);
    try {
      const [health, evm] = await Promise.all([
        bosFetch<ProjectHealth>(`/api/pds/v2/analytics/project-health/${projectId}`, { params }),
        bosFetch<EvmData>(`/api/pds/v2/analytics/evm/${projectId}`, { params }),
      ]);
      setHealthDetail(health);
      setEvmData(evm);
    } catch { /* ignore */ }
  }, [envId, businessId]);

  const predictDelay = useCallback(async () => {
    if (!selectedProject) return;
    setPredicting(true);
    try {
      const res = await bosFetch<{ prediction: Prediction }>("/api/pds/v2/analytics/predict-delay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: selectedProject, env_id: envId, business_id: businessId }),
      });
      setPrediction(res);
    } catch { /* ignore */ } finally {
      setPredicting(false);
    }
  }, [selectedProject, envId, businessId]);

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
        <p className="font-medium">Error</p>
        <p className="mt-1 text-sm text-red-300">{error}</p>
        <button onClick={fetchPortfolio} className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">Retry</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Delivery Risk & Analytics</h1>
        <p className="text-sm text-zinc-400">Portfolio health command center with EVM and AI-powered delay prediction.</p>
      </div>

      {/* KPI + Distribution */}
      {portfolio && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <div className="text-xs text-zinc-400">Active Projects</div>
            <div className="text-2xl font-bold text-zinc-100">{portfolio.total_active}</div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <div className="text-xs text-zinc-400">Avg Health Score</div>
            <div className={`text-2xl font-bold ${portfolio.avg_health_score >= 75 ? "text-green-400" : portfolio.avg_health_score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {portfolio.avg_health_score}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 col-span-2 flex items-center gap-4">
            <div className="text-xs text-zinc-400">Health Distribution</div>
            <AccountHealthDonut green={portfolio.distribution.green} amber={portfolio.distribution.amber} red={portfolio.distribution.red} size={80} />
          </div>
        </div>
      )}

      {/* Project Grid */}
      {portfolio && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Projects by Health Score (worst first)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {portfolio.worst_10.map((p) => (
              <div
                key={p.project_id}
                onClick={() => openProject(p.project_id)}
                className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 hover:border-zinc-500 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-200 truncate">{p.project_name}</span>
                  <RagBadge status={p.rag_status} label={`${p.composite_score}`} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs text-zinc-400">
                  <span>SPI: {p.dimensions.schedule.spi.toFixed(2)}</span>
                  <span>CPI: {p.dimensions.budget.cpi.toFixed(2)}</span>
                  <span>Quality: {p.dimensions.quality.score.toFixed(0)}</span>
                  <span>Risks: {p.dimensions.risk.open_risks}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedProject && healthDetail && (
        <div className="rounded-xl border border-blue-500/30 bg-zinc-900 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{healthDetail.project_name}</h2>
              <RagBadge status={healthDetail.rag_status} label={`Health: ${healthDetail.composite_score}`} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={predictDelay}
                disabled={predicting}
                className="rounded bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {predicting ? "Predicting..." : "Predict Delay Risk"}
              </button>
              <button onClick={() => setSelectedProject(null)} className="text-sm text-zinc-400 hover:text-zinc-200">Close</button>
            </div>
          </div>

          {/* Dimension Scores */}
          <div className="grid grid-cols-4 gap-3">
            {(["schedule", "budget", "quality", "risk"] as const).map((dim) => {
              const d = healthDetail.dimensions[dim];
              const score = d.score;
              return (
                <div key={dim} className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-3 text-center">
                  <div className="text-xs text-zinc-400 capitalize">{dim}</div>
                  <div className={`text-xl font-bold ${score >= 75 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                    {score.toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* EVM S-Curve */}
          {evmData && evmData.s_curve.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-zinc-300">EVM S-Curve</h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={evmData.s_curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }} />
                  <Legend />
                  <Line type="monotone" dataKey="pv" name="Planned Value" stroke="#3b82f6" strokeDasharray="5 5" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ev" name="Earned Value" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ac" name="Actual Cost" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-3 grid grid-cols-3 gap-3 text-xs lg:grid-cols-6">
                <div className="rounded bg-zinc-800 p-2 text-center">
                  <div className="text-zinc-400">CPI</div>
                  <div className={evmData.cpi >= 0.95 ? "text-green-400" : "text-red-400"}>{evmData.cpi.toFixed(3)}</div>
                </div>
                <div className="rounded bg-zinc-800 p-2 text-center">
                  <div className="text-zinc-400">SPI</div>
                  <div className={evmData.spi >= 0.95 ? "text-green-400" : "text-red-400"}>{evmData.spi.toFixed(3)}</div>
                </div>
                <div className="rounded bg-zinc-800 p-2 text-center">
                  <div className="text-zinc-400">BAC</div>
                  <div className="text-zinc-200">{formatCurrency(evmData.bac)}</div>
                </div>
                <div className="rounded bg-zinc-800 p-2 text-center">
                  <div className="text-zinc-400">EAC</div>
                  <div className="text-zinc-200">{formatCurrency(evmData.eac)}</div>
                </div>
                <div className="rounded bg-zinc-800 p-2 text-center">
                  <div className="text-zinc-400">VAC</div>
                  <div className={evmData.vac >= 0 ? "text-green-400" : "text-red-400"}>{formatCurrency(evmData.vac)}</div>
                </div>
                <div className="rounded bg-zinc-800 p-2 text-center">
                  <div className="text-zinc-400">TCPI</div>
                  <div className="text-zinc-200">{evmData.tcpi.toFixed(3)}</div>
                </div>
              </div>
            </div>
          )}

          {/* AI Prediction */}
          {prediction && (
            <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
              <h3 className="text-sm font-medium text-purple-300">AI Delay Prediction</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-zinc-400">Delay Probability</div>
                  <div className={`text-2xl font-bold ${prediction.prediction.probability_of_delay > 60 ? "text-red-400" : prediction.prediction.probability_of_delay > 30 ? "text-yellow-400" : "text-green-400"}`}>
                    {prediction.prediction.probability_of_delay}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400">Likely Delay</div>
                  <div className="text-2xl font-bold text-zinc-100">{prediction.prediction.likely_delay_days} days</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Top Risk Factors</div>
                <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
                  {prediction.prediction.top_risk_factors?.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">Recommended Actions</div>
                <ul className="list-disc list-inside text-sm text-zinc-300 space-y-1">
                  {prediction.prediction.recommended_actions?.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
