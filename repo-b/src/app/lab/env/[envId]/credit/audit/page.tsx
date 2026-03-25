"use client";

import { useEffect, useState } from "react";
import { bosFetch } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

interface CreditAuditEntry {
  audit_id: string;
  mode: string;
  operator: string | null;
  query: string;
  chain_status: string;
  format_lock: boolean;
  latency_ms: number | null;
  reasoning_steps_json: Record<string, unknown>[] | null;
  created_at: string;
}

export default function CreditAuditPage() {
  const { envId, businessId } = useDomainEnv();
  const [entries, setEntries] = useState<CreditAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/audit`,
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
        const rows = await bosFetch<CreditAuditEntry[]>("/api/credit/v2/audit", {
          params: { env_id: envId, business_id: businessId || undefined },
        });
        setEntries(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit trail");
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
        <h2 className="text-2xl font-semibold">Audit Trail</h2>
        <p className="text-sm text-bm-muted2">Walled-garden query log with chain-of-thought reasoning.</p>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium w-6"></th>
              <th className="px-4 py-3 font-medium">Mode</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium">Query</th>
              <th className="px-4 py-3 font-medium">Chain Status</th>
              <th className="px-4 py-3 font-medium">Format Lock</th>
              <th className="px-4 py-3 font-medium">Latency</th>
              <th className="px-4 py-3 font-medium">Created At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={8}>Loading audit trail...</td></tr>
            ) : entries.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={8}>No audit entries.</td></tr>
            ) : (
              entries.map((entry) => (
                <>
                  <tr
                    key={entry.audit_id}
                    className="hover:bg-bm-surface/20 cursor-pointer"
                    onClick={() => setExpandedId(expandedId === entry.audit_id ? null : entry.audit_id)}
                  >
                    <td className="px-4 py-3 text-bm-muted2">
                      {entry.reasoning_steps_json && entry.reasoning_steps_json.length > 0 ? (
                        <span className="text-xs">{expandedId === entry.audit_id ? "▼" : "▶"}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 capitalize">{entry.mode?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3">{entry.operator || "—"}</td>
                    <td className="px-4 py-3 max-w-[300px] truncate">{entry.query}</td>
                    <td className="px-4 py-3 capitalize">{entry.chain_status?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3">
                      {entry.format_lock ? (
                        <span className="inline-block rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">Locked</span>
                      ) : (
                        <span className="text-bm-muted2 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{entry.latency_ms ? `${entry.latency_ms}ms` : "—"}</td>
                    <td className="px-4 py-3">{new Date(entry.created_at).toLocaleString()}</td>
                  </tr>
                  {expandedId === entry.audit_id && entry.reasoning_steps_json && (
                    <tr key={`${entry.audit_id}-detail`}>
                      <td colSpan={8} className="px-6 py-4 bg-bm-surface/10">
                        <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2 font-medium mb-2">Reasoning Steps</p>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {entry.reasoning_steps_json.map((step, i) => (
                            <div key={i} className="rounded-lg border border-bm-border/40 bg-bm-surface/20 p-3">
                              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(step, null, 2)}</pre>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
