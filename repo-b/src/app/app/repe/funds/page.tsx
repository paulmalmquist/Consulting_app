"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  getAssetMapPoints,
  getFundTableRows,
  getPortfolioAuthoritativeStates,
  type AssetMapResponse,
  type FundTableRow,
  type ReV2AuthoritativeState,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";
import {
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";
import { StateCard } from "@/components/ui/StateCard";
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
import { DataIntegrityBanner, type DataQuality } from "@/components/repe/portfolio/DataIntegrityBanner";
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
  const { filters } = usePortfolioFilters();

  // Asset map data (shared between analytics grid and standalone)
  const [assetMap, setAssetMap] = useState<AssetMapResponse | null>(null);
  const [assetMapLoading, setAssetMapLoading] = useState(true);

  // Fund table + authoritative-state overlay (lifted from PortfolioFundTable)
  const [fundRows, setFundRows] = useState<FundTableRow[]>([]);
  const [authStatesByFundId, setAuthStatesByFundId] = useState<
    Map<string, ReV2AuthoritativeState>
  >(new Map());
  const [fundTableLoading, setFundTableLoading] = useState(true);
  const [fundTableError, setFundTableError] = useState<string | null>(null);

  // Data quality (from integrity banner)
  const [dataQuality, setDataQuality] = useState<DataQuality>("ok");

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

  // Fetch fund table rows + portfolio authoritative states in parallel
  useEffect(() => {
    if (!environmentId) return;
    setFundTableLoading(true);
    setFundTableError(null);
    Promise.all([
      getFundTableRows(environmentId, filters.quarter, filters.activeModelId || undefined),
      getPortfolioAuthoritativeStates(environmentId, filters.quarter),
    ])
      .then(([rows, batched]) => {
        setFundRows(rows);
        const map = new Map<string, ReV2AuthoritativeState>();
        for (const s of batched.states) {
          map.set(s.entity_id, s);
        }
        setAuthStatesByFundId(map);
      })
      .catch((err) => {
        setFundTableError(err instanceof Error ? err.message : "Failed to load fund data");
      })
      .finally(() => setFundTableLoading(false));
  }, [environmentId, filters.quarter, filters.activeModelId]);

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
        {/* Data integrity warnings */}
        <DataIntegrityBanner onDataQualityChange={setDataQuality} />

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

          {/* Section B: Signals Strip (gated on data quality) */}
          <PortfolioSignalsStrip dataQuality={dataQuality} />

          {/* Section C: Analytics Grid (Map + Charts) */}
          <PortfolioAnalyticsGrid
            assetMapData={assetMap}
            assetMapLoading={assetMapLoading}
          />

          {/* Section E: Filter State Bar */}
          <PortfolioFilterBar />

          {/* Section D: Fund Table (Primary Anchor) */}
          <PortfolioFundTable
            rows={fundRows}
            authStatesByFundId={authStatesByFundId}
            loading={fundTableLoading}
            error={fundTableError}
            quarter={filters.quarter}
          />
        </RepeIndexScaffold>
      </div>
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
