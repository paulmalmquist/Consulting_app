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
}: {
  block: AssistantResponseBlock;
  onConfirmAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
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
        />
      );

    case "error":
      return <ErrorBlock block={block} />;

    case "grounding_badge":
      return <GroundingBadge block={block} />;

    default:
      return null;
  }
}
