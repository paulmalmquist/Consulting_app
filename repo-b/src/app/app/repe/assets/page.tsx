"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  listReV2Assets,
  listReV1Funds,
  ReV2AssetListItem,
  RepeFund,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

const SECTORS = [
  "All",
  "Office",
  "Industrial",
  "Multifamily",
  "Senior Housing",
  "Medical Office",
  "Retail",
  "Hospitality",
  "Data Center",
  "Student Housing",
] as const;

const US_STATES = [
  "All",
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
] as const;

const STATUS_OPTIONS = ["All", "active", "disposed"] as const;

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!n) return "$0";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  if (n <= 1) return `${(n * 100).toFixed(1)}%`;
  return `${n.toFixed(1)}%`;
}

function AssetsIndexContent() {
  const { environmentId } = useRepeContext();
  const basePath = useRepeBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [assets, setAssets] = useState<ReV2AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [funds, setFunds] = useState<RepeFund[]>([]);

  // Filters from URL params
  const fundFilter = searchParams.get("fund") || "";
  const sectorFilter = searchParams.get("sector") || "All";
  const stateFilter = searchParams.get("state") || "All";
  const msaFilter = searchParams.get("msa") || "";
  const statusFilter = searchParams.get("status") || "All";
  const searchQuery = searchParams.get("q") || "";
  const investmentFilter = searchParams.get("investment") || "";

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "All" || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  // Load funds for filter dropdown
  useEffect(() => {
    if (!environmentId) return;
    listReV1Funds({ env_id: environmentId }).then(setFunds).catch(() => {});
  }, [environmentId]);

  // Derive available MSAs from loaded assets
  const availableMsas = useMemo(() => {
    const msas = new Set<string>();
    assets.forEach((a) => {
      if (a.msa) msas.add(a.msa);
    });
    return Array.from(msas).sort();
  }, [assets]);

  // Derive available investments from loaded assets
  const availableInvestments = useMemo(() => {
    const map = new Map<string, string>();
    assets.forEach((a) => {
      if (a.investment_id && a.investment_name) {
        map.set(a.investment_id, a.investment_name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assets]);

  const fetchAssets = useCallback(async () => {
    if (!environmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | undefined> = {
        env_id: environmentId,
      };
      if (fundFilter) params.fund_id = fundFilter;
      if (sectorFilter !== "All") params.sector = sectorFilter.toLowerCase();
      if (stateFilter !== "All") params.state = stateFilter;
      if (msaFilter) params.msa = msaFilter;
      if (statusFilter !== "All") params.status = statusFilter;
      if (searchQuery) params.q = searchQuery;
      if (investmentFilter) params.investment_id = investmentFilter;

      const result = await listReV2Assets(params as { env_id: string });
      setAssets(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [environmentId, fundFilter, sectorFilter, stateFilter, msaFilter, statusFilter, searchQuery, investmentFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Quick stats
  const totalAssets = assets.length;
  const activeAssets = assets.filter((a) => a.status === "active").length;
  const totalNoi = assets.reduce((sum, a) => sum + Number(a.latest_noi || 0), 0);
  const avgOccupancy = assets.length
    ? assets.reduce((sum, a) => sum + Number(a.latest_occupancy || 0), 0) / assets.length
    : 0;

  const clearFilters = () => {
    router.replace("?", { scroll: false });
  };

  const hasActiveFilters =
    fundFilter !== "" ||
    sectorFilter !== "All" ||
    stateFilter !== "All" ||
    msaFilter !== "" ||
    statusFilter !== "All" ||
    searchQuery !== "" ||
    investmentFilter !== "";

  if (!environmentId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
        Initializing RE workspace...
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="re-assets-index">
      {/* Header + Quick Stats */}
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/25 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
            <p className="mt-1 text-sm text-bm-muted2">
              All properties across funds and investments.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-bm-border/60 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total Assets</p>
            <p className="mt-1 text-lg font-bold">{totalAssets}</p>
          </div>
          <div className="rounded-lg border border-bm-border/60 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Active</p>
            <p className="mt-1 text-lg font-bold">{activeAssets}</p>
          </div>
          <div className="rounded-lg border border-bm-border/60 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Total NOI (Latest Qtr)</p>
            <p className="mt-1 text-lg font-bold">{fmtMoney(totalNoi)}</p>
          </div>
          <div className="rounded-lg border border-bm-border/60 p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Avg Occupancy</p>
            <p className="mt-1 text-lg font-bold">{fmtPct(avgOccupancy)}</p>
          </div>
        </div>
      </div>

      {/* Filter Row */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Fund
            <select
              className="mt-1 block w-48 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={fundFilter}
              onChange={(e) => setFilter("fund", e.target.value)}
              data-testid="filter-fund"
            >
              <option value="">All Funds</option>
              {funds.map((f) => (
                <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Investment
            <select
              className="mt-1 block w-48 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={investmentFilter}
              onChange={(e) => setFilter("investment", e.target.value)}
              data-testid="filter-investment"
            >
              <option value="">All Investments</option>
              {availableInvestments.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Sector
            <select
              className="mt-1 block w-36 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={sectorFilter}
              onChange={(e) => setFilter("sector", e.target.value)}
              data-testid="filter-sector"
            >
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            State
            <select
              className="mt-1 block w-24 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={stateFilter}
              onChange={(e) => setFilter("state", e.target.value)}
              data-testid="filter-state"
            >
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            MSA
            <select
              className="mt-1 block w-48 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={msaFilter}
              onChange={(e) => setFilter("msa", e.target.value)}
              data-testid="filter-msa"
            >
              <option value="">All</option>
              {availableMsas.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Status
            <select
              className="mt-1 block w-28 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={statusFilter}
              onChange={(e) => setFilter("status", e.target.value)}
              data-testid="filter-status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </label>

          <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
            Search
            <input
              className="mt-1 block w-48 rounded-lg border border-bm-border bg-bm-surface px-2 py-1.5 text-sm"
              value={searchQuery}
              onChange={(e) => setFilter("q", e.target.value)}
              placeholder="Name, city, address..."
              data-testid="filter-search"
            />
          </label>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
            >
              Clear Filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Error State */}
      {error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {/* Loading State */}
      {loading ? (
        <div className="rounded-xl border border-bm-border/70 p-6 text-sm text-bm-muted2">
          Loading assets...
        </div>
      ) : (
        /* Asset Table */
        <div className="rounded-xl border border-bm-border/70 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-4 py-3 font-medium">Asset</th>
                <th className="px-4 py-3 font-medium">Sector</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Units/SF</th>
                <th className="px-4 py-3 font-medium text-right">NOI</th>
                <th className="px-4 py-3 font-medium text-right">Occupancy</th>
                <th className="px-4 py-3 font-medium text-right">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Investment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-bm-muted2">
                    {hasActiveFilters
                      ? "No assets match the current filters."
                      : "No assets found."}
                  </td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr key={asset.asset_id} data-testid={`asset-row-${asset.asset_id}`} className="hover:bg-bm-surface/20">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`${basePath}/assets/${asset.asset_id}`}
                        className="text-bm-accent hover:underline"
                      >
                        {asset.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2">{asset.sector || "—"}</td>
                    <td className="px-4 py-3 text-bm-muted2">{asset.city || "—"}</td>
                    <td className="px-4 py-3 text-bm-muted2">{asset.state || "—"}</td>
                    <td className="px-4 py-3 text-bm-muted2">
                      {asset.units ? `${asset.units} units` : asset.square_feet ? `${(asset.square_feet / 1000).toFixed(0)}K SF` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{fmtMoney(asset.latest_noi)}</td>
                    <td className="px-4 py-3 text-right">{fmtPct(asset.latest_occupancy)}</td>
                    <td className="px-4 py-3 text-right">{fmtMoney(asset.latest_value)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        asset.status === "active"
                          ? "bg-green-500/20 text-green-300"
                          : "bg-gray-500/20 text-gray-300"
                      }`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-bm-muted2 text-xs">
                      {asset.investment_name || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function RepeAssetsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-bm-border/70 p-4 text-sm text-bm-muted2">
          Loading assets...
        </div>
      }
    >
      <AssetsIndexContent />
    </Suspense>
  );
}
