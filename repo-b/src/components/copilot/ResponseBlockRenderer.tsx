"use client";

import React from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import ChatChartBlock from "@/components/winston/blocks/ChatChartBlock";
import ChatTableBlock from "@/components/winston/blocks/ChatTableBlock";
import KpiGroupBlock from "@/components/winston/blocks/KpiGroupBlock";
import CitationsBlock from "@/components/winston/blocks/CitationsBlock";
import ToolActivityBlock from "@/components/winston/blocks/ToolActivityBlock";
import WorkflowResultBlock from "@/components/winston/blocks/WorkflowResultBlock";
import ConfirmationBlock from "@/components/winston/blocks/ConfirmationBlock";
import ErrorBlock from "@/components/winston/blocks/ErrorBlock";
import GroundingBadge from "@/components/winston/blocks/GroundingBadge";

/**
 * Canonical response block renderer.
 *
 * Delegates to the modular block components in winston/blocks/.
 * This file exists as a stable import path — all rendering logic
 * lives in the individual block components.
 */
export default function ResponseBlockRenderer({
  block,
  onConfirmAction,
  onCancelAction,
  onEditAction,
}: {
  block: AssistantResponseBlock;
  onConfirmAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
  onCancelAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
  onEditAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
}) {
  switch (block.type) {
    case "markdown_text":
      return (
        <div className="whitespace-pre-wrap text-[14px] leading-7 text-bm-text">
          {block.markdown}
        </div>
      );

    case "chart":
      return <ChatChartBlock block={block} />;

    case "table":
      return <ChatTableBlock block={block} />;

    case "kpi_group":
      return <KpiGroupBlock block={block} />;

    case "citations":
      return <CitationsBlock block={block} />;

    case "tool_activity":
      return <ToolActivityBlock block={block} />;

    case "workflow_result":
      return <WorkflowResultBlock block={block} />;

    case "confirmation":
      return (
        <ConfirmationBlock
          block={block}
          onConfirm={() => onConfirmAction?.(block)}
          onCancel={() => onCancelAction?.(block)}
          onEdit={() => onEditAction?.(block)}
        />
      );

    case "error":
      return <ErrorBlock block={block} />;

    case "grounding_badge":
      return <GroundingBadge block={block} />;

    case "navigation_suggestion":
      return <NavigationSuggestionBlock block={block} />;

    default:
      return null;
  }
}

function NavigationSuggestionBlock({
  block,
}: {
  block: Extract<AssistantResponseBlock, { type: "navigation_suggestion" }>;
}) {
  const suggestions = block.suggestions || [];
  if (!suggestions.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {suggestions.map((s, idx) => {
        if (s.path) {
          return (
            <a
              key={idx}
              href={s.path}
              className="inline-flex items-center gap-1 rounded-full border border-bm-accent/30 bg-bm-accent/8 px-3 py-1 text-xs text-bm-accent transition hover:bg-bm-accent/15"
            >
              → {s.label}
            </a>
          );
        }
        return (
          <span
            key={idx}
            className="inline-flex items-center rounded-full border border-bm-border/40 bg-bm-surface/12 px-3 py-1 text-xs text-bm-muted"
          >
            {s.label}
          </span>
        );
      })}
    </div>
  );
}
