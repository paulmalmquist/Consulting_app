"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
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

export default function ModelWorkspacePage() {
  const params = useParams();
  const modelId = params.modelId as string;
  const { envId } = useReEnv();

  // Core state
  const [model, setModel] = useState<ReModel | null>(null);
  const [scenarios, setScenarios] = useState<ModelScenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("builder");

  // Scenario-scoped state
  const [scenarioAssets, setScenarioAssets] = useState<ScenarioAsset[]>([]);
  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [overrides, setOverrides] = useState<ScenarioOverride[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Load model + scenarios on mount ──
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
        setError("Failed to load model");
      }
      if (scenariosRes.status === "fulfilled") {
        const sc = scenariosRes.value;
        setScenarios(sc);
        // Auto-select Base scenario
        const base = sc.find((s) => s.is_base) ?? sc[0];
        if (base) setActiveScenarioId(base.id);
      }
      setLoading(false);
    });
  }, [modelId, envId]);

  // ── Load scenario data when active scenario changes ──
  useEffect(() => {
    if (!activeScenarioId || !envId) return;

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

  // ── Handlers: Model status ──
  const handleStatusChange = useCallback(
    async (newStatus: string) => {
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
    },
    [modelId],
  );

  // ── Handlers: Scenario CRUD ──
  const handleCreateScenario = useCallback(
    async (name: string) => {
      try {
        const created = await createModelScenario(modelId, { name });
        setScenarios((prev) => [...prev, created]);
        setActiveScenarioId(created.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create scenario");
      }
    },
    [modelId],
  );

  const handleCloneScenario = useCallback(
    async (scenarioId: string) => {
      const source = scenarios.find((s) => s.id === scenarioId);
      const newName = `${source?.name || "Scenario"} (copy)`;
      try {
        const cloned = await cloneModelScenario(scenarioId, newName);
        setScenarios((prev) => [...prev, cloned]);
        setActiveScenarioId(cloned.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to clone scenario");
      }
    },
    [scenarios],
  );

  const handleDeleteScenario = useCallback(
    async (scenarioId: string) => {
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
    },
    [activeScenarioId, scenarios],
  );

  // ── Handlers: Scenario Assets ──
  const handleAddAsset = useCallback(
    async (asset: AvailableAsset) => {
      if (!activeScenarioId) return;
      try {
        const added = await addScenarioAsset(activeScenarioId, {
          asset_id: asset.asset_id,
          source_fund_id: asset.source_fund_id || undefined,
          source_investment_id: asset.source_investment_id || undefined,
        });
        // Merge in display fields from the available asset
        const enriched: ScenarioAsset = {
          ...added,
          asset_name: added.asset_name || asset.asset_name || "",
          asset_type: added.asset_type || asset.asset_type || undefined,
          fund_name: added.fund_name || asset.fund_name || undefined,
        };
        setScenarioAssets((prev) => [...prev, enriched]);
        setAvailableAssets((prev) =>
          prev.filter((a) => a.asset_id !== asset.asset_id),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add asset");
      }
    },
    [activeScenarioId],
  );

  const handleRemoveAsset = useCallback(
    async (assetId: string) => {
      if (!activeScenarioId) return;
      try {
        await removeScenarioAsset(activeScenarioId, assetId);
        const removed = scenarioAssets.find((sa) => sa.asset_id === assetId);
        setScenarioAssets((prev) => prev.filter((sa) => sa.asset_id !== assetId));
        if (removed) {
          setAvailableAssets((prev) => [
            ...prev,
            {
              asset_id: removed.asset_id,
              asset_name: removed.asset_name,
              asset_type: removed.asset_type,
              source_fund_id: removed.source_fund_id,
              source_investment_id: removed.source_investment_id,
              fund_name: removed.fund_name,
            },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove asset");
      }
    },
    [activeScenarioId, scenarioAssets],
  );

  const handleAddAllAssets = useCallback(async () => {
    if (!activeScenarioId) return;
    for (const asset of availableAssets) {
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
      } catch {
        // Skip duplicates silently
      }
    }
    setAvailableAssets([]);
  }, [activeScenarioId, availableAssets]);

  const isArchived = model?.status === "archived";

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading model...</div>;
  }

  if (!model) {
    return (
      <div className="m-6 space-y-3 rounded-xl border border-bm-border/30 bg-bm-surface/20 p-6">
        <h2 className="text-lg font-semibold text-bm-text">Unable to load model</h2>
        <p className="text-sm text-red-300">{error || "Model not found."}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-5" data-testid="model-workspace">
      <ModelHeader model={model} onStatusChange={handleStatusChange} />

      {isArchived && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          This model is archived and read-only. No changes can be made.
        </div>
      )}

      <div className="flex gap-4">
        {/* Scenario Sidebar */}
        <ScenarioSidebar
          scenarios={scenarios}
          activeScenarioId={activeScenarioId}
          onSelect={setActiveScenarioId}
          onCreate={handleCreateScenario}
          onClone={handleCloneScenario}
          onDelete={handleDeleteScenario}
          readOnly={isArchived}
        />

        {/* Main Content */}
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
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-8 text-center">
              <p className="text-sm text-bm-muted2">
                No scenarios found. Create a scenario to get started.
              </p>
              {!isArchived && (
                <button
                  onClick={() => handleCreateScenario("Base Case")}
                  className="mt-3 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90"
                >
                  Create Base Case
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-xs underline hover:no-underline"
          >
            dismiss
          </button>
        </div>
      )}
    </section>
  );
}
