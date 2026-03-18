"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatCurrency, formatPercentRaw } from "@/components/pds-enterprise/pdsEnterprise";
import { RagBadge } from "@/components/pds-enterprise/RagBadge";
import { AccountHealthDonut } from "@/components/pds-enterprise/AccountHealthDonut";
import { QuadrantScatter } from "@/components/pds-enterprise/QuadrantScatter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from "recharts";

/* ---------- types ---------- */

type ExecOverview = {
  total_revenue_ytd: number;
  yoy_growth: number;
  portfolio_margin: number;
  health_green: number;
  health_amber: number;
  health_red: number;
  top_5_by_revenue: { account_id: string; account_name: string; ytd_revenue: number; health: string }[];
  top_5_at_risk: { account_id: string; account_name: string; risk_reason: string; health: string }[];
};

type RegionalRow = {
  region: string;
  revenue: number;
  margin: number;
  account_count: number;
  health_green: number;
  health_amber: number;
  health_red: number;
  budget_vs_actual_pct: number;
};

type Account360 = {
  account_name: string;
  tier: string;
  governance_track: string;
  annual_contract_value: number;
  contract_end_date: string | null;
  ytd_revenue: number;
  avg_margin: number;
  active_projects: number;
  latest_nps: number | null;
  nps_trend: { quarter: string; nps_score: number }[];
  utilization_pct: number | null;
};

type AccountProject = {
  project_id: string;
  project_name: string;
  status: string;
  percent_complete: number;
  total_budget: number;
  actual_revenue: number;
  cpi: number | null;
  spi: number | null;
};

type QuadrantPoint = { x: number; y: number; z?: number; label: string };

/* ---------- component ---------- */

export default function PdsAccountsPage() {
  const { envId, businessId } = useDomainEnv();
  const searchParams = useSearchParams();
  const router = useRouter();

  const level = searchParams.get("level") || "0";
  const accountId = searchParams.get("account_id") || null;
  const quadrantType = searchParams.get("quadrant") || null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<ExecOverview | null>(null);
  const [regional, setRegional] = useState<RegionalRow[]>([]);
  const [account360, setAccount360] = useState<Account360 | null>(null);
  const [projects, setProjects] = useState<AccountProject[]>([]);
  const [quadrantData, setQuadrantData] = useState<QuadrantPoint[]>([]);

  const params = { env_id: envId, business_id: businessId ?? undefined };

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      if (quadrantType) {
        const res = await bosFetch<{ data: QuadrantPoint[] }>(`/api/pds/v2/accounts/quadrant/${quadrantType}`, { params });
        setQuadrantData(res.data || []);
      } else if (level === "0") {
        const res = await bosFetch<ExecOverview>("/api/pds/v2/accounts/executive-overview", { params });
        setOverview(res);
      } else if (level === "1") {
        const res = await bosFetch<{ regions: RegionalRow[] }>("/api/pds/v2/accounts/regional", { params });
        setRegional(res.regions || []);
      } else if (level === "2" && accountId) {
        const res = await bosFetch<Account360>(`/api/pds/v2/accounts/${accountId}/360`, { params });
        setAccount360(res);
      } else if (level === "3" && accountId) {
        const res = await bosFetch<{ projects: AccountProject[] }>(`/api/pds/v2/accounts/${accountId}/projects`, { params });
        setProjects(res.projects || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, level, accountId, quadrantType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const nav = (p: Record<string, string>) => {
    const sp = new URLSearchParams(p);
    router.push(`?${sp.toString()}`);
  };

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
        <button onClick={fetchData} className="mt-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500">Retry</button>
      </div>
    );
  }

  /* ── Quadrant View ── */
  if (quadrantType && quadrantData.length > 0) {
    const labels: Record<string, { x: string; y: string }> = {
      revenue_growth: { x: "Revenue ($)", y: "YoY Growth (%)" },
      satisfaction_revenue: { x: "Revenue ($)", y: "NPS Score" },
    };
    const ax = labels[quadrantType] || { x: "X", y: "Y" };
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Strategic Quadrant: {quadrantType.replace("_", " ")}</h2>
          <button onClick={() => nav({ level: "0" })} className="text-sm text-blue-400 hover:underline">Back to Overview</button>
        </div>
        <QuadrantScatter data={quadrantData} xLabel={ax.x} yLabel={ax.y} />
      </div>
    );
  }

  /* ── Level 0: C-Suite Overview ── */
  if (level === "0" && overview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Accounts</h1>
            <p className="text-sm text-zinc-400">Executive overview — drill into regions, accounts, and projects.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => nav({ quadrant: "revenue_growth" })} className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 text-zinc-300">Revenue/Growth</button>
            <button onClick={() => nav({ quadrant: "satisfaction_revenue" })} className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700 text-zinc-300">NPS/Revenue</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <div className="text-xs text-zinc-400">Revenue YTD</div>
            <div className="text-xl font-bold text-zinc-100">{formatCurrency(overview.total_revenue_ytd)}</div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <div className="text-xs text-zinc-400">YoY Growth</div>
            <div className={`text-xl font-bold ${overview.yoy_growth >= 0 ? "text-green-400" : "text-red-400"}`}>
              {overview.yoy_growth >= 0 ? "+" : ""}{overview.yoy_growth.toFixed(1)}%
            </div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <div className="text-xs text-zinc-400">Portfolio Margin</div>
            <div className="text-xl font-bold text-zinc-100">{formatPercentRaw(overview.portfolio_margin, 1)}</div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <div className="text-xs text-zinc-400">Health Distribution</div>
            <AccountHealthDonut green={overview.health_green} amber={overview.health_amber} red={overview.health_red} size={80} />
            <div className="mt-1 text-xs text-zinc-500">{overview.health_green + overview.health_amber + overview.health_red} accounts</div>
          </div>
        </div>

        <button onClick={() => nav({ level: "1" })} className="text-sm text-blue-400 hover:underline">View Regional Breakdown →</button>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">Top 5 by Revenue</h3>
            {overview.top_5_by_revenue.map((a) => (
              <div key={a.account_id} className="flex items-center justify-between border-b border-zinc-800 py-2 last:border-0">
                <button onClick={() => nav({ level: "2", account_id: a.account_id })} className="text-sm text-blue-400 hover:underline">{a.account_name}</button>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300">{formatCurrency(a.ytd_revenue)}</span>
                  <RagBadge status={a.health as "green" | "amber" | "red" | "unknown"} />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">Top 5 At Risk</h3>
            {overview.top_5_at_risk.map((a) => (
              <div key={a.account_id} className="flex items-center justify-between border-b border-zinc-800 py-2 last:border-0">
                <button onClick={() => nav({ level: "2", account_id: a.account_id })} className="text-sm text-blue-400 hover:underline">{a.account_name}</button>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400">{a.risk_reason}</span>
                  <RagBadge status={a.health as "green" | "amber" | "red" | "unknown"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── Level 1: Regional ── */
  if (level === "1" && regional.length > 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Regional Performance</h2>
          <button onClick={() => nav({ level: "0" })} className="text-sm text-blue-400 hover:underline">← Overview</button>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={regional} margin={{ top: 10, right: 10, bottom: 50, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="region" tick={{ fill: "#9ca3af", fontSize: 10 }} angle={-20} textAnchor="end" />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }} />
            <Bar dataKey="revenue" fill="#3b82f6" name="Revenue" />
          </BarChart>
        </ResponsiveContainer>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {regional.map((r) => (
            <div key={r.region} className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 cursor-pointer hover:border-zinc-500 transition" onClick={() => nav({ level: "1", region: r.region })}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-zinc-200">{r.region}</span>
                <AccountHealthDonut green={r.health_green} amber={r.health_amber} red={r.health_red} size={50} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-zinc-500">Revenue: </span><span className="text-zinc-300">{formatCurrency(r.revenue)}</span></div>
                <div><span className="text-zinc-500">Margin: </span><span className="text-zinc-300">{formatPercentRaw(r.margin, 1)}</span></div>
                <div><span className="text-zinc-500">Accounts: </span><span className="text-zinc-300">{r.account_count}</span></div>
                <div><span className="text-zinc-500">vs Budget: </span><span className={r.budget_vs_actual_pct >= 0 ? "text-green-400" : "text-red-400"}>{r.budget_vs_actual_pct.toFixed(1)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Level 2: Account 360 ── */
  if (level === "2" && account360) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">{account360.account_name}</h2>
            <div className="flex gap-2 text-xs text-zinc-400">
              <span>{account360.tier}</span><span>·</span><span>{account360.governance_track}</span>
            </div>
          </div>
          <button onClick={() => nav({ level: "1" })} className="text-sm text-blue-400 hover:underline">← Regions</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">P&L Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-500">YTD Revenue: </span><span className="text-zinc-200">{formatCurrency(account360.ytd_revenue)}</span></div>
              <div><span className="text-zinc-500">Avg Margin: </span><span className="text-zinc-200">{formatPercentRaw(account360.avg_margin, 1)}</span></div>
              <div><span className="text-zinc-500">Contract Value: </span><span className="text-zinc-200">{formatCurrency(account360.annual_contract_value)}</span></div>
              <div><span className="text-zinc-500">Renewal: </span><span className="text-zinc-200">{account360.contract_end_date || "N/A"}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Health Indicators</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-zinc-500">Active Projects: </span><span className="text-zinc-200">{account360.active_projects}</span></div>
              <div><span className="text-zinc-500">Utilization: </span><span className="text-zinc-200">{account360.utilization_pct != null ? `${account360.utilization_pct.toFixed(1)}%` : "N/A"}</span></div>
              <div><span className="text-zinc-500">Latest NPS: </span><span className="text-zinc-200">{account360.latest_nps != null ? account360.latest_nps : "N/A"}</span></div>
            </div>
          </div>
        </div>

        {account360.nps_trend.length > 0 && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">NPS Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={account360.nps_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="quarter" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "6px" }} />
                <Line type="monotone" dataKey="nps_score" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <button onClick={() => nav({ level: "3", account_id: accountId! })} className="text-sm text-blue-400 hover:underline">View Projects →</button>
      </div>
    );
  }

  /* ── Level 3: Projects ── */
  if (level === "3" && projects.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">Projects</h2>
          <button onClick={() => nav({ level: "2", account_id: accountId! })} className="text-sm text-blue-400 hover:underline">← Account 360</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-400">
                <th className="py-2 text-left font-medium">Project</th>
                <th className="py-2 text-left font-medium">Status</th>
                <th className="py-2 text-right font-medium">% Complete</th>
                <th className="py-2 text-right font-medium">Budget</th>
                <th className="py-2 text-right font-medium">Actual Rev</th>
                <th className="py-2 text-right font-medium">CPI</th>
                <th className="py-2 text-right font-medium">SPI</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const statusRag = p.status === "active" ? "green" : p.status === "on_hold" ? "amber" : p.status === "cancelled" ? "red" : "green";
                return (
                  <tr key={p.project_id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                    <td className="py-2 text-zinc-200">{p.project_name}</td>
                    <td className="py-2"><RagBadge status={statusRag} label={p.status} /></td>
                    <td className="py-2 text-right text-zinc-300">{p.percent_complete.toFixed(0)}%</td>
                    <td className="py-2 text-right text-zinc-300">{formatCurrency(p.total_budget)}</td>
                    <td className="py-2 text-right text-zinc-300">{formatCurrency(p.actual_revenue)}</td>
                    <td className={`py-2 text-right ${(p.cpi ?? 1) >= 0.95 ? "text-green-400" : (p.cpi ?? 1) >= 0.85 ? "text-yellow-400" : "text-red-400"}`}>
                      {p.cpi != null ? p.cpi.toFixed(2) : "—"}
                    </td>
                    <td className={`py-2 text-right ${(p.spi ?? 1) >= 0.95 ? "text-green-400" : (p.spi ?? 1) >= 0.85 ? "text-yellow-400" : "text-red-400"}`}>
                      {p.spi != null ? p.spi.toFixed(2) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return <div className="p-6 text-sm text-zinc-400">No data available for this view.</div>;
}
