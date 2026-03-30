import { useMemo } from "react";
import type { AssetScope } from "@/lib/trading-lab/decision-engine-types";
import {
  filterByScope,
  classifyPositioning,
  classifyNarrative,
  classifyRealitySignal,
  classifyDataSignal,
  classifyMismatch,
} from "@/lib/trading-lab/asset-scope-filters";
import {
  realitySignals,
  dataSignals,
  narrativeState,
  positioningData,
  silenceEvents,
  mismatchData,
  agentData,
  radarDims,
  brierHist,
  trapChecks,
  analogOverlay,
} from "@/components/market/HistoryRhymesTab";

export function useAssetScopedData(scope: AssetScope) {
  return useMemo(() => {
    const filteredReality = filterByScope(realitySignals, scope, classifyRealitySignal);
    const filteredData = filterByScope(dataSignals, scope, classifyDataSignal);
    const filteredNarrative = filterByScope(narrativeState, scope, classifyNarrative);
    const filteredPositioning = filterByScope(positioningData, scope, classifyPositioning);
    const filteredMismatch = filterByScope(mismatchData, scope, classifyMismatch);

    return {
      realitySignals: filteredReality,
      dataSignals: filteredData,
      narrativeState: filteredNarrative,
      positioningData: filteredPositioning,
      mismatchData: filteredMismatch,
      // These remain global (cross-asset aggregations)
      silenceEvents,
      agentData,
      radarDims,
      brierHist,
      trapChecks,
      analogOverlay,
    };
  }, [scope]);
}
