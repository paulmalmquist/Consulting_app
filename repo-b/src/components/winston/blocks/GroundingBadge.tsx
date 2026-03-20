"use client";

import React, { useState } from "react";

interface GroundingBadgeProps {
  block: {
    type: "grounding_badge";
    block_id: string;
    score: number;
    label: string;
    label_text: string;
    tool_count: number;
    firm_data_tools: number;
    sources?: Array<{ tool_name: string; is_firm_data: boolean }>;
  };
}

function dotColor(label: string): string {
  if (label === "high") return "bg-green-400";
  if (label === "mixed") return "bg-yellow-400";
  return "bg-red-400";
}

function textColor(label: string): string {
  if (label === "high") return "text-green-400/80";
  if (label === "mixed") return "text-yellow-400/80";
  return "text-red-400/80";
}

export default function GroundingBadge({ block }: GroundingBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${textColor(block.label)} hover:bg-bm-surface/30 transition-colors`}
      >
        <span className={`w-2 h-2 rounded-full ${dotColor(block.label)}`} />
        <span>{block.label_text}</span>
      </button>

      {expanded && block.sources && block.sources.length > 0 && (
        <div className="mt-1 ml-4 text-[11px] text-bm-muted2 space-y-0.5">
          {block.sources.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  s.is_firm_data ? "bg-green-400/60" : "bg-bm-muted2/40"
                }`}
              />
              <span className="font-mono">{s.tool_name}</span>
              <span className="text-bm-muted2/60">
                {s.is_firm_data ? "firm data" : "general"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
