"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  deleteRepeFund,
  getAssetMapPoints,
  type AssetMapResponse,
  type FundTableRow,
} from "@/lib/bos-api";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";
import { StateCard } from "@/components/ui/StateCard";
import { useToast } from "@/components/ui/Toast";
import {
  RepeIndexScaffold,
  reIndexActionClass,
} from "@/components/repe/RepeIndexScaffold";

// Portfolio components
import {
  PortfolioFilterProvider,
  usePortfolioFilters,
  pickCurrentQuarter,
  formatQuarterLabel,
} from "@/components/repe/portfolio/PortfolioFilterContext";
import { PortfolioCommandBar } from "@/components/repe/portfolio/command/PortfolioCommandBar";
import { DataIntegrityBanner } from "@/components/repe/portfolio/DataIntegrityBanner";
import { PortfolioKpiBar } from "@/components/repe/portfolio/PortfolioKpiBar";
import { PortfolioSignalsStrip } from "@/components/repe/portfolio/PortfolioSignalsStrip";
import { PortfolioAnalyticsGrid } from "@/components/repe/portfolio/PortfolioAnalyticsGrid";
import { PortfolioFilterBar } from "@/components/repe/portfolio/PortfolioFilterBar";
import { PortfolioFundTable } from "@/components/repe/portfolio/PortfolioFundTable";

// ---------------------------------------------------------------------------
// Inner content (must be inside PortfolioFilterProvider)
// ---------------------------------------------------------------------------

function RepeFundsPageContent() {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const {
    businessId,
    environmentId,
    loading,
    contextError,
    initializeWorkspace,
  } = useRepeContext();
  const basePath = useRepeBasePath();
  const { push } = useToast();
  const { filters } = usePortfolioFilters();

  // Asset map data (shared between analytics grid and standalone)
  const [assetMap, setAssetMap] = useState<AssetMapResponse | null>(null);
  const [assetMapLoading, setAssetMapLoading] = useState(true);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<FundTableRow | null>(null);
  const [deletingFundId, setDeletingFundId] = useState<string | null>(null);

  // Fetch asset map
  useEffect(() => {
    if (!businessId && !environmentId) return;
    setAssetMapLoading(true);
    getAssetMapPoints({
      env_id: environmentId || undefined,
      business_id: businessId || undefined,
    })
      .then(setAssetMap)
      .catch(() => setAssetMap(null))
      .finally(() => setAssetMapLoading(false));
  }, [businessId, environmentId]);

  // Publish assistant context
  useEffect(() => {
    publishAssistantPageContext({
      route: environmentId
        ? `/lab/env/${environmentId}/re/funds`
        : basePath + "/funds",
      surface: "fund_portfolio",
      active_module: "re",
      page_entity_type: "environment",
      page_entity_id: environmentId || null,
      page_entity_name: null,
      selected_entities: [],
      visible_data: {
        metrics: {
          quarter: filters.quarter,
          model_id: filters.activeModelId,
        },
        active_filters: {
          strategy: filters.strategy,
          vintage: filters.vintage,
          status: filters.status,
          metric_filters: filters.metricFilters,
        },
        notes: [`Portfolio page as of ${formatQuarterLabel(filters.quarter)}`],
      },
    });
    return () => resetAssistantPageContext();
  }, [basePath, environmentId, filters]);

  const handleDeleteFund = useCallback(
    async () => {
      if (!deleteTarget) return;
      setDeletingFundId(deleteTarget.fund_id);
      try {
        const result = await deleteRepeFund(deleteTarget.fund_id);
        setDeleteTarget(null);
        push({
          title: "Fund deleted",
          description: `Removed ${result.deleted.investments} investments and ${result.deleted.assets} assets.`,
          variant: "success",
        });
        // Table will refetch via its own useEffect
      } catch (err) {
        push({
          title: "Delete failed",
          description:
            err instanceof Error ? err.message : "Failed to delete fund.",
          variant: "danger",
        });
      } finally {
        setDeletingFundId(null);
      }
    },
    [deleteTarget, push]
  );

  // Loading / error states
  if (!businessId) {
    if (loading) return <StateCard state="loading" />;
    return (
      <StateCard
        state="error"
        title="REPE workspace not initialized"
        message={contextError || "Unable to resolve workspace context."}
        onRetry={() => void initializeWorkspace()}
      />
    );
  }

  const subtitle = `As of ${formatQuarterLabel(filters.quarter)}${
    filters.activeModelId ? " · Model overlay active" : ""
  }`;

  return (
    <>
      <div
        className="transition-all duration-500 ease-out"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(10px)",
        }}
      >
        {/* Command bar */}
        <div className="flex items-center justify-center mb-3">
          <PortfolioCommandBar />
        </div>

        {/* Data integrity warnings */}
        <DataIntegrityBanner />

        <RepeIndexScaffold
          title="Fund Portfolio"
          subtitle={subtitle}
          action={
            <Link
              href={`${basePath}/funds/new`}
              className={reIndexActionClass}
              data-testid="btn-new-fund"
            >
              + New Fund
            </Link>
          }
          className="w-full"
        >
          {/* Section A: KPI Bar with Quarter Selector */}
          <PortfolioKpiBar />

          {/* Section B: Signals Strip */}
          <PortfolioSignalsStrip />

          {/* Section C: Analytics Grid (Map + Charts) */}
          <PortfolioAnalyticsGrid
            assetMapData={assetMap}
            assetMapLoading={assetMapLoading}
          />

          {/* Section E: Filter State Bar */}
          <PortfolioFilterBar />

          {/* Section D: Fund Table (Primary Anchor) */}
          <PortfolioFundTable onDeleteFund={setDeleteTarget} />
        </RepeIndexScaffold>
      </div>

      <FundDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        fundName={deleteTarget?.name || ""}
        deleting={
          deleteTarget ? deletingFundId === deleteTarget.fund_id : false
        }
        onConfirm={handleDeleteFund}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page export (wraps content in FilterProvider + Suspense)
// ---------------------------------------------------------------------------

export default function RepeFundsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-bm-border/20 p-4 text-sm text-bm-muted2">
          Loading funds...
        </div>
      }
    >
      <PortfolioFilterProvider>
        <RepeFundsPageContent />
      </PortfolioFilterProvider>
    </Suspense>
  );
}
