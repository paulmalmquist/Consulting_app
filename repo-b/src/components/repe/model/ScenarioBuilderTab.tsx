"use client";

import { useState, useMemo, useCallback } from "react";
import { PlusCircle, X, Search, Loader2 } from "lucide-react";
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
    return Array.from(names).sort();
  }, [availableAssets]);

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
    if (filterFund) {
      list = list.filter((a) => a.fund_name === filterFund);
    }
    return list;
  }, [availableAssets, search, filterFund]);

  const handleAdd = useCallback(
    async (asset: AvailableAsset) => {
      setAddingId(asset.asset_id);
      try {
        await onAddAsset(asset);
      } finally {
        setAddingId(null);
      }
    },
    [onAddAsset],
  );

  const handleRemove = useCallback(
    async (assetId: string) => {
      setRemovingId(assetId);
      try {
        await onRemoveAsset(assetId);
      } finally {
        setRemovingId(null);
      }
    },
    [onRemoveAsset],
  );

  const handleAddAll = useCallback(async () => {
    setAddingAll(true);
    try {
      await onAddAll();
    } finally {
      setAddingAll(false);
    }
  }, [onAddAll]);

  const handleAddSelected = useCallback(async () => {
    setAddingAll(true);
    try {
      for (const id of selected) {
        const asset = availableAssets.find((a) => a.asset_id === id);
        if (asset) await onAddAsset(asset);
      }
      setSelected(new Set());
    } finally {
      setAddingAll(false);
    }
  }, [selected, availableAssets, onAddAsset]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Selected Assets in Scenario ── */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            Selected Assets in Scenario
            {scenarioAssets.length > 0 && (
              <span className="ml-2 text-bm-text">{scenarioAssets.length}</span>
            )}
          </h3>
          {!readOnly && availableAssets.length > 0 && scenarioAssets.length === 0 && (
            <button
              onClick={handleAddAll}
              disabled={addingAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
            >
              {addingAll ? <Loader2 size={12} className="animate-spin" /> : <PlusCircle size={12} />}
              Load All Active Assets
            </button>
          )}
        </div>

        {scenarioAssets.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-bm-border/40 p-8 text-center">
            <p className="text-sm text-bm-muted2">No assets added to this scenario yet.</p>
            <p className="mt-1 text-xs text-bm-muted2">
              Use the Available Assets table below to add assets, or click &ldquo;Load All Active Assets&rdquo; above.
            </p>
          </div>
        ) : (
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/30 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Fund</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="w-10 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {scenarioAssets.map((sa) => {
                  const hasOverrides = overridesByAsset.has(sa.asset_id);
                  return (
                    <tr
                      key={sa.id}
                      className="border-b border-bm-border/20 transition-colors hover:bg-bm-surface/20"
                    >
                      <td className="px-3 py-2.5 font-medium text-bm-text">
                        <button
                          type="button"
                          onClick={() => onOpenAsset?.(sa.asset_id)}
                          className="text-left hover:text-bm-accent transition-colors underline decoration-bm-border/40 underline-offset-2 hover:decoration-bm-accent/60"
                        >
                          {sa.asset_name || sa.asset_id.slice(0, 8)}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-bm-muted2">
                        {sa.asset_type || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-bm-muted2">
                        {sa.fund_name || "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            hasOverrides
                              ? "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                              : "border border-bm-border/50 bg-bm-surface/10 text-bm-muted2"
                          }`}
                        >
                          {hasOverrides ? "Modified" : "Unchanged"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!readOnly && (
                          <button
                            onClick={() => handleRemove(sa.asset_id)}
                            disabled={removingId === sa.asset_id}
                            className="rounded p-1 text-bm-muted2 transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
                            title="Remove from scenario"
                          >
                            <X size={13} />
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
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            Available Assets
            {filtered.length > 0 && (
              <span className="ml-2 text-bm-text">{filtered.length}</span>
            )}
          </h3>
          {!readOnly && selected.size > 0 && (
            <button
              onClick={handleAddSelected}
              disabled={addingAll}
              className="inline-flex items-center gap-1.5 rounded-lg bg-bm-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
            >
              {addingAll ? <Loader2 size={12} className="animate-spin" /> : <PlusCircle size={12} />}
              Add Selected ({selected.size})
            </button>
          )}
        </div>

        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bm-muted" />
            <input
              className="w-full rounded-md border border-bm-border/70 bg-bm-surface/18 py-1.5 pl-8 pr-3 text-sm outline-none transition-colors focus:border-bm-border-strong/70"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {fundOptions.length > 1 && (
            <select
              className="rounded-md border border-bm-border/70 bg-bm-surface/18 px-2 py-1.5 text-sm outline-none"
              value={filterFund}
              onChange={(e) => setFilterFund(e.target.value)}
            >
              <option value="">All Funds</option>
              {fundOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>

        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-bm-muted2">
            {availableAssets.length === 0 && scenarioAssets.length > 0
              ? "All assets are already in this scenario."
              : availableAssets.length === 0
                ? "No assets found. Check that funds and assets are seeded in this environment."
                : "No matching assets found."}
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/30 text-left text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                  {!readOnly && <th className="w-8 px-3 py-2" />}
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Fund</th>
                  {!readOnly && <th className="w-16 px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.asset_id}
                    className="border-b border-bm-border/20 transition-colors hover:bg-bm-surface/20"
                  >
                    {!readOnly && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(a.asset_id)}
                          onChange={() => toggleSelect(a.asset_id)}
                          className="rounded border-bm-border/70"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 font-medium text-bm-text">
                      {a.asset_name || a.asset_id.slice(0, 8)}
                    </td>
                    <td className="px-3 py-2.5 text-bm-muted2">
                      {a.asset_type || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-bm-muted2">
                      {a.fund_name || "—"}
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2.5 text-right">
                        <button
                          onClick={() => handleAdd(a)}
                          disabled={addingId === a.asset_id}
                          className="rounded-md bg-bm-accent/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-bm-accent disabled:opacity-40"
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
