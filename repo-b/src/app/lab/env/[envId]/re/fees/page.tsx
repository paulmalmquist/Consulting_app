"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

import { fmtMoney, fmtPct } from '@/lib/format-utils';
function feeBasisLabel(basis: string): string {
  switch (basis) {
    case "COMMITTED": return "Committed Capital";
    case "CALLED": return "Called Capital";
    case "NAV": return "Net Asset Value";
    default: return basis;
  }
}

interface FeePolicy {
  id: string;
  fund_id: string;
  fund_name: string;
  fee_basis: string;
  annual_rate: string;
  start_date: string | null;
  stepdown_date: string | null;
  stepdown_rate: string | null;
  created_at: string;
}

interface FeeAccrual {
  id: string;
  fund_id: string;
  fund_name: string;
  quarter: string;
  fee_basis: string;
  base_amount: string;
  annual_rate: string;
  accrued_amount: string;
  created_at: string;
}

interface FundOption {
  fund_id: string;
  fund_name: string;
}

export default function FeesPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [policies, setPolicies] = useState<FeePolicy[]>([]);
  const [accruals, setAccruals] = useState<FeeAccrual[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fundFilter = searchParams.get("fund_id") || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  const refreshData = useCallback(async () => {
    if (!environmentId) return;
    try {
      const url = new URL("/api/re/v2/fees", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (fundFilter) url.searchParams.set("fund_id", fundFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load fee data");
      const data = await res.json();
      setPolicies(data.policies || []);
      setAccruals(data.accruals || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fee data");
    }
  }, [businessId, environmentId, fundFilter]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  // Unique funds for filter dropdown
  const fundOptions = useMemo<FundOption[]>(() => {
    const map = new Map<string, string>();
    for (const p of policies) {
      map.set(p.fund_id, p.fund_name);
    }
    for (const a of accruals) {
      map.set(a.fund_id, a.fund_name);
    }
    return Array.from(map.entries())
      .map(([fund_id, fund_name]) => ({ fund_id, fund_name }))
      .sort((a, b) => a.fund_name.localeCompare(b.fund_name));
  }, [policies, accruals]);

  // Compute total accrued from latest quarter per fund
  const totalAccrued = useMemo(() => {
    // Group accruals by fund_id, take the latest quarter for each
    const latestByFund = new Map<string, FeeAccrual[]>();
    for (const a of accruals) {
      const existing = latestByFund.get(a.fund_id);
      if (!existing) {
        latestByFund.set(a.fund_id, [a]);
      } else {
        // Accruals are ordered DESC by quarter, so first entries are latest
        if (existing[0].quarter === a.quarter) {
          existing.push(a);
        }
      }
    }
    let total = 0;
    for (const entries of latestByFund.values()) {
      for (const entry of entries) {
        total += parseFloat(entry.accrued_amount) || 0;
      }
    }
    return total;
  }, [accruals]);

  const filteredPolicies = useMemo(() => {
    if (!fundFilter) return policies;
    return policies.filter((p) => p.fund_id === fundFilter);
  }, [policies, fundFilter]);

  const filteredAccruals = useMemo(() => {
    if (!fundFilter) return accruals;
    return accruals.filter((a) => a.fund_id === fundFilter);
  }, [accruals, fundFilter]);

  const kpis = useMemo<KpiDef[]>(
    () => [
      { label: "Total Policies", value: String(filteredPolicies.length) },
      { label: "Total Accrued", value: fmtMoney(totalAccrued) },
    ],
    [filteredPolicies.length, totalAccrued]
  );

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId ? `/lab/env/${environmentId}/re/fees` : basePath + "/fees",
      surface: "fee_management",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        policies: filteredPolicies.map((p) => ({
          entity_type: "fee_policy",
          entity_id: p.id,
          name: `${p.fund_name} - ${feeBasisLabel(p.fee_basis)}`,
          metadata: {
            annual_rate: p.annual_rate,
            fee_basis: p.fee_basis,
          },
        })),
        metrics: {
          policy_count: filteredPolicies.length,
          total_accrued: totalAccrued,
        },
        notes: ["Fee management page"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filteredPolicies, totalAccrued]);

  if (!businessId) {
    if (loading) return <StateCard state="loading" />;
    return (
      <StateCard
        state="error"
        title="REPE workspace not initialized"
        message={contextError || "Unable to resolve workspace context."}
        onRetry={() => void initializeWorkspace()}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="re-fees-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Fee Management</h2>
          <p className="mt-1 text-sm text-bm-muted2">Management fee policies and quarterly accruals.</p>
        </div>
      </div>

      <KpiStrip kpis={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Fund
          <select
            className="mt-1 block h-8 w-48 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={fundFilter}
            onChange={(e) => setFilter("fund_id", e.target.value)}
            data-testid="filter-fund"
          >
            <option value="">All Funds</option>
            {fundOptions.map((f) => (
              <option key={f.fund_id} value={f.fund_id}>{f.fund_name}</option>
            ))}
          </select>
        </label>

        {fundFilter && (
          <button
            type="button"
            onClick={() => router.replace("?", { scroll: false })}
            className="rounded-md border border-bm-border/30 px-3 py-1.5 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            Clear Filter
          </button>
        )}
      </div>

      {error && <StateCard state="error" title="Failed to load fee data" message={error} />}

      {/* Fee Policies Table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Fee Policies</h3>
        {filteredPolicies.length === 0 && !error ? (
          <StateCard
            state="empty"
            title="No fee policies"
            description="Fee policies define management fee structures for each fund."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Fund</th>
                  <th className="px-4 py-2.5 font-medium">Fee Basis</th>
                  <th className="px-4 py-2.5 font-medium text-right">Annual Rate</th>
                  <th className="px-4 py-2.5 font-medium">Start Date</th>
                  <th className="px-4 py-2.5 font-medium">Stepdown Date</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stepdown Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {filteredPolicies.map((p) => (
                  <tr key={p.id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium text-bm-text">{p.fund_name}</td>
                    <td className="px-4 py-3 text-bm-muted2">{feeBasisLabel(p.fee_basis)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(p.annual_rate)}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{p.start_date || "\u2014"}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{p.stepdown_date || "\u2014"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.stepdown_rate != null ? fmtPct(p.stepdown_rate) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Accruals Table */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-bm-text">Recent Accruals</h3>
        {filteredAccruals.length === 0 && !error ? (
          <p className="text-sm text-bm-muted2">No fee accruals recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-bm-border/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                  <th className="px-4 py-2.5 font-medium">Fund</th>
                  <th className="px-4 py-2.5 font-medium">Quarter</th>
                  <th className="px-4 py-2.5 font-medium">Fee Basis</th>
                  <th className="px-4 py-2.5 font-medium text-right">Base Amount</th>
                  <th className="px-4 py-2.5 font-medium text-right">Annual Rate</th>
                  <th className="px-4 py-2.5 font-medium text-right">Accrued Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/10">
                {filteredAccruals.map((a) => (
                  <tr key={a.id} className="transition-colors duration-75 hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium text-bm-text">{a.fund_name}</td>
                    <td className="px-4 py-3 tabular-nums text-bm-muted2">{a.quarter}</td>
                    <td className="px-4 py-3 text-bm-muted2">{feeBasisLabel(a.fee_basis)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(a.base_amount)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(a.annual_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(a.accrued_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
