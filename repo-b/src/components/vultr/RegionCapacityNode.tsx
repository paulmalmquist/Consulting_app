"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { RISK_BORDER, RISK_COLOR } from "./gpuGraphTypes";
import type { RegionNodeData } from "./gpuGraphAdapter";

function RegionCapacityNode({ data }: { data: RegionNodeData }) {
  const utilPct =
    data.utilization_pct != null ? `${data.utilization_pct.toFixed(1)}%` : "—";

  return (
    <div
      onClick={() => data.onSelect(data.region_key)}
      className={`relative w-[230px] cursor-pointer rounded border bg-bm-bg-1/80 p-3 text-xs transition-all ${
        RISK_BORDER[data.capacity_risk]
      } ${data.selected ? "ring-1 ring-bm-accent" : ""}`}
    >
      <Handle type="source" position={Position.Right} className="!border-0 !bg-bm-muted2/60" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{data.region_name}</span>
        <span className={`shrink-0 font-mono text-[10px] uppercase ${RISK_COLOR[data.capacity_risk]}`}>
          {data.capacity_risk}
        </span>
      </div>
      <div className="mt-1 flex gap-3 text-[10px] text-bm-muted2">
        <span>Util: {utilPct}</span>
        <span>{data.utilized_gpu_hours.toFixed(0)} GPU-hr</span>
      </div>
      {data.exhaustion_forecast_days != null && (
        <div className="mt-1 text-[10px] text-orange-300">
          Exhaustion in {data.exhaustion_forecast_days}d
        </div>
      )}
      {data.exceptionCount > 0 && (
        <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
          {data.exceptionCount > 9 ? "9+" : data.exceptionCount}
        </span>
      )}
    </div>
  );
}

export default memo(RegionCapacityNode);
