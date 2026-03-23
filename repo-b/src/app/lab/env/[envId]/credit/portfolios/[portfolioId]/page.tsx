"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getCreditPortfolio,
  listCreditLoans,
  CreditPortfolio,
  CreditLoan,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

function fmtMoney(value?: string | number | null): string {
  if (value === null || value === undefined) return "$0";
  const n = Number(value);
  if (Number.isNaN(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(value?: string | number | null): string {
  if (value === null || value === undefined) return "0%";
  const n = Number(value);
  if (Number.isNaN(n)) return "0%";
  return `${(n * 100).toFixed(1)}%`;
}

export default function CreditPortfolioDetailPage() {
  const { envId, businessId } = useDomainEnv();
  const params = useParams();
  const portfolioId = params.portfolioId as string;

  const [portfolio, setPortfolio] = useState<CreditPortfolio | null>(null);
  const [loans, setLoans] = useState<CreditLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/portfolios/${portfolioId}`,
      surface: "credit",
      active_module: "credit",
      page_entity_type: "portfolio",
      page_entity_id: portfolioId,
    });
    return () => resetAssistantPageContext();
  }, [envId, portfolioId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [p, l] = await Promise.all([
          getCreditPortfolio(envId, portfolioId, businessId || undefined),
          listCreditLoans(envId, portfolioId, businessId || undefined),
        ]);
        setPortfolio(p);
        setLoans(l);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load portfolio");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, portfolioId]);

  if (loading) {
    return <section className="space-y-5"><p className="text-bm-muted2">Loading portfolio...</p></section>;
  }

  if (error) {
    return <section className="space-y-5"><p className="text-red-400">{error}</p></section>;
  }

  const avgFico = loans.length > 0
    ? Math.round(loans.reduce((sum, l) => sum + (l.fico_at_origination || 0), 0) / loans.filter((l) => l.fico_at_origination).length)
    : 0;

  const dq30Count = loans.filter((l) => l.delinquency_bucket && l.delinquency_bucket !== "current").length;
  const dq60Count = loans.filter((l) => ["60_89", "90_119", "120_plus"].includes(l.delinquency_bucket)).length;
  const dq30Pct = loans.length > 0 ? dq30Count / loans.length : 0;
  const dq60Pct = loans.length > 0 ? dq60Count / loans.length : 0;

  return (
    <section className="space-y-5">
      <div>
        <Link href={`/lab/env/${envId}/credit`} className="text-xs text-bm-muted2 hover:underline">&larr; Back to Credit Hub</Link>
        <h2 className="text-2xl font-semibold mt-1">{portfolio?.name || "Portfolio"}</h2>
        <p className="text-sm text-bm-muted2 capitalize">{portfolio?.product_type?.replace(/_/g, " ")} &middot; {portfolio?.status}</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Loan Count</p>
          <p className="mt-1 text-xl font-semibold">{portfolio?.loan_count ?? loans.length}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total UPB</p>
          <p className="mt-1 text-xl font-semibold">{fmtMoney(portfolio?.total_upb)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">30+ DQ %</p>
          <p className="mt-1 text-xl font-semibold">{fmtPct(dq30Pct)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">60+ DQ %</p>
          <p className="mt-1 text-xl font-semibold">{fmtPct(dq60Pct)}</p>
        </div>
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Avg FICO</p>
          <p className="mt-1 text-xl font-semibold">{avgFico || "—"}</p>
        </div>
      </div>

      {/* Loan Table */}
      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Ref</th>
              <th className="px-4 py-3 font-medium">Borrower</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">FICO</th>
              <th className="px-4 py-3 font-medium">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loans.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>No loans in this portfolio.</td></tr>
            ) : (
              loans.map((loan) => (
                <tr key={loan.loan_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/lab/env/${envId}/credit/loans/${loan.loan_id}`} className="hover:underline">
                      {loan.loan_ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{loan.borrower_ref || "—"}</td>
                  <td className="px-4 py-3">{fmtMoney(loan.current_balance)}</td>
                  <td className="px-4 py-3 capitalize">{loan.loan_status?.replace(/_/g, " ") || "—"}</td>
                  <td className="px-4 py-3">{loan.fico_at_origination || "—"}</td>
                  <td className="px-4 py-3">{loan.interest_rate ? `${(Number(loan.interest_rate) * 100).toFixed(2)}%` : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
