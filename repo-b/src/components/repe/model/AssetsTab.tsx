"use client";

import { useState, useMemo } from "react";
import { Plus, X, Wrench, Search } from "lucide-react";
import type { Asset, ReModelScope } from "./types";
import { apiFetch } from "./types";

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function AssetsTab({
  modelId,
  scope,
  assets,
  onScopeChange,
  onOpenSurgery,
}: {
  modelId: string;
  scope: ReModelScope[];
  assets: Asset[];
  onScopeChange: (scope: ReModelScope[]) => void;
  onOpenSurgery: (assetId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [filterState, setFilterState] = useState("");

  const scopedAssetIds = useMemo(
    () => new Set(scope.filter((s) => s.scope_type === "asset").map((s) => s.scope_node_id)),
    [scope],
  );

  const selectedAssets = useMemo(
    () => assets.filter((a) => scopedAssetIds.has(a.asset_id)),
    [assets, scopedAssetIds],
  );

  const availableAssets = useMemo(() => {
    let pool = assets.filter((a) => !scopedAssetIds.has(a.asset_id));
    if (search) {
      const q = search.toLowerCase();
      pool = pool.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.sector?.toLowerCase().includes(q) ||
          a.city?.toLowerCase().includes(q),
      );
    }
    if (filterSector) pool = pool.filter((a) => a.sector === filterSector);
    if (filterState) pool = pool.filter((a) => a.state === filterState);
    return pool;
  }, [assets, scopedAssetIds, search, filterSector, filterState]);

  const sectors = useMemo(
    () => [...new Set(assets.map((a) => a.sector).filter(Boolean))].sort(),
    [assets],
  );
  const states = useMemo(
    () => [...new Set(assets.map((a) => a.state).filter(Boolean))].sort(),
    [assets],
  );

  const handleAdd = async (assetId: string) => {
    try {
      const result = await apiFetch<ReModelScope>(`/api/re/v2/models/${modelId}/scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope_type: "asset", scope_node_id: assetId }),
      });
      onScopeChange([...scope, result]);
    } catch (err) {
      console.error("Failed to add asset:", err);
    }
  };

  const handleRemove = async (assetId: string) => {
    try {
      await fetch(`/api/re/v2/models/${modelId}/scope/${assetId}`, { method: "DELETE" });
      onScopeChange(scope.filter((s) => s.scope_node_id !== assetId));
    } catch (err) {
      console.error("Failed to remove asset:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selected Assets */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">
            Selected Assets ({selectedAssets.length})
          </h2>
        </div>

        {selectedAssets.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-bm-border/40 p-8 text-center">
            <p className="text-sm text-bm-muted2">No assets in model scope</p>
            <p className="text-xs text-bm-muted2 mt-1">
              Use the Available Assets table below to add assets to this model.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-2 font-medium">Asset</th>
                  <th className="px-4 py-2 font-medium">Sector</th>
                  <th className="px-4 py-2 font-medium">Fund</th>
                  <th className="px-4 py-2 text-right font-medium">NOI</th>
                  <th className="px-4 py-2 text-right font-medium">Occupancy</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 font-medium w-40">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {selectedAssets.map((asset) => (
                  <tr key={asset.asset_id} className="hover:bg-bm-surface/20 transition-colors">
                    <td className="px-4 py-2">
                      <p className="font-medium text-bm-text">{asset.name}</p>
                      {asset.city && asset.state && (
                        <p className="text-xs text-bm-muted2">{asset.city}, {asset.state}</p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {asset.sector && (
                        <span className="rounded-full bg-bm-accent/10 px-2 py-0.5 text-xs text-bm-accent">
                          {asset.sector}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{asset.fund_name || "—"}</td>
                    <td className="px-4 py-2 text-right">{fmtMoney(asset.latest_noi)}</td>
                    <td className="px-4 py-2 text-right">{fmtPct(asset.latest_occupancy)}</td>
                    <td className="px-4 py-2 text-right">{fmtMoney(asset.latest_value)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => onOpenSurgery(asset.asset_id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-bm-accent/10 px-2.5 py-1.5 text-xs text-bm-accent hover:bg-bm-accent/20 transition"
                          title="Open asset surgery"
                        >
                          <Wrench size={12} /> Surgery
                        </button>
                        <button
                          onClick={() => handleRemove(asset.asset_id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition"
                          title="Remove from model"
                        >
                          <X size={12} /> Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Available Assets */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
          Available Assets ({availableAssets.length})
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-bm-muted2" />
            <input
              className="w-full rounded-lg border border-bm-border bg-bm-surface pl-9 pr-3 py-2 text-sm"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={filterSector}
            onChange={(e) => setFilterSector(e.target.value)}
          >
            <option value="">All Sectors</option>
            {sectors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {availableAssets.length === 0 ? (
          <p className="text-sm text-bm-muted2 py-4 text-center">
            {assets.length === 0 ? "No assets available in this environment." : "No matching assets."}
          </p>
        ) : (
          <div className="rounded-xl border border-bm-border/70 overflow-hidden max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-4 py-2 font-medium">Asset</th>
                  <th className="px-4 py-2 font-medium">Sector</th>
                  <th className="px-4 py-2 font-medium">Location</th>
                  <th className="px-4 py-2 text-right font-medium">NOI</th>
                  <th className="px-4 py-2 font-medium">Fund</th>
                  <th className="px-4 py-2 font-medium w-24">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {availableAssets.map((asset) => (
                  <tr key={asset.asset_id} className="hover:bg-bm-surface/20 transition-colors">
                    <td className="px-4 py-2 font-medium">{asset.name}</td>
                    <td className="px-4 py-2 text-xs">{asset.sector || "—"}</td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">
                      {asset.city && asset.state ? `${asset.city}, ${asset.state}` : asset.state || "—"}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtMoney(asset.latest_noi)}</td>
                    <td className="px-4 py-2 text-xs text-bm-muted2">{asset.fund_name || "—"}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleAdd(asset.asset_id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-bm-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/90 transition"
                        title="Add to model"
                      >
                        <Plus size={12} /> Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
