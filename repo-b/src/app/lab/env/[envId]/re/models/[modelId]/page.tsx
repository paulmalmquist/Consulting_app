"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";

import type { ReModel, ReModelScope, ReModelOverride, Asset } from "@/components/repe/model/types";
import { apiFetch } from "@/components/repe/model/types";
import { ModelHeader } from "@/components/repe/model/ModelHeader";
import { ModelTabBar, type TabKey } from "@/components/repe/model/ModelTabBar";
import { ModelOverviewTab } from "@/components/repe/model/ModelOverviewTab";
import { AssetsTab } from "@/components/repe/model/AssetsTab";
import { AssetSurgeryDrawer } from "@/components/repe/model/AssetSurgeryDrawer";
import { FundImpactTab } from "@/components/repe/model/FundImpactTab";
import { MonteCarloTab } from "@/components/repe/model/MonteCarloTab";

export default function ModelWorkspacePage() {
  const params = useParams();
  const modelId = params.modelId as string;
  const { envId } = useReEnv();

  const [model, setModel] = useState<ReModel | null>(null);
  const [scope, setScope] = useState<ReModelScope[]>([]);
  const [overrides, setOverrides] = useState<ReModelOverride[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [surgeryAssetId, setSurgeryAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mcRunning, setMcRunning] = useState(false);

  useEffect(() => {
    if (!modelId || !envId) return;
    setLoading(true);
    Promise.allSettled([
      apiFetch<ReModel>(`/api/re/v2/models/${modelId}`),
      apiFetch<ReModelScope[]>(`/api/re/v2/models/${modelId}/scope`).catch(() => []),
      apiFetch<ReModelOverride[]>(`/api/re/v2/models/${modelId}/overrides`).catch(() => []),
      fetch(`/api/re/v2/assets?env_id=${envId}&limit=500`).then((r) => r.json()).catch(() => []),
    ]).then(([modelRes, scopeRes, overridesRes, assetsRes]) => {
      if (modelRes.status === "fulfilled") setModel(modelRes.value);
      else setError("Failed to load model");
      if (scopeRes.status === "fulfilled") setScope(scopeRes.value as ReModelScope[]);
      if (overridesRes.status === "fulfilled") setOverrides(overridesRes.value as ReModelOverride[]);
      if (assetsRes.status === "fulfilled") setAssets(Array.isArray(assetsRes.value) ? assetsRes.value : []);
      setLoading(false);
    });
  }, [modelId, envId]);

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

  const handleRunModel = useCallback(async () => {
    if (scope.length === 0) {
      setError("Cannot run model: Add at least one asset to scope before running. Use the Assets tab to add assets.");
      return;
    }
    try {
      setError(null);
      const res = await fetch(`/api/re/v2/models/${modelId}/run`, { method: "POST" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(error || "Failed to run model");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run model");
    }
  }, [modelId, scope]);

  const handleRunMonteCarlo = useCallback(async () => {
    if (scope.length === 0) {
      setError("Cannot run Monte Carlo: Add at least one asset to scope first.");
      return;
    }
    setMcRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/re/v2/models/${modelId}/monte-carlo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulations: 1000, seed: 42 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(data.error || "Monte Carlo simulation failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Monte Carlo simulation failed");
    } finally {
      setMcRunning(false);
    }
  }, [modelId, scope]);

  const handleTabChange = useCallback((tab: TabKey) => {
    setError(null);
    setActiveTab(tab);
  }, []);

  const handleOpenSurgery = useCallback((assetId: string) => {
    setSurgeryAssetId(assetId);
    setActiveTab("surgery");
  }, []);

  const surgeryAsset = surgeryAssetId ? assets.find((a) => a.asset_id === surgeryAssetId) ?? null : null;

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading model...</div>;
  }

  if (!model) {
    return <div className="p-6 text-sm text-red-300">Model not found.</div>;
  }

  return (
    <section className="space-y-5" data-testid="model-workspace">
      <ModelHeader model={model} onStatusChange={handleStatusChange} />

      <ModelTabBar activeTab={activeTab} onChange={handleTabChange} />

      {activeTab === "overview" && (
        <ModelOverviewTab
          model={model}
          scope={scope}
          overrides={overrides}
          onRunModel={handleRunModel}
          onRunMonteCarlo={handleRunMonteCarlo}
          mcRunning={mcRunning}
        />
      )}

      {activeTab === "assets" && (
        <AssetsTab
          modelId={modelId}
          scope={scope}
          assets={assets}
          onScopeChange={setScope}
          onOpenSurgery={handleOpenSurgery}
        />
      )}

      {activeTab === "surgery" && !surgeryAssetId && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-6 text-center">
          <p className="text-sm text-bm-muted2">
            Select an asset from the Assets tab and click &ldquo;Surgery&rdquo; to open the asset surgery workspace.
          </p>
        </div>
      )}

      {activeTab === "fund-impact" && (
        <FundImpactTab
          modelId={modelId}
          scopeCount={scope.length}
          onRunModel={handleRunModel}
        />
      )}

      {activeTab === "monte-carlo" && (
        <MonteCarloTab
          modelId={modelId}
          scopeCount={scope.length}
          onError={setError}
        />
      )}

      {/* Surgery Drawer (overlays all tabs) */}
      <AssetSurgeryDrawer
        open={!!surgeryAssetId}
        onClose={() => setSurgeryAssetId(null)}
        modelId={modelId}
        asset={surgeryAsset}
        overrides={overrides}
        onOverrideChange={setOverrides}
      />

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </section>
  );
}
