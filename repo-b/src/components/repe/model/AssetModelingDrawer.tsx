"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import {
  setScenarioOverride,
  deleteScenarioOverride,
} from "@/lib/bos-api";
import type { ScenarioAsset, ScenarioOverride } from "@/lib/bos-api";
import { useAssetPreview } from "./useAssetPreview";
import { AssetPreviewPanel } from "./AssetPreviewPanel";
import { DrawerTabBar, type DrawerTabKey } from "./drawer/DrawerTabBar";
import { AssumptionsTab, SECTIONS } from "./drawer/AssumptionsTab";
import { CashFlowTab } from "./drawer/CashFlowTab";
import { ValuationTab } from "./drawer/ValuationTab";
import { ReturnsTab } from "./drawer/ReturnsTab";

/* ── Component ── */

interface AssetModelingDrawerProps {
  open: boolean;
  onClose: () => void;
  scenarioId: string;
  asset: ScenarioAsset | null;
  overrides: ScenarioOverride[];
  onOverridesChange: (overrides: ScenarioOverride[]) => void;
  readOnly?: boolean;
}

export function AssetModelingDrawer({
  open,
  onClose,
  scenarioId,
  asset,
  overrides,
  onOverridesChange,
  readOnly,
}: AssetModelingDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTabKey>("assumptions");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModifiedOnly, setShowModifiedOnly] = useState(false);

  useEffect(() => {
    setDrafts({});
    setError(null);
    setShowModifiedOnly(false);
    setActiveTab("assumptions");
  }, [asset?.asset_id]);

  const assetOverrides = useMemo(() => {
    if (!asset) return new Map<string, ScenarioOverride>();
    const map = new Map<string, ScenarioOverride>();
    for (const ov of overrides) {
      if (ov.scope_type === "asset" && ov.scope_id === asset.asset_id) {
        map.set(ov.key, ov);
      }
    }
    return map;
  }, [asset, overrides]);

  const { preview, loading: previewLoading, error: previewError } = useAssetPreview(
    open ? scenarioId : null,
    asset?.asset_id ?? null,
    drafts,
    assetOverrides.size,
  );

  const setDraft = (key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const clearFieldOverride = useCallback(async (key: string) => {
    const existing = assetOverrides.get(key);
    if (existing) {
      try {
        await deleteScenarioOverride(existing.id);
        onOverridesChange(overrides.filter((o) => o.id !== existing.id));
      } catch { /* swallow */ }
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [assetOverrides, overrides, onOverridesChange]);

  const hasDrafts = Object.keys(drafts).length > 0;
  const overrideCount = assetOverrides.size;

  const handleSave = useCallback(async () => {
    if (!asset || !hasDrafts) return;
    setSaving(true);
    setError(null);
    try {
      const newOverrides = [...overrides];
      for (const [key, rawValue] of Object.entries(drafts)) {
        const numValue = rawValue === "" ? null : parseFloat(rawValue);
        if (numValue === null || isNaN(numValue)) {
          const existing = assetOverrides.get(key);
          if (existing) {
            await deleteScenarioOverride(existing.id);
            const idx = newOverrides.findIndex((o) => o.id === existing.id);
            if (idx >= 0) newOverrides.splice(idx, 1);
          }
        } else {
          const saved = await setScenarioOverride(scenarioId, {
            scope_type: "asset",
            scope_id: asset.asset_id,
            key,
            value_json: numValue,
          });
          const idx = newOverrides.findIndex(
            (o) => o.scope_type === "asset" && o.scope_id === asset.asset_id && o.key === key,
          );
          if (idx >= 0) newOverrides[idx] = saved;
          else newOverrides.push(saved);
        }
      }
      onOverridesChange(newOverrides);
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [asset, drafts, overrides, assetOverrides, scenarioId, onOverridesChange, hasDrafts]);

  const handleResetAll = useCallback(async () => {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const assetOvs = overrides.filter(
        (o) => o.scope_type === "asset" && o.scope_id === asset.asset_id,
      );
      for (const ov of assetOvs) {
        await deleteScenarioOverride(ov.id);
      }
      onOverridesChange(
        overrides.filter((o) => !(o.scope_type === "asset" && o.scope_id === asset.asset_id)),
      );
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setSaving(false);
    }
  }, [asset, overrides, onOverridesChange]);

  const handleResetSection = useCallback(async (fields: readonly { key: string; label: string; unit: string; step: number; placeholder?: string }[]) => {
    if (!asset) return;
    setSaving(true);
    try {
      const keysInSection = new Set(fields.map((f) => f.key));
      const toDelete = overrides.filter(
        (o) => o.scope_type === "asset" && o.scope_id === asset.asset_id && keysInSection.has(o.key),
      );
      for (const ov of toDelete) {
        await deleteScenarioOverride(ov.id);
      }
      onOverridesChange(overrides.filter((o) => !toDelete.some((d) => d.id === o.id)));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const k of keysInSection) delete next[k];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset section");
    } finally {
      setSaving(false);
    }
  }, [asset, overrides, onOverridesChange]);

  if (!asset) return null;

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={asset.asset_name || asset.asset_id.slice(0, 8)}
      subtitle={[asset.asset_type, asset.fund_name].filter(Boolean).join(" \u00b7 ")}
      width="max-w-7xl"
      footer={
        !readOnly ? (
          <>
            {overrideCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleResetAll} disabled={saving}>
                <RotateCcw size={13} className="mr-1" />
                Reset All ({overrideCount})
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasDrafts}
            >
              <Save size={13} className="mr-1" />
              {saving ? "Saving..." : "Save Assumptions"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col h-full">
        {/* Drawer Tab Bar */}
        <DrawerTabBar activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex gap-0 flex-1 min-h-0">
          {/* ── Left Column: Tab Content ── */}
          <div className="flex-1 min-w-0 overflow-y-auto pr-5">
            {activeTab === "assumptions" && (
              <AssumptionsTab
                assetOverrides={assetOverrides}
                drafts={drafts}
                overrideCount={overrideCount}
                readOnly={readOnly}
                error={error}
                showModifiedOnly={showModifiedOnly}
                onShowModifiedOnlyChange={setShowModifiedOnly}
                onSetDraft={setDraft}
                onClearFieldOverride={clearFieldOverride}
                onResetSection={handleResetSection}
              />
            )}
            {activeTab === "cashflow" && (
              <CashFlowTab
                scenarioId={scenarioId}
                assetId={asset.asset_id}
                preview={preview}
              />
            )}
            {activeTab === "valuation" && (
              <ValuationTab preview={preview} loading={previewLoading} />
            )}
            {activeTab === "returns" && (
              <ReturnsTab preview={preview} loading={previewLoading} />
            )}
          </div>

          {/* ── Right Column: Live Consequences (sticky) ── */}
          <div className="w-[340px] shrink-0 border-l border-bm-border/30 pl-5 overflow-y-auto">
            <div className="sticky top-0">
              <h3 className="mb-3 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
                Projected Impact
              </h3>
              <AssetPreviewPanel
                preview={preview}
                loading={previewLoading}
                error={previewError}
              />
            </div>
          </div>
        </div>
      </div>
    </SlideOver>
  );
}
