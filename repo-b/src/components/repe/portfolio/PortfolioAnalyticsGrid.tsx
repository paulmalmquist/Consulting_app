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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[5fr_7fr] lg:items-stretch">
      {/* LEFT: Map (~42%) — fills full column height */}
      <div className="flex flex-col">
        <PortfolioAssetMap
          data={assetMapData as any}
          loading={assetMapLoading}
        />
      </div>

      {/* RIGHT: Stacked analytics (~58%) */}
      <div className="flex flex-col gap-3">
        <FundComparisonChart />
        <AllocationAndPerformers />
      </div>
    </div>
  );
}
