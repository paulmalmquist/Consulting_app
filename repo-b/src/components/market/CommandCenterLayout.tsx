"use client";

import React from "react";
import type { AssetScope } from "@/lib/trading-lab/decision-engine-types";
import { useAssetScopedData } from "@/components/market/hooks/useAssetScopedData";
import { SignalStack } from "@/components/market/HistoryRhymesTab";
import {
  DecisionNarrativeCard,
  ModelTransparencyPanel,
  TrapDetectionPanel,
  WhatChangedPanel,
  TopAnalogCard,
} from "@/components/market/panels";

interface CommandCenterLayoutProps {
  assetScope: AssetScope;
}

export function CommandCenterLayout({ assetScope }: CommandCenterLayoutProps) {
  const data = useAssetScopedData(assetScope);

  return (
    <div className="space-y-4" data-testid="command-center">
      {/* TOP: Decision Narrative (full width) */}
      <DecisionNarrativeCard
        agentData={data.agentData}
        narrativeState={data.narrativeState}
        realitySignals={data.realitySignals}
        mismatchData={data.mismatchData}
        silenceEvents={data.silenceEvents}
        assetScope={assetScope}
      />

      {/* ROW 2: Left (60%) + Right (40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <TopAnalogCard
            analogOverlay={data.analogOverlay}
            radarDims={data.radarDims}
          />
          <WhatChangedPanel
            realitySignals={data.realitySignals}
            dataSignals={data.dataSignals}
          />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <TrapDetectionPanel
            trapChecks={data.trapChecks}
            positioningData={data.positioningData}
          />
          <ModelTransparencyPanel
            agentData={data.agentData}
            brierHist={data.brierHist}
          />
        </div>
      </div>

      {/* BOTTOM: Signal layers (collapsed) */}
      <SignalStack />
    </div>
  );
}
