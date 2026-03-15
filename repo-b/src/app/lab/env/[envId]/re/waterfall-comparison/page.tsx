"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";
import { KpiStrip, type KpiDef } from "@/components/repe/asset-cockpit/KpiStrip";
import { StateCard } from "@/components/ui/StateCard";

/* ── Formatters ─────────────────────────────────────────────────────────── */

function fmtMoney(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtDelta(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtMoney(n)}`;
}

function deltaColor(v: string | number | null | undefined): string {
  if (v == null) return "";
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return "text-bm-muted2";
  return n > 0 ? "text-emerald-400" : "text-red-400";
}

/* ── Types ──────────────────────────────────────────────────────────────── */

interface WaterfallRun {
  run_id: string;
  fund_id: string;
  fund_name: string;
  quarter: string;
  scenario_name: string | null;
  scenario_type: string | null;
  run_type: string;
  total_distributable: string;
  status: string;
  created_at: string;
}

interface Allocation {
  result_id: string;
  run_id: string;
  partner_id: string;
  partner_name: string | null;
  tier_code: string;
  payout_type: string;
  amount: string;
  ending_capital_balance: string | null;
}

interface ComparisonData {
  run_a: WaterfallRun & { allocations: Allocation[] };
  run_b: WaterfallRun & { allocations: Allocation[] };
  deltas: {
    total_distributable: string;
    by_tier: Record<string, string>;
    by_partner: Record<string, string>;
  };
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function WaterfallComparisonPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [runs, setRuns] = useState<WaterfallRun[]>([]);
  const [runIdA, setRunIdA] = useState<string>(searchParams.get("run_a") || "");
  const [runIdB, setRunIdB] = useState<string>(searchParams.get("run_b") || "");
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fundFilter = searchParams.get("fund_id") || "";

  /* ── Load available runs ───────────────────────────────────────────── */

  const refreshRuns = useCallback(async () => {
    if (!environmentId) return;
    setLoadingRuns(true);
    try {
      const url = new URL("/api/re/v2/waterfall-runs", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (fundFilter) url.searchParams.set("fund_id", fundFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load waterfall runs");
      const data = await res.json();
      setRuns(data.runs || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoadingRuns(false);
    }
  }, [businessId, environmentId, fundFilter]);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  /* ── Load comparison ───────────────────────────────────────────────── */

  const loadComparison = useCallback(async () => {
    if (!environmentId || !runIdA || !runIdB) {
      setComparison(null);
      return;
    }
    if (runIdA === runIdB) {
      setError("Select two different runs to compare.");
      setComparison(null);
      return;
    }
    setLoadingComparison(true);
    setError(null);
    try {
      const url = new URL("/api/re/v2/waterfall-comparison", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      url.searchParams.set("run_id_a", runIdA);
      url.searchParams.set("run_id_b", runIdB);
      const res = await fetch(url.toString());
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).error || "Failed to load comparison");
      }
      const data: ComparisonData = await res.json();
      setComparison(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comparison");
      setComparison(null);
    } finally {
      setLoadingComparison(false);
    }
  }, [businessId, environmentId, runIdA, runIdB]);

  useEffect(() => {
    void loadComparison();
  }, [loadComparison]);

  /* ── Derived data ──────────────────────────────────────────────────── */

  const tierRows = useMemo(() => {
    if (!comparison) return [];
    const allTiers = new Set<string>();
    for (const a of comparison.run_a.allocations) allTiers.add(a.tier_code);
    for (const b of comparison.run_b.allocations) allTiers.add(b.tier_code);

    return Array.from(allTiers)
      .sort()
      .map((tier) => {
        const aTotal = comparison.run_a.allocations
          .filter((a) => a.tier_code === tier)
          .reduce((sum, a) => sum + parseFloat(a.amount || "0"), 0);
        const bTotal = comparison.run_b.allocations
          .filter((b) => b.tier_code === tier)
          .reduce((sum, b) => sum + parseFloat(b.amount || "0"), 0);
        return { tier, runA: aTotal, runB: bTotal, delta: bTotal - aTotal };
      });
  }, [comparison]);

  const partnerRows = useMemo(() => {
    if (!comparison) return [];
    const partnerMap: Record<string, { name: string; runA: number; runB: number }> = {};
    for (const a of comparison.run_a.allocations) {
      const key = a.partner_name || a.partner_id || "Unknown";
      if (!partnerMap[key]) partnerMap[key] = { name: key, runA: 0, runB: 0 };
      partnerMap[key].runA += parseFloat(a.amount || "0");
    }
    for (const b of comparison.run_b.allocations) {
      const key = b.partner_name || b.partner_id || "Unknown";
      if (!partnerMap[key]) partnerMap[key] = { name: key, runA: 0, runB: 0 };
      partnerMap[key].runB += parseFloat(b.amount || "0");
    }
    return Object.values(partnerMap)
      .map((p) => ({ ...p, delta: p.runB - p.runA }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [comparison]);

  const kpis = useMemo<KpiDef[]>(() => {
    if (!comparison) return [];
    const totalA = parseFloat(comparison.run_a.total_distributable || "0");
    const totalB = parseFloat(comparison.run_b.total_distributable || "0");
    const delta = totalB - totalA;
    const deltaPct = totalA !== 0 ? ((delta / totalA) * 100).toFixed(1) : "0.0";
    return [
      { label: "Run A Total", value: fmtMoney(totalA) },
      { label: "Run B Total", value: fmtMoney(totalB) },
      { label: "Delta", value: fmtDelta(delta) },
      { label: "Delta %", value: `${delta >= 0 ? "+" : ""}${deltaPct}%` },
    ];
  }, [comparison]);

  /* ── Fund list for filtering ───────────────────────────────────────── */

  const funds = useMemo(() => {
    const unique: Record<string, string> = {};
    for (const run of runs) {
      unique[run.fund_id] = run.fund_name;
    }
    return Object.entries(unique).map(([id, name]) => ({ id, name }));
  }, [runs]);

  /* ── Run label helper ──────────────────────────────────────────────── */

  function runLabel(run: WaterfallRun): string {
    const scenario = run.scenario_name || run.run_type;
    return `${run.fund_name} - ${run.quarter} - ${scenario} (${fmtMoney(run.total_distributable)})`;
  }

  /* ── publishAssistantPageContext ────────────────────────────────────── */

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/waterfall-comparison`
        : basePath + "/waterfall-comparison",
      surface: "waterfall_comparison",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [runIdA, runIdB].filter(Boolean).map((id) => ({
        entity_type: "waterfall_run",
        entity_id: id,
      })),
      visible_data: {
        comparison_loaded: comparison !== null,
        run_count: runs.length,
        tier_count: tierRows.length,
        partner_count: partnerRows.length,
        notes: ["Waterfall comparison view"],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, comparison, runs.length, tierRows.length, partnerRows.length, runIdA, runIdB]);

  /* ── Guards ────────────────────────────────────────────────────────── */

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

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <section className="flex flex-col gap-4" data-testid="waterfall-comparison">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Waterfall Comparison</h2>
          <p className="mt-1 text-sm text-bm-muted2">
            Compare two waterfall runs side-by-side with delta analysis.
          </p>
        </div>
      </div>

      {/* ── Selectors ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-4">
        {funds.length > 1 && (
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
            <select
              className="mt-1 block h-8 w-48 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
              value={fundFilter}
              onChange={(e) => {
                const params = new URLSearchParams(searchParams.toString());
                if (e.target.value) params.set("fund_id", e.target.value);
                else params.delete("fund_id");
                params.delete("run_a");
                params.delete("run_b");
                setRunIdA("");
                setRunIdB("");
                setComparison(null);
                router.replace(`?${params.toString()}`, { scroll: false });
              }}
              data-testid="filter-fund"
            >
              <option value="">All Funds</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Run A
          <select
            className="mt-1 block h-8 w-72 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={runIdA}
            onChange={(e) => setRunIdA(e.target.value)}
            data-testid="select-run-a"
          >
            <option value="">Select Run A...</option>
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {runLabel(r)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Run B
          <select
            className="mt-1 block h-8 w-72 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
            value={runIdB}
            onChange={(e) => setRunIdB(e.target.value)}
            data-testid="select-run-b"
          >
            <option value="">Select Run B...</option>
            {runs.map((r) => (
              <option key={r.run_id} value={r.run_id}>
                {runLabel(r)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Loading / Error states ─────────────────────────────────── */}
      {loadingRuns && <StateCard state="loading" />}
      {error && <StateCard state="error" title="Comparison Error" message={error} />}

      {!runIdA && !runIdB && !loadingRuns && runs.length > 0 && (
        <div className="rounded-lg border border-bm-border/20 p-6 text-center text-sm text-bm-muted2">
          Select two waterfall runs above to compare distributions.
        </div>
      )}

      {runs.length === 0 && !loadingRuns && !error && (
        <StateCard
          state="empty"
          title="No waterfall runs"
          description="Waterfall runs are created from the Waterfalls module. Run a waterfall first to compare."
        />
      )}

      {loadingComparison && <StateCard state="loading" />}

      {/* ── Comparison results ─────────────────────────────────────── */}
      {comparison && (
        <>
          <KpiStrip kpis={kpis} />

          {/* ── Tier comparison table ──────────────────────────────── */}
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
              Tier Comparison
            </h3>
            <div className="overflow-x-auto rounded-xl border border-bm-border/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                    <th className="px-4 py-2.5 font-medium">Tier Code</th>
                    <th className="px-4 py-2.5 font-medium text-right">Run A Amount</th>
                    <th className="px-4 py-2.5 font-medium text-right">Run B Amount</th>
                    <th className="px-4 py-2.5 font-medium text-right">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/10">
                  {tierRows.map((row) => (
                    <tr
                      key={row.tier}
                      className="transition-colors duration-75 hover:bg-bm-surface/20"
                      data-testid={`tier-row-${row.tier}`}
                    >
                      <td className="px-4 py-3 font-medium text-bm-text">{row.tier}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.runA)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.runB)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${deltaColor(row.delta)}`}>
                        {fmtDelta(row.delta)}
                      </td>
                    </tr>
                  ))}
                  {tierRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-bm-muted2">
                        No tier data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Partner comparison table ───────────────────────────── */}
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-bm-muted2">
              Partner Comparison
            </h3>
            <div className="overflow-x-auto rounded-xl border border-bm-border/30">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                    <th className="px-4 py-2.5 font-medium">Partner Name</th>
                    <th className="px-4 py-2.5 font-medium text-right">Run A Payout</th>
                    <th className="px-4 py-2.5 font-medium text-right">Run B Payout</th>
                    <th className="px-4 py-2.5 font-medium text-right">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/10">
                  {partnerRows.map((row) => (
                    <tr
                      key={row.name}
                      className="transition-colors duration-75 hover:bg-bm-surface/20"
                      data-testid={`partner-row-${row.name}`}
                    >
                      <td className="px-4 py-3 font-medium text-bm-text">{row.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.runA)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.runB)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${deltaColor(row.delta)}`}>
                        {fmtDelta(row.delta)}
                      </td>
                    </tr>
                  ))}
                  {partnerRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-bm-muted2">
                        No partner data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
