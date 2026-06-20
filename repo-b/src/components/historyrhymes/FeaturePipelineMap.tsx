"use client";

import { ArrowRight } from "lucide-react";
import type { PipelineMap } from "@/lib/historyrhymes/featureStore";
import { Panel } from "./mlUi";

/** Bronze → silver → gold → vector → algorithm pipeline ladder. */
export function FeaturePipelineMap({ map }: { map: PipelineMap | null }) {
  if (!map || !map.nodes?.length) {
    return null;
  }
  return (
    <Panel title="Pipeline">
      <div className="flex flex-wrap items-stretch gap-2">
        {map.nodes.map((n, i) => (
          <div key={n.layer} className="flex items-stretch gap-2">
            <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3 min-w-[150px]">
              <div className="text-[10px] uppercase tracking-wide text-sky-300">{n.layer}</div>
              <div className="text-xs text-neutral-100 font-medium">{n.label}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5 font-mono break-all">{n.detail}</div>
            </div>
            {i < map.nodes.length - 1 ? (
              <ArrowRight size={16} className="self-center text-neutral-600 shrink-0" />
            ) : null}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-neutral-600 mt-2">{map.note}</div>
    </Panel>
  );
}
