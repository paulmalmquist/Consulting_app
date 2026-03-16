"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { Play, Copy, GitCompare, Loader2 } from "lucide-react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

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
  runScenarioV2,
} from "@/lib/bos-api";
import type {
  ModelScenario,
  ScenarioAsset,
  AvailableAsset,
  ScenarioOverride,
} from "@/lib/bos-api";

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
  const [runningScenario, setRunningScenario] = useState(false);

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
      if (modelRes.status === "fulfilled") setModel(modelRes.value);
      else setError("Failed to load model");
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

  const handleRunScenario = useCallback(async () => {
    if (!activeScenarioId || scenarioAssets.length === 0) return;
    setRunningScenario(true);
    try {
      await runScenarioV2(activeScenarioId);
      setActiveTab("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario run failed");
    } finally {
      setRunningScenario(false);
    }
  }, [activeScenarioId, scenarioAssets.length]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add asset");
    }
  }, [activeScenarioId]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove asset");
    }
  }, [activeScenarioId, scenarioAssets, drawerAssetId]);

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
  }, [activeScenarioId, availableAssets]);

  const isArchived = model?.status === "archived";
  const modifiedAssetCount = useMemo(() => {
    const assetIds = new Set(overrides.filter((o) => o.scope_type === "asset").map((o) => o.scope_id));
    return assetIds.size;
  }, [overrides]);

  if (loading) return <div className="p-6 text-xs text-bm-muted2">Loading model...</div>;

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
          </div>

          {/* Actions */}
          {!isArchived && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleRunScenario}
                disabled={runningScenario || scenarioAssets.length === 0}
                className="inline-flex items-center gap-1 rounded bg-bm-accent px-2.5 py-1 text-[10px] font-medium text-white hover:bg-bm-accent/90 disabled:opacity-40"
              >
                {runningScenario ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                {runningScenario ? "Running..." : "Run"}
              </button>
              {activeScenarioId && !activeScenario.is_base && (
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
          )}
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
          readOnly={isArchived}
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
              readOnly={isArchived}
            />
          )}

          {activeTab === "assumptions" && activeScenarioId && (
            <ScenarioOverridesPanel
              scenarioId={activeScenarioId}
              scenarioAssets={scenarioAssets}
              overrides={overrides}
              onOverridesChange={setOverrides}
              readOnly={isArchived}
            />
          )}

          {activeTab === "results" && activeScenarioId && (
            <ScenarioResultsPanel
              scenarioId={activeScenarioId}
              assetCount={scenarioAssets.length}
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
              {!isArchived && (
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
          readOnly={isArchived}
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
