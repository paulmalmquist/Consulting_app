"use client";

import { useEffect, useState } from "react";
import {
  listCreditExceptions,
  resolveCreditException,
  CreditException,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

function priorityColor(priority: string): string {
  if (priority === "critical") return "text-red-400 bg-red-500/20 border-red-500/30";
  if (priority === "high") return "text-orange-400 bg-orange-500/20 border-orange-500/30";
  if (priority === "medium") return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
  return "text-gray-400 bg-gray-500/20 border-gray-500/30";
}

export default function CreditExceptionsPage() {
  const { envId, businessId } = useDomainEnv();
  const [exceptions, setExceptions] = useState<CreditException[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/exceptions`,
      surface: "credit",
      active_module: "credit",
    });
    return () => resetAssistantPageContext();
  }, [envId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCreditExceptions(envId, businessId || undefined);
      setExceptions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load exceptions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envId, businessId]);

  async function handleResolve(exceptionId: string) {
    const note = prompt("Resolution note (optional):");
    setResolving(exceptionId);
    try {
      await resolveCreditException(envId, exceptionId, { resolution: "resolved", resolution_note: note || undefined }, businessId || undefined);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve exception");
    } finally {
      setResolving(null);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Exception Queue</h2>
        <p className="text-sm text-bm-muted2">Loans routed for manual review due to policy exceptions.</p>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Loan Ref</th>
              <th className="px-4 py-3 font-medium">Borrower</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">SLA Deadline</th>
              <th className="px-4 py-3 font-medium">Opened At</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={8}>Loading exceptions...</td></tr>
            ) : exceptions.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={8}>No exceptions in queue.</td></tr>
            ) : (
              exceptions.map((exc) => (
                <tr key={exc.exception_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{exc.loan_ref || "—"}</td>
                  <td className="px-4 py-3">{exc.borrower_ref || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${priorityColor(exc.priority)}`}>
                      {exc.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate">{exc.reason}</td>
                  <td className="px-4 py-3 capitalize">{exc.status?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">{exc.sla_deadline ? new Date(exc.sla_deadline).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">{new Date(exc.opened_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {exc.status === "open" && (
                      <button
                        onClick={() => handleResolve(exc.exception_id)}
                        disabled={resolving === exc.exception_id}
                        className="rounded-lg border border-bm-border px-3 py-1 text-xs hover:bg-bm-surface/40 disabled:opacity-50"
                      >
                        {resolving === exc.exception_id ? "..." : "Resolve"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
