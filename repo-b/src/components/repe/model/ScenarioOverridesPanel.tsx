"use client";

import { useState, useCallback, useMemo } from "react";
import { ChevronDown, ChevronRight, RotateCcw, Save } from "lucide-react";
import type { ScenarioAsset, ScenarioOverride } from "@/lib/bos-api";
import {
  setScenarioOverride,
  deleteScenarioOverride,
  resetScenarioOverrides as apiResetAll,
} from "@/lib/bos-api";

const OVERRIDE_KEYS = [
  { key: "revenue_delta_pct", label: "Revenue Change", unit: "%", step: 1 },
  { key: "expense_delta_pct", label: "Expense Change", unit: "%", step: 1 },
  { key: "amort_delta_pct", label: "Amort Change", unit: "%", step: 1 },
  { key: "noi_override", label: "NOI Override", unit: "$", step: 10000 },
  { key: "capex_override", label: "Capex Override", unit: "$", step: 10000 },
] as const;

interface ScenarioOverridesPanelProps {
  scenarioId: string;
  scenarioAssets: ScenarioAsset[];
  overrides: ScenarioOverride[];
  onOverridesChange: (overrides: ScenarioOverride[]) => void;
  readOnly?: boolean;
}

export function ScenarioOverridesPanel({
  scenarioId,
  scenarioAssets,
  overrides,
  onOverridesChange,
  readOnly,
}: ScenarioOverridesPanelProps) {
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});

  const overridesByAsset = useMemo(() => {
    const map = new Map<string, Map<string, ScenarioOverride>>();
    for (const ov of overrides) {
      if (ov.scope_type === "asset") {
        if (!map.has(ov.scope_id)) map.set(ov.scope_id, new Map());
        map.get(ov.scope_id)!.set(ov.key, ov);
      }
    }
    return map;
  }, [overrides]);

  const getOverrideValue = (assetId: string, key: string): string => {
    const draft = drafts[assetId]?.[key];
    if (draft !== undefined) return draft;
    const ov = overridesByAsset.get(assetId)?.get(key);
    if (!ov) return "";
    const val = ov.value_json;
    return typeof val === "number" ? String(val) : typeof val === "string" ? val : "";
  };

  const setDraft = (assetId: string, key: string, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [assetId]: { ...prev[assetId], [key]: value },
    }));
  };

  const handleSaveAsset = useCallback(
    async (assetId: string) => {
      const assetDrafts = drafts[assetId];
      if (!assetDrafts || Object.keys(assetDrafts).length === 0) return;

      setSaving(true);
      setError(null);
      try {
        const newOverrides = [...overrides];
        for (const [key, rawValue] of Object.entries(assetDrafts)) {
          const numValue = rawValue === "" ? null : parseFloat(rawValue);
          if (numValue === null || isNaN(numValue)) {
            // Remove override if cleared
            const existing = overridesByAsset.get(assetId)?.get(key);
            if (existing) {
              await deleteScenarioOverride(existing.id);
              const idx = newOverrides.findIndex((o) => o.id === existing.id);
              if (idx >= 0) newOverrides.splice(idx, 1);
            }
          } else {
            const saved = await setScenarioOverride(scenarioId, {
              scope_type: "asset",
              scope_id: assetId,
              key,
              value_json: numValue,
            });
            const idx = newOverrides.findIndex(
              (o) => o.scope_type === "asset" && o.scope_id === assetId && o.key === key,
            );
            if (idx >= 0) newOverrides[idx] = saved;
            else newOverrides.push(saved);
          }
        }
        onOverridesChange(newOverrides);
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[assetId];
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save overrides");
      } finally {
        setSaving(false);
      }
    },
    [scenarioId, drafts, overrides, overridesByAsset, onOverridesChange],
  );

  const handleResetAsset = useCallback(
    async (assetId: string) => {
      setSaving(true);
      setError(null);
      try {
        const assetOverrides = overrides.filter(
          (o) => o.scope_type === "asset" && o.scope_id === assetId,
        );
        for (const ov of assetOverrides) {
          await deleteScenarioOverride(ov.id);
        }
        onOverridesChange(
          overrides.filter(
            (o) => !(o.scope_type === "asset" && o.scope_id === assetId),
          ),
        );
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[assetId];
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reset overrides");
      } finally {
        setSaving(false);
      }
    },
    [overrides, onOverridesChange],
  );

  const handleResetAll = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await apiResetAll(scenarioId);
      onOverridesChange([]);
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset all overrides");
    } finally {
      setSaving(false);
    }
  }, [scenarioId, onOverridesChange]);

  if (scenarioAssets.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
        <p className="text-sm text-bm-muted2">
          Add assets in the Scenario Builder tab before configuring assumptions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
          Assumption Overrides
        </h3>
        {!readOnly && overrides.length > 0 && (
          <button
            onClick={handleResetAll}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md border border-bm-border/50 px-2 py-1 text-[11px] text-bm-muted2 hover:bg-bm-surface/30 disabled:opacity-40"
          >
            <RotateCcw size={10} />
            Reset All
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="space-y-1">
        {scenarioAssets.map((sa) => {
          const isExpanded = expandedAsset === sa.asset_id;
          const assetOverrideCount = overridesByAsset.get(sa.asset_id)?.size || 0;
          const hasDrafts = !!drafts[sa.asset_id] && Object.keys(drafts[sa.asset_id]).length > 0;

          return (
            <div
              key={sa.id}
              className="rounded-xl border border-bm-border/50 bg-bm-surface/10"
            >
              <button
                onClick={() => setExpandedAsset(isExpanded ? null : sa.asset_id)}
                className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors hover:bg-bm-surface/20"
              >
                {isExpanded ? (
                  <ChevronDown size={14} className="text-bm-muted" />
                ) : (
                  <ChevronRight size={14} className="text-bm-muted" />
                )}
                <span className="flex-1 font-medium text-bm-text">
                  {sa.asset_name || sa.asset_id.slice(0, 8)}
                </span>
                <span className="text-xs text-bm-muted2">{sa.fund_name || ""}</span>
                {assetOverrideCount > 0 && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                    {assetOverrideCount} override{assetOverrideCount !== 1 ? "s" : ""}
                  </span>
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-bm-border/30 px-4 py-3 space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {OVERRIDE_KEYS.map((ok) => (
                      <label key={ok.key} className="space-y-1">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                          {ok.label} ({ok.unit})
                        </span>
                        <input
                          type="number"
                          step={ok.step}
                          className="w-full rounded-md border border-bm-border/70 bg-bm-surface/18 px-3 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-bm-border-strong/70 disabled:opacity-40"
                          placeholder={ok.unit === "%" ? "0" : "—"}
                          value={getOverrideValue(sa.asset_id, ok.key)}
                          onChange={(e) => setDraft(sa.asset_id, ok.key, e.target.value)}
                          disabled={readOnly}
                        />
                      </label>
                    ))}
                  </div>

                  {!readOnly && (
                    <div className="flex justify-end gap-2 pt-1">
                      {assetOverrideCount > 0 && (
                        <button
                          onClick={() => handleResetAsset(sa.asset_id)}
                          disabled={saving}
                          className="inline-flex items-center gap-1 rounded-md border border-bm-border/50 px-2.5 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/30 disabled:opacity-40"
                        >
                          <RotateCcw size={11} />
                          Reset
                        </button>
                      )}
                      <button
                        onClick={() => handleSaveAsset(sa.asset_id)}
                        disabled={saving || !hasDrafts}
                        className="inline-flex items-center gap-1 rounded-md bg-bm-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
                      >
                        <Save size={11} />
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
