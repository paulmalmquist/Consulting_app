"use client";

import React from "react";
import { PortfolioAssetMap } from "./PortfolioAssetMap";
import { FundComparisonChart } from "./FundComparisonChart";
import { AllocationAndPerformers } from "./AllocationAndPerformers";
import { usePortfolioFilters } from "./PortfolioFilterContext";

interface PortfolioAnalyticsGridProps {
  assetMapData: unknown;
  assetMapLoading: boolean;
}

export function PortfolioAnalyticsGrid({
  assetMapData,
  assetMapLoading,
}: PortfolioAnalyticsGridProps) {
  const { setMapHighlight } = usePortfolioFilters();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-3">
      {/* LEFT: Map (~42%) */}
      <div>
        <PortfolioAssetMap
          data={assetMapData as any}
          loading={assetMapLoading}
        />
      </div>

      {/* RIGHT: Stacked analytics (60%) */}
      <div className="space-y-3">
        <FundComparisonChart />
        <AllocationAndPerformers />
      </div>
    </div>
  );
}
