"use client";

import React from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type WorkflowBlock = Extract<AssistantResponseBlock, { type: "workflow_result" }>;

const STATUS_COLORS: Record<string, string> = {
  completed: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  running: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  failed: "text-red-400 bg-red-500/10 border-red-500/30",
  pending: "text-bm-muted bg-bm-surface/10 border-bm-border/30",
};

export default function WorkflowResultBlock({ block }: { block: WorkflowBlock }) {
  const statusStyle = STATUS_COLORS[block.status] || STATUS_COLORS.completed;

  return (
    <div className="my-2 rounded-lg border border-bm-border/30 bg-bm-surface/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-semibold text-bm-text">{block.title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${statusStyle}`}>
          {block.status}
        </span>
      </div>
      <p className="text-[13px] text-bm-muted">{block.summary}</p>
      {block.metrics && block.metrics.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {block.metrics.map((metric, idx) => (
            <div key={idx} className="text-center">
              <p className="text-[11px] text-bm-muted">{String(metric.label || "")}</p>
              <p className="text-sm font-semibold text-bm-text">{String(metric.value ?? "—")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
