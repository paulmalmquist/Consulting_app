"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Copy, GitCompare, RefreshCw, Loader2 } from "lucide-react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

import type { ReModel } from "@/components/repe/model/types";
import { apiFetch } from "@/components/repe/model/types";
import { ModelHeader } from "@/components/repe/model/ModelHeader";
import { ModelTabBar, type TabKey } from "@/components/repe/model/ModelTabBar";
import { ScenarioSidebar } from "@/components/repe/model/ScenarioSidebar";
import { ScenarioBuilderTab } from "@/components/repe/model/ScenarioBuilderTab";
import { ScenarioOverridesPanel } from "@/components/repe/model/ScenarioOverridesPanel";
import { ScenarioResultsPanel } from "@/components/repe/model/ScenarioResultsPanel";
import { ScenarioComparePanel } from "@/components/repe/model/ScenarioComparePanel";
import { AssetModelingDrawer } from "@/components/repe/model/AssetModelingDrawer";
import { SchemaNotReady } from "@/components/repe/model/SchemaNotReady";
import { useAutoRecalc } from "@/hooks/useAutoRecalc";
import {
  listModelScenarios,
  createModelScenario,
  cloneModelScenario,
  deleteModelScenario,
  listScenarioAssets,
  addScenarioAsset,
  removeScenarioAsset,
  listAvailableAssets,
  listScenarioOverrides,
} from "@/lib/bos-api";
import type {
  ModelScenario,
  ScenarioAsset,
  AvailableAsset,
  ScenarioOverride,
} from "@/lib/bos-api";

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export default function ModelWorkspacePage() {
  const params = useParams();
  const modelId = params.modelId as string;
  const { envId } = useReEnv();

  const [model, setModel] = useState<ReModel | null>(null);
  const [scenarios, setScenarios] = useState<ModelScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("builder");

  const [scenarioAssets, setScenarioAssets] = useState<ScenarioAsset[]>([]);
  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [overrides, setOverrides] = useState<ScenarioOverride[]>([]);

  const [drawerAssetId, setDrawerAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState(false);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? null,
    [scenarios, activeScenarioId],
  );

  const drawerAsset = useMemo(
    () => (drawerAssetId ? scenarioAssets.find((sa) => sa.asset_id === drawerAssetId) ?? null : null),
    [drawerAssetId, scenarioAssets],
  );

  // Load model + scenarios
  useEffect(() => {
    if (!modelId || !envId) return;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      apiFetch<ReModel>(`/api/re/v2/models/${modelId}`),
      listModelScenarios(modelId),
    ]).then(([modelRes, scenariosRes]) => {
      if (modelRes.status === "fulfilled") {
        setModel(modelRes.value);
      } else {
        const reason = modelRes.reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        if (msg.includes("SCHEMA_NOT_MIGRATED") || msg.includes("schema not migrated")) {
          setSchemaError(true);
        } else {
          setError("Failed to load model");
        }
      }
      if (scenariosRes.status === "fulfilled") {
        const sc = scenariosRes.value;
        setScenarios(sc);
        const base = sc.find((s) => s.is_base) ?? sc[0];
        if (base) setActiveScenarioId(base.id);
      }
      setLoading(false);
    });
  }, [modelId, envId]);

  // Load scenario data
  useEffect(() => {
    if (!activeScenarioId || !envId) return;
    setDrawerAssetId(null);
    Promise.allSettled([
      listScenarioAssets(activeScenarioId),
      listAvailableAssets(activeScenarioId, envId),
      listScenarioOverrides(activeScenarioId),
    ]).then(([assetsRes, availRes, ovRes]) => {
      if (assetsRes.status === "fulfilled") setScenarioAssets(assetsRes.value);
      if (availRes.status === "fulfilled") setAvailableAssets(availRes.value);
      if (ovRes.status === "fulfilled") setOverrides(ovRes.value);
    });
  }, [activeScenarioId, envId]);

  useEffect(() => {
    publishAssistantPageContext({
      route: envId ? `/lab/env/${envId}/re/models/${modelId}` : null,
      surface: "model_detail",
      active_module: "re",
      page_entity_type: "model",
      page_entity_id: modelId,
      page_entity_name: model?.name || null,
      selected_entities: model
        ? [
            {
              entity_type: "model",
              entity_id: modelId,
              name: model.name,
              source: "page",
              parent_entity_type: model.primary_fund_id ? "fund" : null,
              parent_entity_id: model.primary_fund_id || null,
            },
          ]
        : [],
      visible_data: {
        models: model
          ? [
              {
                entity_type: "model",
                entity_id: modelId,
                name: model.name,
                metadata: {
                  status: model.status,
                  model_type: model.model_type,
                  strategy_type: model.strategy_type,
                },
              },
            ]
          : [],
        assets: scenarioAssets.map((asset) => ({
          entity_type: "asset",
          entity_id: asset.asset_id,
          name: asset.asset_name || asset.asset_id,
          parent_entity_type: "fund",
          parent_entity_id: asset.source_fund_id || null,
          metadata: {
            fund_name: asset.fund_name,
            asset_type: asset.asset_type,
          },
        })),
        metrics: {
          scenario_count: scenarios.length,
          scenario_asset_count: scenarioAssets.length,
          active_tab: activeTab,
        },
        notes: [activeScenario ? `Active scenario: ${activeScenario.name}` : "Model detail workspace"],
      },
    });
    return () => resetAssistantPageContext();
  }, [activeScenario, activeTab, envId, model, modelId, scenarioAssets, scenarios.length]);

  const isLocked = model?.status === "archived" || model?.status === "official_base_case";
  const isArchived = model?.status === "archived";

  // Auto-recalc hook
  const {
    triggerRecalc,
    manualRecalc,
    status: recalcStatus,
    result: recalcResult,
    lastUpdatedAt,
    error: recalcError,
  } = useAutoRecalc(activeScenarioId, !isLocked && scenarioAssets.length > 0);

  const modifiedAssetCount = useMemo(() => {
    const assetIds = new Set(overrides.filter((o) => o.scope_type === "asset").map((o) => o.scope_id));
    return assetIds.size;
  }, [overrides]);

  // Handlers
  const handleStatusChange = useCallback(async (newStatus: string) => {
    try {
      const updated = await apiFetch<ReModel>(`/api/re/v2/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setModel(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update model");
    }
  }, [modelId]);

  const handleCreateScenario = useCallback(async (name: string) => {
    try {
      const created = await createModelScenario(modelId, { name });
      setScenarios((prev) => [...prev, created]);
      setActiveScenarioId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create scenario");
    }
  }, [modelId]);

  const handleCloneScenario = useCallback(async (scenarioId: string) => {
    const source = scenarios.find((s) => s.id === scenarioId);
    const newName = `${source?.name || "Scenario"} (copy)`;
    try {
      const cloned = await cloneModelScenario(scenarioId, newName);
      setScenarios((prev) => [...prev, cloned]);
      setActiveScenarioId(cloned.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone scenario");
    }
  }, [scenarios]);

  const handleDeleteScenario = useCallback(async (scenarioId: string) => {
    try {
      await deleteModelScenario(scenarioId);
      setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
      if (activeScenarioId === scenarioId) {
        const remaining = scenarios.filter((s) => s.id !== scenarioId);
        const base = remaining.find((s) => s.is_base) ?? remaining[0];
        setActiveScenarioId(base?.id ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete scenario");
    }
  }, [activeScenarioId, scenarios]);

  const handleAddAsset = useCallback(async (asset: AvailableAsset) => {
    if (!activeScenarioId) return;
    try {
      const added = await addScenarioAsset(activeScenarioId, {
        asset_id: asset.asset_id,
        source_fund_id: asset.source_fund_id || undefined,
        source_investment_id: asset.source_investment_id || undefined,
      });
      const enriched: ScenarioAsset = {
        ...added,
        asset_name: added.asset_name || asset.asset_name || "",
        asset_type: added.asset_type || asset.asset_type || undefined,
        fund_name: added.fund_name || asset.fund_name || undefined,
      };
      setScenarioAssets((prev) => [...prev, enriched]);
      setAvailableAssets((prev) => prev.filter((a) => a.asset_id !== asset.asset_id));
      triggerRecalc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add asset");
    }
  }, [activeScenarioId, triggerRecalc]);

  const handleRemoveAsset = useCallback(async (assetId: string) => {
    if (!activeScenarioId) return;
    try {
      await removeScenarioAsset(activeScenarioId, assetId);
      const removed = scenarioAssets.find((sa) => sa.asset_id === assetId);
      setScenarioAssets((prev) => prev.filter((sa) => sa.asset_id !== assetId));
      if (removed) {
        setAvailableAssets((prev) => [...prev, {
          asset_id: removed.asset_id,
          asset_name: removed.asset_name,
          asset_type: removed.asset_type,
          source_fund_id: removed.source_fund_id,
          source_investment_id: removed.source_investment_id,
          fund_name: removed.fund_name,
        }]);
      }
      if (drawerAssetId === assetId) setDrawerAssetId(null);
      triggerRecalc();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove asset");
    }
  }, [activeScenarioId, scenarioAssets, drawerAssetId, triggerRecalc]);

  const handleAddAllAssets = useCallback(async () => {
    if (!activeScenarioId) return;
    for (const asset of availableAssets) {
      try {
        const added = await addScenarioAsset(activeScenarioId, {
          asset_id: asset.asset_id,
          source_fund_id: asset.source_fund_id || undefined,
          source_investment_id: asset.source_investment_id || undefined,
        });
        setScenarioAssets((prev) => [...prev, {
          ...added,
          asset_name: added.asset_name || asset.asset_name || "",
          asset_type: added.asset_type || asset.asset_type || undefined,
          fund_name: added.fund_name || asset.fund_name || undefined,
        }]);
      } catch { /* skip duplicates */ }
    }
    setAvailableAssets([]);
    triggerRecalc();
  }, [activeScenarioId, availableAssets, triggerRecalc]);

  if (loading) return <div className="p-6 text-xs text-bm-muted2">Loading model...</div>;

  if (schemaError) {
    return <SchemaNotReady onRetry={() => window.location.reload()} />;
  }

  if (!model) {
    return (
      <div className="m-6 space-y-3 rounded-lg border border-bm-border/30 bg-bm-surface/10 p-6">
        <h2 className="text-sm font-semibold text-bm-text">Unable to load model</h2>
        <p className="text-xs text-red-300">{error || "Model not found."}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-bm-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-4" data-testid="model-workspace">
      <ModelHeader model={model} onStatusChange={handleStatusChange} />

      {/* ── Scenario Header Strip ── */}
      {activeScenario && (
        <div className="flex items-center justify-between rounded-lg border border-bm-border/40 bg-bm-surface/8 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <div>
              <span className="text-bm-muted">Scenario</span>{" "}
              <span className="font-medium text-bm-text">{activeScenario.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                activeScenario.is_base ? "bg-blue-400" : "bg-amber-400"
              }`} />
              <span className="text-bm-muted2">{activeScenario.is_base ? "Base Case" : "Custom"}</span>
            </div>
            <div className="text-bm-muted2">
              {new Date(activeScenario.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="flex gap-3 tabular-nums text-bm-muted2">
              <span>{scenarioAssets.length} assets</span>
              <span>{overrides.length} overrides</span>
              {modifiedAssetCount > 0 && (
                <span className="text-blue-400">{modifiedAssetCount} modified</span>
              )}
            </div>
            {recalcResult && scenarioAssets.length > 1 && (
              <div className="flex gap-3 border-l border-bm-border/30 pl-3 ml-1 tabular-nums text-[10px]">
                <span className="text-bm-muted2">
                  NOI{" "}
                  <span className="text-bm-text font-medium">
                    {(() => {
                      const noi = Number(recalcResult.summary?.total_noi ?? 0);
                      return Math.abs(noi) >= 1_000_000
                        ? `$${(noi / 1_000_000).toFixed(1)}M`
                        : `$${(noi / 1_000).toFixed(0)}K`;
                    })()}
                  </span>
                </span>
                {(() => {
                  const fundRow = recalcResult.metrics.find((m) => m.scope_type === "fund");
                  return fundRow?.gross_irr != null ? (
                    <span className="text-bm-muted2">
                      IRR{" "}
                      <span className="text-bm-accent font-medium">
                        {(fundRow.gross_irr * 100).toFixed(1)}%
                      </span>
                    </span>
                  ) : null;
                })()}
                {(() => {
                  const fundRow = recalcResult.metrics.find((m) => m.scope_type === "fund");
                  return fundRow?.gross_moic != null ? (
                    <span className="text-bm-muted2">
                      MOIC{" "}
                      <span className="text-bm-text font-medium">
                        {fundRow.gross_moic.toFixed(2)}x
                      </span>
                    </span>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Recalc Status */}
          {recalcStatus === "dirty" && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Pending recalculation
            </span>
          )}
          {recalcStatus === "recalculating" && (
            <span className="inline-flex items-center gap-1 text-[10px] text-bm-accent">
              <Loader2 size={10} className="animate-spin" />
              Updating...
            </span>
          )}
          {recalcStatus === "idle" && lastUpdatedAt && (
            <span className="text-[10px] text-bm-muted2">
              Updated {formatRelativeTime(lastUpdatedAt)}
            </span>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={manualRecalc}
              disabled={recalcStatus === "recalculating" || scenarioAssets.length === 0 || isLocked}
              className="inline-flex items-center gap-1 rounded border border-bm-border/40 px-2.5 py-1 text-[10px] text-bm-muted2 hover:bg-bm-surface/20 hover:text-bm-text disabled:opacity-40"
            >
              {recalcStatus === "recalculating" ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              Recalculate
            </button>
            {activeScenarioId && !activeScenario.is_base && !isLocked && (
              <button
                onClick={() => handleCloneScenario(activeScenarioId)}
                className="inline-flex items-center gap-1 rounded border border-bm-border/40 px-2 py-1 text-[10px] text-bm-muted2 hover:bg-bm-surface/20 hover:text-bm-text"
              >
                <Copy size={10} />
                Clone
              </button>
            )}
            <button
              onClick={() => setActiveTab("compare")}
              className="inline-flex items-center gap-1 rounded border border-bm-border/40 px-2 py-1 text-[10px] text-bm-muted2 hover:bg-bm-surface/20 hover:text-bm-text"
            >
              <GitCompare size={10} />
              Compare
            </button>
          </div>
        </div>
      )}

      {model.status === "official_base_case" && (
        <div className="rounded border border-green-500/30 bg-green-500/5 px-3 py-2 text-xs text-green-300">
          This model is the Official Base Case and is locked from edits.
        </div>
      )}
      {isArchived && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          This model is archived and read-only.
        </div>
      )}

      <div className="flex gap-4">
        <ScenarioSidebar
          scenarios={scenarios}
          activeScenarioId={activeScenarioId}
          onSelect={setActiveScenarioId}
          onCreate={handleCreateScenario}
          onClone={handleCloneScenario}
          onDelete={handleDeleteScenario}
          readOnly={isLocked}
        />

        <div className="flex-1 space-y-4 min-w-0">
          <ModelTabBar activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === "builder" && activeScenarioId && (
            <ScenarioBuilderTab
              scenarioAssets={scenarioAssets}
              availableAssets={availableAssets}
              overrides={overrides}
              onAddAsset={handleAddAsset}
              onRemoveAsset={handleRemoveAsset}
              onAddAll={handleAddAllAssets}
              onOpenAsset={setDrawerAssetId}
              readOnly={isLocked}
            />
          )}

          {activeTab === "assumptions" && activeScenarioId && (
            <ScenarioOverridesPanel
              scenarioId={activeScenarioId}
              scenarioAssets={scenarioAssets}
              overrides={overrides}
              onOverridesChange={setOverrides}
              onOverrideSaved={triggerRecalc}
              readOnly={isLocked}
            />
          )}

          {activeTab === "results" && activeScenarioId && (
            <ScenarioResultsPanel
              scenarioId={activeScenarioId}
              assetCount={scenarioAssets.length}
              result={recalcResult}
              status={recalcStatus}
              lastUpdatedAt={lastUpdatedAt}
              onManualRecalc={manualRecalc}
              recalcError={recalcError}
            />
          )}

          {activeTab === "compare" && (
            <ScenarioComparePanel
              modelId={modelId}
              scenarios={scenarios}
            />
          )}

          {!activeScenarioId && (
            <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-8 text-center">
              <p className="text-xs text-bm-muted2">No scenarios found. Create a scenario to get started.</p>
              {!isLocked && (
                <button
                  onClick={() => handleCreateScenario("Base Case")}
                  className="mt-3 rounded bg-bm-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-bm-accent/90"
                >
                  Create Base Case
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {activeScenarioId && (
        <AssetModelingDrawer
          open={!!drawerAssetId}
          onClose={() => setDrawerAssetId(null)}
          scenarioId={activeScenarioId}
          asset={drawerAsset}
          overrides={overrides}
          onOverridesChange={setOverrides}
          readOnly={isLocked}
        />
      )}

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-[10px] underline hover:no-underline">dismiss</button>
        </div>
      )}
    </section>
  );
}
