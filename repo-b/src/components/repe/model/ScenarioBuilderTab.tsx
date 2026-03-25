"use client";

import { useState, useMemo, useCallback } from "react";
import { PlusCircle, X, Loader2 } from "lucide-react";
import type { ScenarioAsset, AvailableAsset, ScenarioOverride } from "@/lib/bos-api";
import { AssetPickerDialog } from "./AssetPickerDialog";

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
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const overridesByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const ov of overrides) {
      if (ov.scope_type === "asset") {
        map.set(ov.scope_id, (map.get(ov.scope_id) || 0) + 1);
      }
    }
    return map;
  }, [overrides]);

  const handleRemove = useCallback(async (assetId: string) => {
    setRemovingId(assetId);
    try { await onRemoveAsset(assetId); } finally { setRemovingId(null); }
  }, [onRemoveAsset]);

  const handleAddAll = useCallback(async () => {
    setAddingAll(true);
    try { await onAddAll(); } finally { setAddingAll(false); }
  }, [onAddAll]);

  const handleAddAssets = useCallback(async (assets: AvailableAsset[]) => {
    for (const asset of assets) {
      await onAddAsset(asset);
    }
  }, [onAddAsset]);

  const modifiedCount = scenarioAssets.filter((sa) => overridesByAsset.has(sa.asset_id)).length;
  const unchangedCount = scenarioAssets.length - modifiedCount;

  return (
    <div className="space-y-4">
      {/* ── Selected Assets ── */}
      <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10">
        <div className="flex items-center justify-between border-b border-bm-border/30 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
              Scenario Assets
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
          {!readOnly && (
            <div className="flex items-center gap-2">
              {availableAssets.length > 0 && scenarioAssets.length === 0 && (
                <button
                  onClick={handleAddAll}
                  disabled={addingAll}
                  className="inline-flex items-center gap-1.5 rounded bg-bm-surface/30 px-3 py-1 text-[10px] font-medium text-bm-muted2 hover:bg-bm-surface/50 hover:text-bm-text disabled:opacity-40"
                >
                  {addingAll ? <Loader2 size={11} className="animate-spin" /> : null}
                  Load All Active
                </button>
              )}
              {availableAssets.length > 0 && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded bg-bm-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-bm-accent/90"
                >
                  <PlusCircle size={11} />
                  Add Assets
                </button>
              )}
            </div>
          )}
        </div>

        {scenarioAssets.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-bm-muted2">No assets in scope.</p>
            <p className="mt-0.5 text-[10px] text-bm-muted">
              Click &quot;Add Assets&quot; to select assets for this scenario.
            </p>
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
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
                        {sa.asset_type?.replace(/_/g, " ") || "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-bm-muted2">
                        {sa.fund_name || "\u2014"}
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

      {/* Asset Picker Dialog */}
      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        availableAssets={availableAssets}
        onAddAssets={handleAddAssets}
      />
    </div>
  );
}
