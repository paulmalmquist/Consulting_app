"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { bosFetch } from "@/lib/bos-api";
import { formatCurrency, formatPercent, formatDate } from "@/components/pds-enterprise/pdsEnterprise";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/* ---------- types ---------- */

type PipelineStage = {
  stage: string;
  count: number;
  weighted_value: number;
  unweighted_value: number;
};

type PortfolioAccount = {
  id: string;
  account_name: string;
  contract_value: number;
  annual_run_rate: number;
  renewal_date: string | null;
  scope_utilization_pct: number;
  status: "green" | "amber" | "red";
};

type ActiveTab = "pipeline" | "portfolio";

const STAGE_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#3b82f6", "#06b6d4", "#22c55e"];

/* ---------- component ---------- */

export default function PdsForecastPage() {
  const { envId, businessId } = useDomainEnv();

  const [tab, setTab] = useState<ActiveTab>("pipeline");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioAccount[]>([]);
  const [sortField, setSortField] = useState<keyof PortfolioAccount>("account_name");
  const [sortAsc, setSortAsc] = useState(true);

  const fetchData = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: envId,
        business_id: businessId ?? undefined,
      };

      if (tab === "pipeline") {
        const res = await bosFetch<{ stages: PipelineStage[] }>("/api/pds/v2/revenue/pipeline", { params });
        setPipeline(res.stages);
      } else {
        const res = await bosFetch<{ accounts: PortfolioAccount[] }>("/api/pds/v2/revenue/portfolio", { params });
        setPortfolio(res.accounts);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, tab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (field: keyof PortfolioAccount) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedPortfolio = [...portfolio].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortAsc ? cmp : -cmp;
  });

  const statusColor = (s: string) => {
    if (s === "green") return "bg-green-500";
    if (s === "amber") return "bg-yellow-500";
    return "bg-red-500";
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
        <p className="font-medium">Error loading data</p>
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
        <h1 className="text-2xl font-bold text-zinc-100">Pipeline & Portfolio</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Track variable revenue pipeline and dedicated account portfolio health.
        </p>
      </div>

      {/* Tab Selector */}
      <div className="inline-flex rounded-md border border-zinc-700 text-sm">
        <button
          onClick={() => setTab("pipeline")}
          className={`rounded-l-md px-4 py-2 transition-colors ${
            tab === "pipeline" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          Pipeline (Variable)
        </button>
        <button
          onClick={() => setTab("portfolio")}
          className={`rounded-r-md px-4 py-2 transition-colors ${
            tab === "portfolio" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800"
          }`}
        >
          Portfolio (Dedicated)
        </button>
      </div>

      {/* Pipeline Tab */}
      {tab === "pipeline" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Deal Funnel</h2>
          {pipeline.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={pipeline} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    type="number"
                    tick={{ fill: "#9ca3af", fontSize: 12 }}
                    tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis type="category" dataKey="stage" tick={{ fill: "#9ca3af", fontSize: 12 }} width={120} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                  <Legend />
                  <Bar dataKey="weighted_value" name="Weighted Value" stackId="a" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                    {pipeline.map((_, idx) => (
                      <React.Fragment key={idx} />
                    ))}
                  </Bar>
                  <Bar dataKey="unweighted_value" name="Unweighted Value" stackId="b" fill="#6366f1" radius={[0, 4, 4, 0]} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>

              {/* Summary strip */}
              <div className="mt-4 flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-zinc-400">Total Deals:</span>{" "}
                  <span className="font-medium text-zinc-200">{pipeline.reduce((s, r) => s + r.count, 0)}</span>
                </div>
                <div>
                  <span className="text-zinc-400">Weighted Pipeline:</span>{" "}
                  <span className="font-medium text-zinc-200">
                    {formatCurrency(pipeline.reduce((s, r) => s + r.weighted_value, 0))}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="py-12 text-center text-sm text-zinc-500">No pipeline data available</p>
          )}
        </div>
      )}

      {/* Portfolio Tab */}
      {tab === "portfolio" && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/40 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">Dedicated Accounts</h2>
          {sortedPortfolio.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-700 text-zinc-400">
                    {(
                      [
                        ["account_name", "Account"],
                        ["contract_value", "Contract Value"],
                        ["annual_run_rate", "Run Rate"],
                        ["renewal_date", "Renewal"],
                        ["scope_utilization_pct", "Scope Util."],
                        ["status", "Status"],
                      ] as [keyof PortfolioAccount, string][]
                    ).map(([field, label]) => (
                      <th
                        key={field}
                        onClick={() => handleSort(field)}
                        className="cursor-pointer py-2 text-left font-medium hover:text-zinc-200"
                      >
                        {label} {sortField === field ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPortfolio.map((acct) => (
                    <tr key={acct.id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="py-2 text-zinc-200">{acct.account_name}</td>
                      <td className="py-2 text-zinc-300">{formatCurrency(acct.contract_value)}</td>
                      <td className="py-2 text-zinc-300">{formatCurrency(acct.annual_run_rate)}</td>
                      <td className="py-2 text-zinc-300">{formatDate(acct.renewal_date)}</td>
                      <td className="py-2 text-zinc-300">{formatPercent(acct.scope_utilization_pct / 100)}</td>
                      <td className="py-2">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${statusColor(acct.status)}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-zinc-500">No portfolio data available</p>
          )}
        </div>
      )}
    </div>
  );
}
