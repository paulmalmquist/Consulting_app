"use client";

import React from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import ChatChartBlock from "./blocks/ChatChartBlock";
import ChatTableBlock from "./blocks/ChatTableBlock";
import KpiGroupBlock from "./blocks/KpiGroupBlock";
import CitationsBlock from "./blocks/CitationsBlock";
import ToolActivityBlock from "./blocks/ToolActivityBlock";
import WorkflowResultBlock from "./blocks/WorkflowResultBlock";
import ConfirmationBlock from "./blocks/ConfirmationBlock";
import ErrorBlock from "./blocks/ErrorBlock";

export default function ResponseBlockRenderer({
  block,
  onConfirm,
  onCancel,
  onRetry,
}: {
  block: AssistantResponseBlock;
  onConfirm?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  switch (block.type) {
    case "markdown_text":
      return (
        <div className="text-[13px] text-bm-text leading-relaxed whitespace-pre-wrap break-words font-sans">
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
      return <ConfirmationBlock block={block} onConfirm={onConfirm} onCancel={onCancel} />;

    case "error":
      return <ErrorBlock block={block} onRetry={onRetry} />;

    default:
      return null;
  }
}
