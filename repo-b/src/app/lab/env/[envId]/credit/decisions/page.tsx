"use client";

import { useEffect, useState } from "react";
import { listCreditDecisions, CreditDecisionLog } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
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

function decisionBadge(decision: string): string {
  if (decision === "auto_approve") return "bg-green-500/20 text-green-400 border-green-500/30";
  if (decision === "auto_decline") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (decision === "exception_route") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return "bg-bm-surface/20 text-bm-muted2 border-bm-border/30";
}

export default function CreditDecisionsPage() {
  const { envId, businessId } = useDomainEnv();
  const [decisions, setDecisions] = useState<CreditDecisionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/decisions`,
      surface: "credit",
      active_module: "credit",
    });
    return () => resetAssistantPageContext();
  }, [envId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listCreditDecisions(envId, businessId || undefined);
        setDecisions(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load decisions");
      } finally {
        setLoading(false);
      }
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Decision Log</h2>
        <p className="text-sm text-bm-muted2">All credit decisions across the environment.</p>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Decision</th>
              <th className="px-4 py-3 font-medium">Loan Ref</th>
              <th className="px-4 py-3 font-medium">Borrower</th>
              <th className="px-4 py-3 font-medium">Policy</th>
              <th className="px-4 py-3 font-medium">Chain Status</th>
              <th className="px-4 py-3 font-medium">Decided At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>Loading decisions...</td></tr>
            ) : decisions.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>No decisions recorded.</td></tr>
            ) : (
              decisions.map((dec) => (
                <tr key={dec.decision_log_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${decisionBadge(dec.decision)}`}>
                      {dec.decision.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{dec.loan_ref || "—"}</td>
                  <td className="px-4 py-3">{dec.borrower_ref || "—"}</td>
                  <td className="px-4 py-3">{dec.policy_name || "—"}</td>
                  <td className="px-4 py-3 capitalize">{dec.chain_status?.replace(/_/g, " ") || "—"}</td>
                  <td className="px-4 py-3">{new Date(dec.decided_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
