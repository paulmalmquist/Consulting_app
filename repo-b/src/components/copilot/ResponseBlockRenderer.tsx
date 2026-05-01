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
import type { PendingActionResult } from "@/components/winston/blocks/ConfirmationBlock";
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
  executionResult,
}: {
  block: AssistantResponseBlock;
  onConfirmAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
  onCancelAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
  onEditAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
  /** Backend execution result for pending action confirmations. */
  executionResult?: PendingActionResult | null;
}) {
  switch (block.type) {
    case "markdown_text":
      return (
        <div className="nv-body max-w-none whitespace-pre-wrap text-bm-text">
          {block.markdown}
        </div>
      );

    case "chart":
      return <ChatChartBlock block={block} />;

    case "table":
      return <ChatTableBlock block={block} />;

    case "comparison_result":
      return <ComparisonResultBlock block={block} />;

    case "unavailable_with_reason":
      return <UnavailableWithReasonBlock block={block} />;

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
          executionResult={executionResult}
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

function formatReasonLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "unclassified";
  return String(value);
}

function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unavailable";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "Unavailable";
    if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    if (Math.abs(value) < 1 && value !== 0) return `${(value * 100).toFixed(1)}%`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

function ComparisonResultBlock({
  block,
}: {
  block: Extract<AssistantResponseBlock, { type: "comparison_result" }>;
}) {
  const included = block.included || [];
  const excluded = block.excluded || [];
  const coverage = block.coverage || {};
  const total = coverage.total ?? included.length + excluded.length;
  const includedCount = coverage.included ?? included.length;
  const excludedCount = coverage.excluded ?? excluded.length;
  const reasonEntries = Object.entries(coverage.by_reason || {});

  return (
    <div
      data-testid="winston-comparison-result"
      className="my-2 rounded-lg border border-bm-border/35 bg-bm-surface/20 p-4"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="nv-h3 text-bm-text">{block.title || "Comparison result"}</p>
          <p className="nv-small mt-1 text-bm-muted2">
            {block.metric_key ? `${String(block.metric_key).toUpperCase()} ` : ""}
            {block.comparison_window_policy || "min_to_max_released_no_gaps"}
          </p>
        </div>
        {block.data_snapshot_hash ? (
          <span className="nv-metric rounded-md border border-bm-border/40 bg-bm-surface/20 px-2 py-1 text-[11px] text-bm-muted2">
            {block.data_snapshot_hash.slice(0, 12)}
          </span>
        ) : null}
      </div>

      <p
        data-testid="comparison-coverage"
        className="nv-body max-w-none text-bm-text"
      >
        Funds total: {total} · Included: {includedCount} · Excluded: {excludedCount}
      </p>

      {reasonEntries.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {reasonEntries.map(([reason, count]) => (
            <span
              key={reason}
              className="nv-small rounded-md border border-bm-border/30 bg-bm-surface/12 px-2 py-1 text-bm-muted2"
            >
              {count} fund{count === 1 ? "" : "s"}: {reason}
            </span>
          ))}
        </div>
      ) : null}

      {included.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full nv-table-cell">
            <thead>
              <tr className="border-b border-bm-border/25">
                <th className="nv-table-header px-3 py-2 text-left">Fund</th>
                <th className="nv-table-header px-3 py-2 text-right">Start</th>
                <th className="nv-table-header px-3 py-2 text-right">End</th>
                <th className="nv-table-header px-3 py-2 text-right">Change</th>
                <th className="nv-table-header px-3 py-2 text-right">% Change</th>
              </tr>
            </thead>
            <tbody>
              {included.map((row, idx) => (
                <tr key={idx} className="border-b border-bm-border/10">
                  <td className="nv-table-cell px-3 py-2 text-bm-text">
                    {String(row.fund_name || row.name || row.fund_id || "Fund")}
                  </td>
                  <td className="nv-metric px-3 py-2 text-right text-bm-text">
                    {formatDisplayValue(row.start_value)}
                  </td>
                  <td className="nv-metric px-3 py-2 text-right text-bm-text">
                    {formatDisplayValue(row.end_value)}
                  </td>
                  <td className="nv-metric px-3 py-2 text-right text-bm-text">
                    {formatDisplayValue(row.absolute_change ?? row.change)}
                  </td>
                  <td className="nv-metric px-3 py-2 text-right text-bm-text">
                    {formatDisplayValue(row.pct_change)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {excluded.length > 0 ? (
        <div data-testid="excluded-from-ranking" className="mt-4">
          <p className="nv-h3 text-bm-text">Excluded from ranking</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full nv-table-cell">
              <thead>
                <tr className="border-b border-bm-border/25">
                  <th className="nv-table-header px-3 py-2 text-left">Entity</th>
                  <th className="nv-table-header px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {excluded.map((row, idx) => (
                  <tr key={idx} className="border-b border-bm-border/10">
                    <td className="nv-table-cell px-3 py-2 text-bm-text">
                      {String(row.fund_name || row.name || row.fund_id || "Fund")}
                    </td>
                    <td className="nv-metric px-3 py-2 text-bm-muted2">
                      {formatReasonLabel(row.reason || row.exclusion_reason)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const unavailableReasonCopy: Record<string, string> = {
  no_released_snapshot: "No released authoritative snapshot exists for this entity and period.",
  draft_only_snapshot: "Only draft data exists; released data is required.",
  null_metric: "The released snapshot carries a null metric value.",
  missing_source_rows: "Required source rows are missing.",
  legacy_only_data: "Only legacy source data exists, and legacy reads are blocked.",
  entity_quarantined: "The entity is quarantined and excluded from analysis.",
  scope_violation: "The requested entity is outside the active environment scope.",
  period_not_closed: "The period is not closed for authoritative reporting.",
  mapping_missing: "A required canonical mapping is missing.",
  unsupported_metric: "The metric is outside the registered capability contract.",
  out_of_scope_requires_waterfall: "This requires the waterfall engine and cannot be approximated.",
  unclassified_unavailable: "The engine could not classify the unavailable state.",
};

function UnavailableWithReasonBlock({
  block,
}: {
  block: Extract<AssistantResponseBlock, { type: "unavailable_with_reason" }>;
}) {
  const reason = block.reason_code || "unclassified_unavailable";
  const explanation = block.explanation || unavailableReasonCopy[reason] || unavailableReasonCopy.unclassified_unavailable;

  return (
    <div
      data-testid="winston-unavailable-reason"
      className="my-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4"
    >
      <p className="nv-h3 text-bm-text">{block.title || "Unavailable"}</p>
      <p className="nv-body mt-2 max-w-none text-bm-muted">{explanation}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="nv-metric rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
          {reason}
        </span>
        {block.metric_key ? (
          <span className="nv-metric rounded-md border border-bm-border/30 bg-bm-surface/12 px-2 py-1 text-xs text-bm-muted2">
            {block.metric_key}
          </span>
        ) : null}
        {block.data_snapshot_hash ? (
          <span className="nv-metric rounded-md border border-bm-border/30 bg-bm-surface/12 px-2 py-1 text-xs text-bm-muted2">
            {block.data_snapshot_hash.slice(0, 12)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
