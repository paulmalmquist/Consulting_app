"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { CustomerNodeData } from "./gpuGraphAdapter";

const SEGMENT_COLOR: Record<string, string> = {
  enterprise: "text-violet-300",
  smb: "text-sky-300",
  startup: "text-emerald-300",
};

function CustomerNode({ data }: { data: CustomerNodeData }) {
  const segColor = data.segment ? (SEGMENT_COLOR[data.segment] ?? "text-bm-muted2") : "text-bm-muted2";

  return (
    <div
      onClick={() => data.onSelect(data.customer_id)}
      className="w-[190px] cursor-pointer rounded border border-bm-divider/30 bg-bm-bg-1/80 p-2.5 text-xs transition-all hover:border-bm-divider/60"
    >
      <Handle type="target" position={Position.Left} className="!border-0 !bg-bm-muted2/60" />
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-medium">{data.name}</span>
        {data.segment && (
          <span className={`shrink-0 text-[9px] uppercase tracking-wider ${segColor}`}>
            {data.segment}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex gap-3 text-[10px] text-bm-muted2">
        <span>{data.consumed_gpu_hours.toFixed(0)} hr</span>
        {data.concentration_pct != null && (
          <span>{data.concentration_pct.toFixed(1)}% share</span>
        )}
      </div>
    </div>
  );
}

export default memo(CustomerNode);
