"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  getCreditLoan,
  listCreditDecisions,
  CreditLoan,
  CreditDecisionLog,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { fmtMoney } from '@/lib/format-utils';
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

function decisionColor(decision: string): string {
  if (decision === "auto_approve") return "text-green-400";
  if (decision === "auto_decline") return "text-red-400";
  if (decision === "exception_route") return "text-yellow-400";
  return "";
}

export default function CreditLoanDetailPage() {
  const { envId, businessId } = useDomainEnv();
  const params = useParams();
  const loanId = params.loanId as string;

  const [loan, setLoan] = useState<CreditLoan | null>(null);
  const [decisions, setDecisions] = useState<CreditDecisionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/loans/${loanId}`,
      surface: "credit",
      active_module: "credit",
      page_entity_type: "loan",
      page_entity_id: loanId,
    });
    return () => resetAssistantPageContext();
  }, [envId, loanId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [l, d] = await Promise.all([
          getCreditLoan(envId, loanId, businessId || undefined),
          listCreditDecisions(envId, businessId || undefined),
        ]);
        setLoan(l);
        setDecisions(d.filter((dec) => dec.loan_id === loanId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load loan");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId, loanId]);

  if (loading) {
    return <section className="space-y-5"><p className="text-bm-muted2">Loading loan...</p></section>;
  }

  if (error) {
    return <section className="space-y-5"><p className="text-red-400">{error}</p></section>;
  }

  return (
    <section className="space-y-5">
      <div>
        <Link href={`/lab/env/${envId}/credit`} className="text-xs text-bm-muted2 hover:underline">&larr; Back to Credit Hub</Link>
        <h2 className="text-2xl font-semibold mt-1">Loan {loan?.loan_ref || loanId}</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Loan Info Card */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Loan Information</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-bm-muted2 text-xs">Ref</p>
              <p className="font-medium">{loan?.loan_ref || "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Status</p>
              <p className="font-medium capitalize">{loan?.loan_status?.replace(/_/g, " ") || "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Current Balance</p>
              <p className="font-medium">{fmtMoney(loan?.current_balance)}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Original Balance</p>
              <p className="font-medium">{fmtMoney(loan?.original_balance)}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Rate</p>
              <p className="font-medium">{loan?.interest_rate ? `${(Number(loan.interest_rate) * 100).toFixed(2)}%` : "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Term</p>
              <p className="font-medium">{loan?.term_months ? `${loan.term_months} months` : "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Delinquency</p>
              <p className="font-medium capitalize">{loan?.delinquency_bucket?.replace(/_/g, " ") || "current"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Risk Grade</p>
              <p className="font-medium">{loan?.risk_grade || "—"}</p>
            </div>
          </div>
        </div>

        {/* Borrower Info Card */}
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium">Borrower Information</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-bm-muted2 text-xs">Borrower Ref</p>
              <p className="font-medium">{loan?.borrower_ref || "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">FICO at Origination</p>
              <p className="font-medium">{loan?.fico_at_origination || "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Origination Date</p>
              <p className="font-medium">{loan?.origination_date ? new Date(loan.origination_date).toLocaleDateString() : "—"}</p>
            </div>
            <div>
              <p className="text-bm-muted2 text-xs">Borrower ID</p>
              <p className="font-medium text-xs truncate">{loan?.borrower_id || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Decision History */}
      <div>
        <h3 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium mb-3">Decision History</h3>
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Decision</th>
                <th className="px-4 py-3 font-medium">Policy</th>
                <th className="px-4 py-3 font-medium">Chain Status</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">Decided At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {decisions.length === 0 ? (
                <tr><td className="px-4 py-6 text-bm-muted2" colSpan={5}>No decisions recorded for this loan.</td></tr>
              ) : (
                decisions.map((dec) => (
                  <tr key={dec.decision_log_id} className="hover:bg-bm-surface/20">
                    <td className={`px-4 py-3 font-medium capitalize ${decisionColor(dec.decision)}`}>{dec.decision.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3">{dec.policy_name || "—"}</td>
                    <td className="px-4 py-3 capitalize">{dec.chain_status?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3">{dec.latency_ms ? `${dec.latency_ms}ms` : "—"}</td>
                    <td className="px-4 py-3">{new Date(dec.decided_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
