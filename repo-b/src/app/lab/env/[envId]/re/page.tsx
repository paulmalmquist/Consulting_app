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
import {
  RepeIndexScaffold,
  reIndexActionClass,
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

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
    <RepeIndexScaffold
      title="Fund Portfolio"
      subtitle={`As of ${quarter}`}
      action={
        <Link href={`${base}/funds/new`} className={reIndexActionClass}>
          Create Fund
        </Link>
      }
      metrics={
        <KpiStrip
          variant="band"
          kpis={[
            { label: "Funds", value: portfolioKpis ? portfolioKpis.fund_count : "—" },
            { label: "Total Commitments", value: fmtMoneyOrDash(portfolioKpis?.total_commitments) },
            { label: "Portfolio NAV", value: fmtMoneyOrDash(portfolioKpis?.portfolio_nav) },
            { label: "Active Assets", value: portfolioKpis ? portfolioKpis.active_assets : "—" },
          ]}
        />
      }
      className="w-full"
    >
      <section data-testid="re-fund-list">
        {loading ? (
          <div className="flex items-center justify-center rounded-xl border border-bm-border/70 py-14 text-sm text-bm-muted2">
            Loading funds...
          </div>
        ) : funds.length === 0 ? (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-8 text-center">
            <p className="text-sm text-bm-muted2">No funds yet.</p>
            <Link href={`${base}/funds/new`} className="mt-3 inline-flex text-sm text-bm-accent hover:text-bm-text">
              Create your first fund
            </Link>
          </div>
        ) : (
          <div className={reIndexTableShellClass}>
            <table className={`${reIndexTableClass} min-w-[1040px]`}>
              <thead>
                <tr className={reIndexTableHeadRowClass}>
                  <th className="px-4 py-3 font-medium">Fund Name</th>
                  <th className="px-4 py-3 font-medium">Strategy</th>
                  <th className="px-4 py-3 font-medium">Vintage</th>
                  <th className="px-4 py-3 text-right font-medium">AUM</th>
                  <th className="px-4 py-3 text-right font-medium">NAV</th>
                  <th className="px-4 py-3 text-right font-medium">DPI</th>
                  <th className="px-4 py-3 text-right font-medium">TVPI</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className={reIndexTableBodyClass}>
                {funds.map((fund) => (
                  <tr key={fund.fund_id} className={reIndexTableRowClass}>
                    <td className="px-4 py-4 align-middle">
                      <Link href={`${base}/funds/${fund.fund_id}`} className={reIndexPrimaryCellClass}>
                        {fund.name}
                      </Link>
                    </td>
                    <td className="px-4 py-4 align-middle text-[12px] uppercase tracking-[0.04em] text-bm-muted2">
                      {fund.strategy?.toUpperCase() ?? "—"}
                    </td>
                    <td className="px-4 py-4 align-middle text-[12px] tracking-[0.04em] text-bm-muted2">
                      {fund.vintage_year}
                    </td>
                    <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                      {fmtMoney(fund.state?.total_committed)}
                    </td>
                    <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                      {fmtMoney(fund.state?.portfolio_nav)}
                    </td>
                    <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                      {fmtMultiple(fund.state?.dpi)}
                    </td>
                    <td className={`px-4 py-4 align-middle ${reIndexNumericCellClass}`}>
                      {fmtMultiple(fund.state?.tvpi)}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
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
    </RepeIndexScaffold>
  );
}
