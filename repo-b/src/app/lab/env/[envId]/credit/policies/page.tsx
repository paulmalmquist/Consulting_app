"use client";

import { useEffect, useState } from "react";
import { bosFetch } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";

interface CreditPolicy {
  policy_id: string;
  name: string;
  policy_type: string;
  portfolio_id: string | null;
  portfolio_name: string | null;
  is_active: boolean;
  version: number;
  created_at: string;
}

export default function CreditPoliciesPage() {
  const { envId, businessId } = useDomainEnv();
  const [policies, setPolicies] = useState<CreditPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publishAssistantPageContext({
      route: `/lab/env/${envId}/credit/policies`,
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
        const rows = await bosFetch<CreditPolicy[]>("/api/credit/v2/policies", {
          params: { env_id: envId, business_id: businessId || undefined },
        });
        setPolicies(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load policies");
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
        <h2 className="text-2xl font-semibold">Credit Policies</h2>
        <p className="text-sm text-bm-muted2">Underwriting policies and rule sets governing credit decisions.</p>
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bm-surface/30 border-b border-bm-border/50 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Portfolio</th>
              <th className="px-4 py-3 font-medium">Active</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Created At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {loading ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>Loading policies...</td></tr>
            ) : policies.length === 0 ? (
              <tr><td className="px-4 py-6 text-bm-muted2" colSpan={6}>No policies configured.</td></tr>
            ) : (
              policies.map((pol) => (
                <tr key={pol.policy_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{pol.name}</td>
                  <td className="px-4 py-3 capitalize">{pol.policy_type?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">{pol.portfolio_name || "—"}</td>
                  <td className="px-4 py-3">
                    {pol.is_active ? (
                      <span className="inline-block rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">Active</span>
                    ) : (
                      <span className="text-bm-muted2 text-xs">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3">v{pol.version}</td>
                  <td className="px-4 py-3">{new Date(pol.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
