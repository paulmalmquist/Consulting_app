"use client";

import React, { useState } from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type CitBlock = Extract<AssistantResponseBlock, { type: "citations" }>;

export default function CitationsBlock({ block }: { block: CitBlock }) {
  const [expanded, setExpanded] = useState(false);
  const items = block.items || [];
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, 3);

  return (
    <div className="my-2">
      <div className="flex items-center gap-2 mb-1.5">
        <p className="text-[11px] text-bm-muted uppercase tracking-wider font-medium">Sources</p>
        {items.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-[11px] text-bm-accent hover:underline"
          >
            {expanded ? "Show less" : `+${items.length - 3} more`}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((item, idx) => (
          <div
            key={idx}
            className="inline-flex items-center gap-1.5 rounded-md border border-bm-border/30 bg-bm-surface/20 px-2.5 py-1.5 text-[11px] text-bm-muted hover:border-bm-accent/30 hover:text-bm-text transition-colors"
            title={item.snippet || undefined}
          >
            <span className="font-medium">
              {item.section_heading || item.label || `Source ${idx + 1}`}
            </span>
            {typeof item.score === "number" && (
              <span className="text-bm-muted/60">{Math.round(item.score * 100)}%</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
