"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { useFundScenario } from "@/components/repe/fund-scenario/useFundScenario";
import { FundScenarioHeader } from "@/components/repe/fund-scenario/FundScenarioHeader";
import { FundScenarioTabBar } from "@/components/repe/fund-scenario/FundScenarioTabBar";
import { ScenarioSidebar } from "@/components/repe/model/ScenarioSidebar";
import { OverviewTab } from "@/components/repe/fund-scenario/OverviewTab";
import { apiFetch } from "@/components/repe/model/types";
import { useState, useCallback } from "react";
import type { FundScenarioTab } from "@/components/repe/fund-scenario/types";

export default function FundScenarioWorkspacePage() {
  const params = useParams();
  const modelId = params.modelId as string;
  const { envId } = useReEnv();

  const [activeTab, setActiveTab] = useState<FundScenarioTab>("overview");

  const {
    model,
    fundId,
    scenarios,
    activeScenarioId,
    activeScenario,
    isBaseScenario,
    quarter,
    setQuarter,
    setActiveScenarioId,
    baseResult,
    scenarioResult,
    loading,
    resultLoading,
    error,
    recalculate,
    handleCreateScenario,
    handleCloneScenario,
    handleDeleteScenario,
  } = useFundScenario(modelId, envId);

  const handleStatusChange = useCallback(
    async (status: string) => {
      if (!modelId) return;
      await apiFetch(`/api/re/v2/models/${modelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // Reload to pick up new status
      window.location.reload();
    },
    [modelId],
  );

  const handleAssetClick = useCallback(
    (assetId: string) => {
      // Phase 3: Navigate to asset drill-through page
      // For now, scroll or expand inline
      console.log("Asset drill-through:", assetId);
    },
    [],
  );

  // Loading state
  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-bm-muted" />
        <span className="ml-2 text-sm text-bm-muted">Loading scenario workspace...</span>
      </div>
    );
  }

  // Error state
  if (error || !model) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-400">{error ?? "Model not found"}</p>
          <button
            onClick={() => window.history.back()}
            className="mt-3 rounded-lg border border-bm-border px-4 py-2 text-xs text-bm-muted2 hover:bg-bm-surface/30"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isLocked = model.status === "official_base_case" || model.status === "archived";
  const assetCount = scenarioResult?.assets.length ?? 0;

  return (
    <div className="space-y-6 px-6 py-5">
      {/* Header */}
      <FundScenarioHeader
        model={model}
        scenario={activeScenario}
        quarter={quarter}
        onQuarterChange={setQuarter}
        onStatusChange={handleStatusChange}
        onRecalculate={recalculate}
        resultLoading={resultLoading}
        fundName={scenarioResult?.fund_name ?? null}
        assetCount={assetCount}
      />

      {/* Main layout: Sidebar + Content */}
      <div className="flex gap-5">
        {/* Scenario sidebar */}
        <ScenarioSidebar
          scenarios={scenarios}
          activeScenarioId={activeScenarioId}
          onSelect={setActiveScenarioId}
          onCreate={handleCreateScenario}
          onClone={handleCloneScenario}
          onDelete={handleDeleteScenario}
          readOnly={isLocked}
        />

        {/* Main content area */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Tab bar */}
          <FundScenarioTabBar activeTab={activeTab} onChange={setActiveTab} />

          {/* Tab content */}
          {resultLoading && !scenarioResult ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-bm-muted" />
              <span className="ml-2 text-sm text-bm-muted">Loading scenario data...</span>
            </div>
          ) : scenarioResult ? (
            <>
              {activeTab === "overview" && (
                <OverviewTab
                  result={scenarioResult}
                  baseResult={isBaseScenario ? undefined : baseResult}
                  onAssetClick={handleAssetClick}
                />
              )}

              {activeTab !== "overview" && (
                <div className="flex h-64 items-center justify-center rounded-lg border border-bm-border/30 bg-bm-surface/5">
                  <p className="text-sm text-bm-muted2">
                    {activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace(/-/g, " ")} tab coming soon.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-sm text-bm-muted2">
                No scenario data available. Select a scenario or check that the fund has quarterly data.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
