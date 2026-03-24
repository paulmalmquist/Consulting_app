"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { NpsGauge } from "@/components/pds-enterprise/NpsGauge";
import { RagBadge } from "@/components/pds-enterprise/RagBadge";
import { NPS_THRESHOLDS } from "@/lib/pds-thresholds";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
  Label,
} from "recharts";

/* ---------- types ---------- */

type NpsSummary = {
  current_nps: number;
  trend: NpsTrendPoint[];
  response_count: number;
  response_rate_pct: number;
};

type NpsTrendPoint = {
  quarter: string;
  nps: number;
};

type Driver = {
  dimension: string;
  importance: number;
  performance: number;
};

type AtRiskAccount = {
  account_id: string;
  account_name: string;
  nps: number;
  trend: "improving" | "stable" | "declining";
  risk_reason: string;
  last_survey_date: string;
};

type Verbatim = {
  id: string;
  account_name: string;
  nps_score: number;
  category: "promoter" | "passive" | "detractor";
  text: string;
  date: string;
};

/* ---------- helpers ---------- */

function npsBadgeColor(category: string): string {
  if (category === "promoter") return "bg-green-500/20 text-green-300 border-green-500/30";
  if (category === "passive") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  return "bg-red-500/20 text-red-300 border-red-500/30";
}

function npsRag(score: number): "green" | "amber" | "red" | "unknown" {
  if (score >= NPS_THRESHOLDS.excellent) return "green";
  if (score >= NPS_THRESHOLDS.good) return "amber";
  if (score >= NPS_THRESHOLDS.neutral) return "amber";
  return "red";
}

/* ---------- component ---------- */

export default function PdsSatisfactionPage() {
  const { envId, businessId } = useDomainEnv();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [npsSummary, setNpsSummary] = useState<NpsSummary | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskAccount[]>([]);
  const [verbatims, setVerbatims] = useState<Verbatim[]>([]);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
      };

      const [npsRes, driversRes, riskRes, verbRes] = await Promise.all([
        bosFetch<NpsSummary>("/api/pds/v2/satisfaction/nps-summary", { params }),
        bosFetch<{ drivers: Driver[] }>("/api/pds/v2/satisfaction/drivers", { params }),
        bosFetch<{ accounts: AtRiskAccount[] }>("/api/pds/v2/satisfaction/at-risk", { params }),
        bosFetch<{ verbatims: Verbatim[] }>("/api/pds/v2/satisfaction/verbatims", { params }),
      ]);

      setNpsSummary(npsRes);
      setDrivers(driversRes.drivers ?? []);
      setAtRisk(riskRes.accounts ?? []);
      setVerbatims(verbRes.verbatims ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load satisfaction data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId]);

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
        <p className="font-medium">Error loading satisfaction data</p>
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
        <h1 className="text-2xl font-bold text-zinc-100">Client Satisfaction</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Track NPS trends, satisfaction drivers, at-risk accounts, and client verbatims.
        </p>
      </div>

      {/* NPS Gauge + Trend Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Gauge */}
        {npsSummary && (
          <div className="flex flex-col items-center rounded-lg border border-zinc-700 bg-zinc-800/40 p-6">
            <NpsGauge score={npsSummary.current_nps} />
            <div className="mt-3 flex gap-4 text-xs text-zinc-400">
              <span>Responses: {npsSummary.response_count}</span>
              <span>Rate: {npsSummary.response_rate_pct}%</span>
            </div>
          </div>
        )}

        {/* NPS Trend */}
        <div className="col-span-2 rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">NPS Trend by Quarter</h2>
          {npsSummary && npsSummary.trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={npsSummary.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="quarter" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  domain={[-100, 100]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                />
                <ReferenceLine y={0} stroke="#6b7280" />
                <ReferenceLine y={NPS_THRESHOLDS.good} stroke="#22c55e" strokeDasharray="4 2" />
                <Line
                  type="monotone"
                  dataKey="nps"
                  name="NPS"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#3b82f6" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-zinc-500">No trend data available</p>
          )}
        </div>
      </div>

      {/* Importance x Performance Quadrant */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Importance vs Performance</h2>
        {drivers.length > 0 ? (
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                type="number"
                dataKey="importance"
                name="Importance"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                domain={[0, 10]}
              >
                <Label value="Importance" position="bottom" fill="#9ca3af" fontSize={12} />
              </XAxis>
              <YAxis
                type="number"
                dataKey="performance"
                name="Performance"
                tick={{ fill: "#9ca3af", fontSize: 12 }}
                domain={[0, 10]}
              >
                <Label value="Performance" angle={-90} position="left" fill="#9ca3af" fontSize={12} />
              </YAxis>
              <ZAxis range={[80, 80]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(value: number, name: string) => [value.toFixed(1), name]}
              />
              {/* Quadrant backgrounds */}
              <ReferenceArea x1={5} x2={10} y1={0} y2={5} fill="#ef4444" fillOpacity={0.05} />
              <ReferenceArea x1={5} x2={10} y1={5} y2={10} fill="#22c55e" fillOpacity={0.05} />
              <ReferenceArea x1={0} x2={5} y1={5} y2={10} fill="#eab308" fillOpacity={0.05} />
              <ReferenceArea x1={0} x2={5} y1={0} y2={5} fill="#6b7280" fillOpacity={0.05} />
              <ReferenceLine x={5} stroke="#6b7280" strokeDasharray="3 3" />
              <ReferenceLine y={5} stroke="#6b7280" strokeDasharray="3 3" />
              <Scatter
                name="Drivers"
                data={drivers}
                fill="#3b82f6"
                shape="circle"
              />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">No driver data available</p>
        )}
        {/* Labels for quadrants */}
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
          <div className="text-right">Low importance / High performance</div>
          <div>High importance / High performance (Strengths)</div>
          <div className="text-right">Low importance / Low performance</div>
          <div>High importance / Low performance (Fix these)</div>
        </div>
      </div>

      {/* At-Risk Accounts */}
      {atRisk.length > 0 && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <h2 className="mb-3 text-sm font-medium text-red-300">
            At-Risk Accounts ({atRisk.length})
          </h2>
          <div className="space-y-2">
            {atRisk.map((acct) => (
              <div
                key={acct.account_id}
                className="flex items-center justify-between rounded border border-zinc-700 bg-zinc-900/60 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-zinc-200">{acct.account_name}</p>
                  <p className="text-xs text-zinc-500">{acct.risk_reason}</p>
                </div>
                <div className="flex items-center gap-3">
                  <RagBadge
                    status={npsRag(acct.nps)}
                    label={`NPS ${acct.nps > 0 ? "+" : ""}${acct.nps}`}
                    trend={acct.trend}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verbatim Feed */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
        <h2 className="mb-4 text-sm font-medium text-zinc-300">Recent Verbatims</h2>
        {verbatims.length > 0 ? (
          <div className="space-y-3">
            {verbatims.map((v) => (
              <div key={v.id} className="rounded border border-zinc-700 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">{v.account_name}</span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-xs font-medium ${npsBadgeColor(v.category)}`}
                    >
                      {v.nps_score > 0 ? "+" : ""}
                      {v.nps_score} {v.category}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">{v.date}</span>
                </div>
                <p className="text-sm text-zinc-300 italic">&ldquo;{v.text}&rdquo;</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-zinc-500">No verbatims available</p>
        )}
      </div>
    </div>
  );
}
