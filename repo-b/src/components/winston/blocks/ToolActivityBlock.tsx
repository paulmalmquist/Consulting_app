"use client";

import React from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type ToolBlock = Extract<AssistantResponseBlock, { type: "tool_activity" }>;

const STATUS_STYLES: Record<string, string> = {
  running: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  completed: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  failed: "text-red-400 border-red-500/30 bg-red-500/10",
};

export default function ToolActivityBlock({ block }: { block: ToolBlock }) {
  const items = block.items || [];
  if (items.length === 0) return null;

  return (
    <div className="my-1.5 space-y-1">
      {items.map((item, idx) => {
        const style = STATUS_STYLES[item.status] || STATUS_STYLES.completed;
        return (
          <div
            key={idx}
            className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px] ${style}`}
          >
            {item.status === "running" && (
              <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            )}
            <span className="font-mono">{item.tool_name}</span>
            {typeof item.duration_ms === "number" && (
              <span className="text-bm-muted/60">{item.duration_ms}ms</span>
            )}
            {item.is_write && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] font-medium text-amber-300">
                WRITE
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
