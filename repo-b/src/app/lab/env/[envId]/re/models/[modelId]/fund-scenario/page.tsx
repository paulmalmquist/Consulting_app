"use client";

import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { useFundScenario } from "@/components/repe/fund-scenario/useFundScenario";
import { FundScenarioHeader } from "@/components/repe/fund-scenario/FundScenarioHeader";
import { FundScenarioTabBar } from "@/components/repe/fund-scenario/FundScenarioTabBar";
import { ScenarioSidebar } from "@/components/repe/model/ScenarioSidebar";
import { OverviewTab } from "@/components/repe/fund-scenario/OverviewTab";
import { WaterfallTab } from "@/components/repe/fund-scenario/WaterfallTab";
import { AssetDriversTab } from "@/components/repe/fund-scenario/AssetDriversTab";
import { CashFlowsTab } from "@/components/repe/fund-scenario/CashFlowsTab";
import { DebtRefiTab } from "@/components/repe/fund-scenario/DebtRefiTab";
import { ValuationTab } from "@/components/repe/fund-scenario/ValuationTab";
import { JvOwnershipTab } from "@/components/repe/fund-scenario/JvOwnershipTab";
import { CompareTab } from "@/components/repe/fund-scenario/CompareTab";
import { AuditTab } from "@/components/repe/fund-scenario/AuditTab";
import { ExcelSyncTab } from "@/components/repe/fund-scenario/ExcelSyncTab";
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
      window.location.reload();
    },
    [modelId],
  );

  const handleAssetClick = useCallback(
    (assetId: string) => {
      setActiveTab("asset-drivers");
    },
    [],
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-bm-muted" />
        <span className="ml-2 text-sm text-bm-muted">Loading scenario workspace...</span>
      </div>
    );
  }

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
  const scenarioIdForQuery = isBaseScenario ? undefined : activeScenarioId;

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
        onTabChange={setActiveTab}
        resultLoading={resultLoading}
        fundName={scenarioResult?.fund_name ?? null}
        assetCount={assetCount}
        investmentCount={scenarioResult?.summary?.investment_count}
        jvCount={scenarioResult?.summary?.jv_count}
        computedAt={scenarioResult?.summary?.computed_at ?? scenarioResult?.as_of_date}
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
                  onTabChange={setActiveTab}
                />
              )}

              {activeTab === "waterfall" && (
                <WaterfallTab result={scenarioResult} />
              )}

              {activeTab === "asset-drivers" && (
                <AssetDriversTab result={scenarioResult} />
              )}

              {activeTab === "cash-flows" && (
                <CashFlowsTab
                  fundId={fundId}
                  quarter={quarter}
                  scenarioId={scenarioIdForQuery}
                />
              )}

              {activeTab === "debt-refi" && (
                <DebtRefiTab result={scenarioResult} />
              )}

              {activeTab === "valuation" && (
                <ValuationTab result={scenarioResult} />
              )}

              {activeTab === "jv-ownership" && (
                <JvOwnershipTab
                  fundId={fundId}
                  quarter={quarter}
                  scenarioId={scenarioIdForQuery}
                />
              )}

              {activeTab === "compare" && (
                <CompareTab
                  fundId={fundId}
                  quarter={quarter}
                  scenarios={scenarios}
                  baseResult={baseResult}
                />
              )}

              {activeTab === "audit" && (
                <AuditTab result={scenarioResult} />
              )}

              {activeTab === "excel-sync" && (
                <ExcelSyncTab />
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
