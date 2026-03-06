"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getReV2EnvironmentPortfolioKpis,
  getReV2FundQuarterState,
  RepeFund,
  ReV2EnvironmentPortfolioKpis,
  ReV2FundQuarterState,
  listReV1Funds,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

function fmtMoney(v: string | number | undefined | null): string {
  if (v == null) return "$0";
  const n = Number(v);
  if (isNaN(n) || n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtMoneyOrDash(v: string | number | undefined | null): string {
  if (v == null) return "—";
  return fmtMoney(v);
}

function fmtMultiple(v: string | number | undefined | null): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `${n.toFixed(2)}x`;
}

function fmtPercent(v: string | number | undefined | null): string {
  if (v == null) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

type FundRow = RepeFund & { state?: ReV2FundQuarterState | null };

export default function ReFundListPage() {
  const { envId, businessId } = useReEnv();
  const [funds, setFunds] = useState<FundRow[]>([]);
  const [portfolioKpis, setPortfolioKpis] = useState<ReV2EnvironmentPortfolioKpis | null>(null);
  const [loading, setLoading] = useState(true);

  const quarter = pickCurrentQuarter();

  useEffect(() => {
    if (!businessId && !envId) return;
    setLoading(true);
    listReV1Funds({ env_id: envId || undefined, business_id: businessId || undefined })
      .then(async (rows) => {
        const enriched: FundRow[] = await Promise.all(
          rows.map(async (f) => {
            try {
              const state = await getReV2FundQuarterState(f.fund_id, quarter);
              return { ...f, state };
            } catch {
              return { ...f, state: null };
            }
          })
        );
        setFunds(enriched);
      })
      .catch(() => setFunds([]))
      .finally(() => setLoading(false));
  }, [businessId, envId, quarter]);

  useEffect(() => {
    if (!envId) {
      setPortfolioKpis(null);
      return;
    }
    getReV2EnvironmentPortfolioKpis(envId, quarter)
      .then(setPortfolioKpis)
      .catch(() => setPortfolioKpis(null));
  }, [envId, quarter]);

  const base = `/lab/env/${envId}/re`;

  return (
    <section className="space-y-5" data-testid="re-fund-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fund Portfolio</h1>
          <p className="mt-1 text-sm text-bm-muted2">As of {quarter}</p>
        </div>
        <Link
          href={`${base}/funds/new`}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
        >
          Create Fund
        </Link>
      </div>

      {/* Summary KPIs */}
      <KpiStrip
        kpis={[
          { label: "Funds", value: portfolioKpis ? portfolioKpis.fund_count : "—" },
          { label: "Total Commitments", value: fmtMoneyOrDash(portfolioKpis?.total_commitments) },
          { label: "Portfolio NAV", value: fmtMoneyOrDash(portfolioKpis?.portfolio_nav) },
          { label: "Active Assets", value: portfolioKpis ? portfolioKpis.active_assets : "—" },
        ]}
      />

      {/* Fund Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-bm-muted2">
          Loading funds...
        </div>
      ) : funds.length === 0 ? (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
          <p className="text-bm-muted2">No funds yet.</p>
          <Link href={`${base}/funds/new`} className="mt-3 inline-block text-sm text-bm-accent hover:underline">
            Create your first fund
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Fund Name</th>
                <th className="px-4 py-3 font-medium">Strategy</th>
                <th className="px-4 py-3 font-medium">Vintage</th>
                <th className="px-4 py-3 font-medium text-right">AUM</th>
                <th className="px-4 py-3 font-medium text-right">NAV</th>
                <th className="px-4 py-3 font-medium text-right">DPI</th>
                <th className="px-4 py-3 font-medium text-right">TVPI</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {funds.map((fund) => (
                <tr key={fund.fund_id} className="hover:bg-bm-surface/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`${base}/funds/${fund.fund_id}`} className="font-medium text-bm-accent hover:underline">
                      {fund.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{fund.strategy?.toUpperCase() ?? "—"}</td>
                  <td className="px-4 py-3 text-bm-muted2">{fund.vintage_year}</td>
                  <td className="px-4 py-3 text-right">{fmtMoney(fund.state?.total_committed)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmtMoney(fund.state?.portfolio_nav)}</td>
                  <td className="px-4 py-3 text-right">{fmtMultiple(fund.state?.dpi)}</td>
                  <td className="px-4 py-3 text-right">{fmtMultiple(fund.state?.tvpi)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-bm-surface/40 px-2 py-0.5 text-xs capitalize">
                      {fund.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
