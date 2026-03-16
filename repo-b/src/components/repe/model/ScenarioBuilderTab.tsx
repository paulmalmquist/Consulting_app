"use client";

import { useState, useMemo, useCallback } from "react";
import { PlusCircle, X, Search, Loader2, Filter } from "lucide-react";
import type { ScenarioAsset, AvailableAsset, ScenarioOverride } from "@/lib/bos-api";

interface ScenarioBuilderTabProps {
  scenarioAssets: ScenarioAsset[];
  availableAssets: AvailableAsset[];
  overrides: ScenarioOverride[];
  onAddAsset: (asset: AvailableAsset) => Promise<void>;
  onRemoveAsset: (assetId: string) => Promise<void>;
  onAddAll: () => Promise<void>;
  onOpenAsset?: (assetId: string) => void;
  readOnly?: boolean;
}

function fmtCcy(val: number | undefined | null): string {
  if (val == null) return "—";
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export function ScenarioBuilderTab({
  scenarioAssets,
  availableAssets,
  overrides,
  onAddAsset,
  onRemoveAsset,
  onAddAll,
  onOpenAsset,
  readOnly,
}: ScenarioBuilderTabProps) {
  const [search, setSearch] = useState("");
  const [filterFund, setFilterFund] = useState("");
  const [filterSector, setFilterSector] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const overridesByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const ov of overrides) {
      if (ov.scope_type === "asset") {
        map.set(ov.scope_id, (map.get(ov.scope_id) || 0) + 1);
      }
    }
    return map;
  }, [overrides]);

  const fundOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of availableAssets) {
      if (a.fund_name) names.add(a.fund_name);
    }
    for (const a of scenarioAssets) {
      if (a.fund_name) names.add(a.fund_name);
    }
    return Array.from(names).sort();
  }, [availableAssets, scenarioAssets]);

  const sectorOptions = useMemo(() => {
    const types = new Set<string>();
    for (const a of availableAssets) {
      if (a.asset_type) types.add(a.asset_type);
    }
    for (const a of scenarioAssets) {
      if (a.asset_type) types.add(a.asset_type);
    }
    return Array.from(types).sort();
  }, [availableAssets, scenarioAssets]);

  const filtered = useMemo(() => {
    let list = availableAssets;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.asset_name || "").toLowerCase().includes(q) ||
          (a.fund_name || "").toLowerCase().includes(q),
      );
    }
    if (filterFund) list = list.filter((a) => a.fund_name === filterFund);
    if (filterSector) list = list.filter((a) => a.asset_type === filterSector);
    return list;
  }, [availableAssets, search, filterFund, filterSector]);

  const handleAdd = useCallback(async (asset: AvailableAsset) => {
    setAddingId(asset.asset_id);
    try { await onAddAsset(asset); } finally { setAddingId(null); }
  }, [onAddAsset]);

  const handleRemove = useCallback(async (assetId: string) => {
    setRemovingId(assetId);
    try { await onRemoveAsset(assetId); } finally { setRemovingId(null); }
  }, [onRemoveAsset]);

  const handleAddAll = useCallback(async () => {
    setAddingAll(true);
    try { await onAddAll(); } finally { setAddingAll(false); }
  }, [onAddAll]);

  const handleAddSelected = useCallback(async () => {
    setAddingAll(true);
    try {
      for (const id of selected) {
        const asset = availableAssets.find((a) => a.asset_id === id);
        if (asset) await onAddAsset(asset);
      }
      setSelected(new Set());
    } finally { setAddingAll(false); }
  }, [selected, availableAssets, onAddAsset]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const modifiedCount = scenarioAssets.filter((sa) => overridesByAsset.has(sa.asset_id)).length;
  const unchangedCount = scenarioAssets.length - modifiedCount;

  return (
    <div className="space-y-4">
      {/* ── Selected Assets ── */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
        <div className="flex items-center justify-between border-b border-bm-border/30 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
              Selected Assets
            </h3>
            {scenarioAssets.length > 0 && (
              <div className="flex gap-2 text-[10px] tabular-nums">
                <span className="text-bm-muted">{scenarioAssets.length} total</span>
                {modifiedCount > 0 && (
                  <span className="text-blue-400">{modifiedCount} modified</span>
                )}
                {unchangedCount > 0 && (
                  <span className="text-bm-muted">{unchangedCount} unchanged</span>
                )}
              </div>
            )}
          </div>
          {!readOnly && availableAssets.length > 0 && scenarioAssets.length === 0 && (
            <button
              onClick={handleAddAll}
              disabled={addingAll}
              className="inline-flex items-center gap-1.5 rounded bg-bm-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
            >
              {addingAll ? <Loader2 size={11} className="animate-spin" /> : <PlusCircle size={11} />}
              Load All Active
            </button>
          )}
        </div>

        {scenarioAssets.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-bm-muted2">No assets in scope.</p>
            <p className="mt-0.5 text-[10px] text-bm-muted">Add from Available Assets below or load all active assets.</p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bm-surface/20">
                <tr className="border-b border-bm-border/30 text-left text-[9px] uppercase tracking-[0.1em] text-bm-muted">
                  <th className="px-3 py-1.5 font-medium">Asset Name</th>
                  <th className="px-3 py-1.5 font-medium">Sector</th>
                  <th className="px-3 py-1.5 font-medium">Fund</th>
                  <th className="px-3 py-1.5 font-medium text-center">Status</th>
                  <th className="w-8 px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {scenarioAssets.map((sa) => {
                  const ovCount = overridesByAsset.get(sa.asset_id) || 0;
                  const status = ovCount > 0 ? "modified" : "unchanged";
                  return (
                    <tr
                      key={sa.id}
                      className="border-b border-bm-border/15 transition-colors hover:bg-bm-surface/15 cursor-pointer"
                      onClick={() => onOpenAsset?.(sa.asset_id)}
                    >
                      <td className="px-3 py-2 font-medium text-bm-text">
                        {sa.asset_name || sa.asset_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 text-bm-muted2 capitalize">
                        {sa.asset_type?.replace(/_/g, " ") || "—"}
                      </td>
                      <td className="px-3 py-2 text-bm-muted2">
                        {sa.fund_name || "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-medium ${
                          status === "modified"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-bm-surface/30 text-bm-muted"
                        }`}>
                          {status === "modified" ? `${ovCount} overrides` : "unchanged"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {!readOnly && (
                          <button
                            onClick={() => handleRemove(sa.asset_id)}
                            disabled={removingId === sa.asset_id}
                            className="rounded p-0.5 text-bm-muted opacity-60 transition-all hover:bg-red-500/15 hover:text-red-400 hover:opacity-100 disabled:opacity-20"
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Available Assets ── */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
        <div className="flex items-center justify-between border-b border-bm-border/30 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
              Available Assets
            </h3>
            <span className="text-[10px] tabular-nums text-bm-muted">{filtered.length}</span>
          </div>
          {!readOnly && selected.size > 0 && (
            <button
              onClick={handleAddSelected}
              disabled={addingAll}
              className="inline-flex items-center gap-1.5 rounded bg-bm-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
            >
              {addingAll ? <Loader2 size={11} className="animate-spin" /> : <PlusCircle size={11} />}
              Add Selected ({selected.size})
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex gap-2 border-b border-bm-border/20 px-4 py-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-bm-muted" />
            <input
              className="w-full rounded border border-bm-border/50 bg-bm-surface/10 py-1 pl-7 pr-2 text-xs outline-none transition-colors focus:border-bm-border-strong/70"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {fundOptions.length > 1 && (
            <select
              className="rounded border border-bm-border/50 bg-bm-surface/10 px-1.5 py-1 text-xs outline-none"
              value={filterFund}
              onChange={(e) => setFilterFund(e.target.value)}
            >
              <option value="">All Funds</option>
              {fundOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {sectorOptions.length > 1 && (
            <select
              className="rounded border border-bm-border/50 bg-bm-surface/10 px-1.5 py-1 text-xs outline-none"
              value={filterSector}
              onChange={(e) => setFilterSector(e.target.value)}
            >
              <option value="">All Sectors</option>
              {sectorOptions.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          )}
          {(filterFund || filterSector || search) && (
            <button
              onClick={() => { setSearch(""); setFilterFund(""); setFilterSector(""); }}
              className="rounded border border-bm-border/50 px-1.5 py-1 text-[10px] text-bm-muted2 hover:bg-bm-surface/20"
            >
              Clear
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-bm-muted2">
            {availableAssets.length === 0 && scenarioAssets.length > 0
              ? "All assets are already in this scenario."
              : availableAssets.length === 0
                ? "No assets found in this environment."
                : "No matching assets."}
          </p>
        ) : (
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-bm-surface/20">
                <tr className="border-b border-bm-border/30 text-left text-[9px] uppercase tracking-[0.1em] text-bm-muted">
                  {!readOnly && <th className="w-7 px-2 py-1.5" />}
                  <th className="px-3 py-1.5 font-medium">Asset Name</th>
                  <th className="px-3 py-1.5 font-medium">Sector</th>
                  <th className="px-3 py-1.5 font-medium">Fund</th>
                  {!readOnly && <th className="w-14 px-2 py-1.5" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.asset_id} className="border-b border-bm-border/15 transition-colors hover:bg-bm-surface/15">
                    {!readOnly && (
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(a.asset_id)}
                          onChange={() => toggleSelect(a.asset_id)}
                          className="rounded border-bm-border/50 bg-transparent"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-bm-text">
                      {a.asset_name || a.asset_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2 text-bm-muted2 capitalize">
                      {a.asset_type?.replace(/_/g, " ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-bm-muted2">{a.fund_name || "—"}</td>
                    {!readOnly && (
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => handleAdd(a)}
                          disabled={addingId === a.asset_id}
                          className="rounded bg-bm-accent/80 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-bm-accent disabled:opacity-40"
                        >
                          {addingId === a.asset_id ? "..." : "Add"}
                        </button>
                      </td>
                    )}
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
