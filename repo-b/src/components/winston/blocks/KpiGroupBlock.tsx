"use client";

import React from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type KpiBlock = Extract<AssistantResponseBlock, { type: "kpi_group" }>;

export default function KpiGroupBlock({ block }: { block: KpiBlock }) {
  const items = block.items || [];
  if (items.length === 0) return null;

  return (
    <div className="my-2 rounded-lg border border-bm-border/30 bg-bm-surface/20 p-4">
      {block.title && (
        <p className="text-sm font-semibold text-bm-text mb-3">{block.title}</p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item, idx) => {
          const label = String(item.label || "");
          const value = String(item.value ?? "—");
          const delta = item.delta as { value: string; direction: string } | undefined;

          return (
            <div
              key={idx}
              className="rounded-md border border-bm-border/20 bg-bm-surface/10 px-3 py-2.5"
            >
              <p className="text-[11px] text-bm-muted uppercase tracking-wider mb-1">
                {label}
              </p>
              <p className="text-lg font-semibold text-bm-text leading-tight">
                {value}
              </p>
              {delta && (
                <p
                  className={`text-[11px] mt-0.5 ${
                    delta.direction === "positive"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {delta.direction === "positive" ? "\u2191" : "\u2193"} {delta.value}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
