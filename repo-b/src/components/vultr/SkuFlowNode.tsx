"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { SkuNodeData } from "./gpuGraphAdapter";

function fmt(v: number | null, prefix = "", decimals = 2): string {
  if (v == null) return "—";
  return `${prefix}${v.toFixed(decimals)}`;
}

function SkuFlowNode({ data }: { data: SkuNodeData }) {
  const marginColor =
    data.gross_margin_per_hour_usd == null
      ? "text-bm-muted2"
      : data.gross_margin_per_hour_usd >= 0
        ? "text-emerald-400"
        : "text-rose-400";

  return (
    <div
      onClick={() => data.onSelect(data.sku_key)}
      className={`w-[210px] cursor-pointer rounded border border-bm-divider/40 bg-bm-bg-1/80 p-3 text-xs transition-all ${
        data.selected ? "ring-1 ring-bm-accent border-bm-accent/60" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!border-0 !bg-bm-muted2/60" />
      <Handle type="source" position={Position.Right} className="!border-0 !bg-bm-muted2/60" />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{data.gpu_model ?? data.sku_key}</span>
      </div>
      <div className="mt-1 flex gap-3 text-[10px] text-bm-muted2">
        <span>{data.utilized_gpu_hours.toFixed(0)} hr</span>
        <span className="font-mono">{fmt(data.realized_price_per_hour_usd, "$")}/hr</span>
      </div>
      <div className={`mt-0.5 text-[10px] font-mono ${marginColor}`}>
        margin: {fmt(data.gross_margin_per_hour_usd, "$")}/hr
      </div>
    </div>
  );
}

export default memo(SkuFlowNode);
