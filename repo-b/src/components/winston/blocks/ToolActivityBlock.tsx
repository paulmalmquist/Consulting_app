"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type ToolBlock = Extract<AssistantResponseBlock, { type: "tool_activity" }>;

const STATUS_ICON: Record<string, React.ReactNode> = {
  running: (
    <span className="inline-block h-3 w-3 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
  ),
  completed: (
    <svg className="h-3.5 w-3.5 text-emerald-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  ),
  failed: (
    <svg className="h-3.5 w-3.5 text-red-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
};

export default function ToolActivityBlock({ block }: { block: ToolBlock }) {
  const items = block.items || [];
  if (items.length === 0) return null;

  const searchParams = useSearchParams();
  const debugMode =
    searchParams.get("debug") === "1" ||
    (typeof window !== "undefined" && localStorage.getItem("winston_debug") === "1");

  // Find the last running item (active step)
  const activeIdx = items.findLastIndex((i) => i.status === "running");

  return (
    <div className="my-1.5 space-y-0.5">
      {items.map((item, idx) => {
        const isActive = idx === activeIdx;
        const isCompleted = item.status === "completed";
        const isFailed = item.status === "failed";
        const displayLabel = item.label ?? item.tool_name;

        return (
          <div
            key={item.label ?? item.tool_name ?? idx}
            className={`flex items-center gap-2 transition-all duration-300 ${
              isActive
                ? "text-sm text-bm-text"
                : isCompleted
                  ? "text-xs text-bm-muted2/60"
                  : isFailed
                    ? "text-xs text-red-400/80"
                    : "text-xs text-bm-muted2/60"
            }`}
          >
            {STATUS_ICON[item.status] || STATUS_ICON.running}
            <span>{isFailed ? (item.summary || displayLabel) : displayLabel}</span>
            {isCompleted && typeof item.duration_ms === "number" && (
              <span className="text-[10px] text-bm-muted2/40">{item.duration_ms}ms</span>
            )}
          </div>
        );
      })}

      {/* Debug panel — collapsed by default, visible with ?debug=1 or localStorage */}
      {debugMode && (
        <details className="mt-2 text-[10px] text-bm-muted2/50">
          <summary className="cursor-pointer hover:text-bm-muted2/80">Debug: raw tool activity</summary>
          <div className="mt-1 space-y-0.5 font-mono pl-2 border-l border-bm-border/30">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <span className={item.status === "failed" ? "text-red-400" : ""}>{item.tool_name}</span>
                <span>{item.status}</span>
                {typeof item.duration_ms === "number" && <span>{item.duration_ms}ms</span>}
                {item.is_write && <span className="text-amber-400">WRITE</span>}
                {item.summary && item.status === "failed" && (
                  <span className="text-red-300">{item.summary}</span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
