"use client";

import React from "react";
import type { WidgetConfig } from "@/lib/dashboards/types";
import { DealGeoIntelligencePanel } from "@/components/repe/pipeline/geo/DealGeoIntelligencePanel";
import type { CompareMode } from "@/components/repe/pipeline/geo/types";

interface Props {
  envId: string;
  config: WidgetConfig;
}

export default function GeographicMapWidget({ envId, config }: Props) {
  return (
    <div className="flex flex-col h-full">
      {config.title && (
        <div className="text-sm font-semibold text-slate-200 px-2 pt-1 pb-1">{config.title}</div>
      )}
      <div className="flex-1 min-h-0">
        <DealGeoIntelligencePanel
          envId={envId}
          compareMode={"tract" as CompareMode}
          className="h-full"
        />
      </div>
    </div>
  );
}
