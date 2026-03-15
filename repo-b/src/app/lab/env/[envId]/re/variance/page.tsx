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

function fmtVariance(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmtMoney(n)}`;
}

function fmtPct(v: string | number | null | undefined): string {
  if (v == null) return "\u2014";
  const n = Number(v);
  if (Number.isNaN(n)) return "\u2014";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function varianceColor(variance: number, lineCode: string): string {
  if (variance === 0) return "text-bm-muted2";
  // For revenue lines, positive variance (actual > plan) is favorable (green)
  // For expense lines, negative variance (actual < plan) is favorable (green)
  const isExpense = lineCode.toLowerCase().includes("expense") ||
    lineCode.toLowerCase().includes("opex") ||
    lineCode.toLowerCase().includes("cost") ||
    lineCode.toLowerCase().includes("tax") ||
    lineCode.toLowerCase().includes("insurance") ||
    lineCode.toLowerCase().includes("maintenance") ||
    lineCode.toLowerCase().includes("utility");

  if (isExpense) {
    return variance < 0 ? "text-emerald-400" : "text-red-400";
  }
  return variance > 0 ? "text-emerald-400" : "text-red-400";
}

/* ── Types ──────────────────────────────────────────────────────────────── */

interface VarianceItem {
  id: string;
  run_id: string;
  fund_id: string;
  asset_id: string;
  asset_name: string;
  property_type: string | null;
  address_city: string | null;
  address_state: string | null;
  quarter: string;
  line_code: string;
  actual_amount: string;
  plan_amount: string;
  variance_amount: string;
  variance_pct: string | null;
}

interface VarianceSummary {
  total_actual: string;
  total_plan: string;
  total_variance: string;
  avg_variance_pct: string;
}

interface AssetGroup {
  asset_id: string;
  asset_name: string;
  address_city: string | null;
  address_state: string | null;
  property_type: string | null;
  actual_total: number;
  plan_total: number;
  variance_total: number;
  variance_pct: number;
  lines: VarianceItem[];
}

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export default function VariancePage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<VarianceItem[]>([]);
  const [summary, setSummary] = useState<VarianceSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());

  // Filter state from URL params
  const fundFilter = searchParams.get("fund_id") || "";
  const quarterFilter = searchParams.get("quarter") || "";
  const assetFilter = searchParams.get("asset_id") || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "" || value === "All") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  /* ── Load data ─────────────────────────────────────────────────────── */

  const refreshVariance = useCallback(async () => {
    if (!environmentId) return;
    setLoadingData(true);
    try {
      const url = new URL("/api/re/v2/variance", window.location.origin);
      url.searchParams.set("env_id", environmentId);
      if (businessId) url.searchParams.set("business_id", businessId);
      if (fundFilter) url.searchParams.set("fund_id", fundFilter);
      if (quarterFilter) url.searchParams.set("quarter", quarterFilter);
      if (assetFilter) url.searchParams.set("asset_id", assetFilter);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to load variance data");
      const data = await res.json();
      setItems(data.variance_items || []);
      setSummary(data.summary || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load variance data");
    } finally {
      setLoadingData(false);
    }
  }, [businessId, environmentId, fundFilter, quarterFilter, assetFilter]);

  useEffect(() => {
    void refreshVariance();
  }, [refreshVariance]);

  /* ── Derived data ──────────────────────────────────────────────────── */

  const assetGroups = useMemo<AssetGroup[]>(() => {
    const map: Record<string, AssetGroup> = {};
    for (const item of items) {
      if (!map[item.asset_id]) {
        map[item.asset_id] = {
          asset_id: item.asset_id,
          asset_name: item.asset_name,
          address_city: item.address_city,
          address_state: item.address_state,
          property_type: item.property_type,
          actual_total: 0,
          plan_total: 0,
          variance_total: 0,
          variance_pct: 0,
          lines: [],
        };
      }
      const group = map[item.asset_id];
      group.actual_total += parseFloat(item.actual_amount || "0");
      group.plan_total += parseFloat(item.plan_amount || "0");
      group.variance_total += parseFloat(item.variance_amount || "0");
      group.lines.push(item);
    }
    // Compute group-level variance pct
    for (const g of Object.values(map)) {
      g.variance_pct = g.plan_total !== 0 ? (g.variance_total / g.plan_total) * 100 : 0;
    }
    return Object.values(map).sort((a, b) => a.asset_name.localeCompare(b.asset_name));
  }, [items]);

  // Extract unique quarters and funds for filter dropdowns
  const quarters = useMemo(() => {
    const set = new Set(items.map((i) => i.quarter));
    return Array.from(set).sort();
  }, [items]);

  const funds = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (item.fund_id) map[item.fund_id] = item.fund_id;
    }
    return Object.keys(map);
  }, [items]);

  const assets = useMemo(() => {
    return assetGroups.map((g) => ({ id: g.asset_id, name: g.asset_name }));
  }, [assetGroups]);

  const toggleAsset = (assetId: string) => {
    setExpandedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const kpis = useMemo<KpiDef[]>(() => {
    if (!summary) return [];
    return [
      { label: "Total Actual", value: fmtMoney(summary.total_actual) },
      { label: "Total Plan", value: fmtMoney(summary.total_plan) },
      { label: "Total Variance", value: fmtVariance(summary.total_variance) },
      { label: "Avg Variance %", value: fmtPct(summary.avg_variance_pct) },
    ];
  }, [summary]);

  const hasActiveFilters = fundFilter !== "" || quarterFilter !== "" || assetFilter !== "";

  /* ── publishAssistantPageContext ────────────────────────────────────── */

  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/variance`
        : basePath + "/variance",
      surface: "budget_variance",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        asset_count: assetGroups.length,
        line_count: items.length,
        summary: summary,
        filters: {
          fund_id: fundFilter || null,
          quarter: quarterFilter || null,
          asset_id: assetFilter || null,
        },
        notes: [`Budget vs Actual variance as of ${pickCurrentQuarter()}`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, assetGroups.length, items.length, summary, fundFilter, quarterFilter, assetFilter]);

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
    <section className="flex flex-col gap-4" data-testid="budget-variance">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-bm-text">Budget vs Actual Variance</h2>
          <p className="mt-1 text-sm text-bm-muted2">
            Compare actual NOI performance against underwriting plan by asset and line code.
          </p>
        </div>
      </div>

      {summary && <KpiStrip kpis={kpis} />}

      {/* ── Filters ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {funds.length > 0 && (
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
            <select
              className="mt-1 block h-8 w-40 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
              value={fundFilter}
              onChange={(e) => setFilter("fund_id", e.target.value)}
              data-testid="filter-fund"
            >
              <option value="">All Funds</option>
              {funds.map((fid) => (
                <option key={fid} value={fid}>
                  {fid.slice(0, 8)}...
                </option>
              ))}
            </select>
          </label>
        )}

        {quarters.length > 0 && (
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Quarter
            <select
              className="mt-1 block h-8 w-32 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
              value={quarterFilter}
              onChange={(e) => setFilter("quarter", e.target.value)}
              data-testid="filter-quarter"
            >
              <option value="">All Quarters</option>
              {quarters.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </label>
        )}

        {assets.length > 1 && (
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Asset
            <select
              className="mt-1 block h-8 w-48 cursor-pointer appearance-none rounded-md border border-bm-border/30 bg-bm-surface/40 px-2 text-xs"
              value={assetFilter}
              onChange={(e) => setFilter("asset_id", e.target.value)}
              data-testid="filter-asset"
            >
              <option value="">All Assets</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => router.replace("?", { scroll: false })}
            className="mt-4 rounded-md border border-bm-border/30 px-3 py-1.5 text-xs text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Loading / Error states ─────────────────────────────────── */}
      {loadingData && <StateCard state="loading" />}
      {error && <StateCard state="error" title="Failed to load variance data" message={error} />}

      {assetGroups.length === 0 && !loadingData && !error && (
        <StateCard
          state="empty"
          title="No variance data"
          message="Budget vs actual variance data is populated from underwriting versions and normalized accounting data."
        />
      )}

      {/* ── Asset summary table with drill-down ────────────────────── */}
      {assetGroups.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-bm-border/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/20 bg-bm-surface/30 text-left text-xs uppercase tracking-wider text-bm-muted2">
                <th className="px-4 py-2.5 font-medium w-8"></th>
                <th className="px-4 py-2.5 font-medium">Asset Name</th>
                <th className="px-4 py-2.5 font-medium">City</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 font-medium text-right">Actual NOI</th>
                <th className="px-4 py-2.5 font-medium text-right">Plan NOI</th>
                <th className="px-4 py-2.5 font-medium text-right">Variance $</th>
                <th className="px-4 py-2.5 font-medium text-right">Variance %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/10">
              {assetGroups.map((group) => {
                const isExpanded = expandedAssets.has(group.asset_id);
                return (
                  <React.Fragment key={group.asset_id}>
                    {/* ── Asset summary row ────────────────────── */}
                    <tr
                      className="cursor-pointer transition-colors duration-75 hover:bg-bm-surface/20"
                      onClick={() => toggleAsset(group.asset_id)}
                      data-testid={`asset-row-${group.asset_id}`}
                    >
                      <td className="px-4 py-3 text-bm-muted2 text-xs">
                        {isExpanded ? "\u25BC" : "\u25B6"}
                      </td>
                      <td className="px-4 py-3 font-medium text-bm-text">{group.asset_name}</td>
                      <td className="px-4 py-3 text-bm-muted2">{group.address_city || "\u2014"}</td>
                      <td className="px-4 py-3 text-bm-muted2">{group.address_state || "\u2014"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(group.actual_total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(group.plan_total)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${varianceColor(group.variance_total, "noi")}`}>
                        {fmtVariance(group.variance_total)}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-medium ${varianceColor(group.variance_pct, "noi")}`}>
                        {fmtPct(group.variance_pct)}
                      </td>
                    </tr>

                    {/* ── Line-code detail rows (expanded) ─────── */}
                    {isExpanded &&
                      group.lines.map((line) => {
                        const lineVariance = parseFloat(line.variance_amount || "0");
                        const linePct = parseFloat(line.variance_pct || "0");
                        return (
                          <tr
                            key={line.id}
                            className="bg-bm-surface/10"
                            data-testid={`line-row-${line.id}`}
                          >
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 pl-10 text-xs text-bm-muted">
                              {line.line_code}
                            </td>
                            <td className="px-4 py-2 text-xs text-bm-muted2">{line.quarter}</td>
                            <td className="px-4 py-2"></td>
                            <td className="px-4 py-2 text-right tabular-nums text-xs">
                              {fmtMoney(line.actual_amount)}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-xs">
                              {fmtMoney(line.plan_amount)}
                            </td>
                            <td className={`px-4 py-2 text-right tabular-nums text-xs font-medium ${varianceColor(lineVariance, line.line_code)}`}>
                              {fmtVariance(line.variance_amount)}
                            </td>
                            <td className={`px-4 py-2 text-right tabular-nums text-xs font-medium ${varianceColor(linePct, line.line_code)}`}>
                              {fmtPct(line.variance_pct)}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
