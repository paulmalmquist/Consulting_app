"use client";

import React, { useState } from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type ConfirmBlock = Extract<AssistantResponseBlock, { type: "confirmation" }>;

/** Execution result surfaced from the backend done SSE via pending_action_result. */
export type PendingActionResult = {
  status: "executed" | "failed";
  action_type?: string;
  tool_name?: string;
  success: boolean;
  error?: string | null;
};

export default function ConfirmationBlock({
  block,
  onConfirm,
  onCancel,
  onEdit,
  executionResult,
}: {
  block: ConfirmBlock;
  onConfirm?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
  /** Populated asynchronously after backend processes the confirmation. */
  executionResult?: PendingActionResult | null;
}) {
  const [resolved, setResolved] = useState<"pending" | "cancelled" | null>(null);

  // Derive final display state from backend result when available
  const displayState: "idle" | "pending" | "executed" | "failed" | "cancelled" =
    resolved === "cancelled"
      ? "cancelled"
      : resolved === "pending" && executionResult?.status === "executed"
        ? "executed"
        : resolved === "pending" && executionResult?.status === "failed"
          ? "failed"
          : resolved === "pending"
            ? "pending"
            : "idle";

  const badgeText =
    displayState === "executed"
      ? "Executed"
      : displayState === "failed"
        ? "Failed"
        : displayState === "pending"
          ? "Executing\u2026"
          : displayState === "cancelled"
            ? "Cancelled"
            : "Confirmation Required";

  const badgeBorder =
    displayState === "executed"
      ? "border-green-500/40 bg-green-500/10 text-green-300"
      : displayState === "failed"
        ? "border-red-500/40 bg-red-500/10 text-red-300"
        : displayState === "pending"
          ? "border-blue-500/40 bg-blue-500/10 text-blue-300"
          : displayState === "cancelled"
            ? "border-bm-border/40 bg-bm-surface/10 text-bm-muted"
            : "border-amber-500/40 bg-amber-500/10 text-amber-300";

  return (
    <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badgeBorder}`}
        >
          {badgeText}
        </span>
        {displayState === "pending" && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
        )}
      </div>
      <p className="text-sm font-semibold text-bm-text mb-1">{block.action}</p>
      <p className="text-[13px] text-bm-muted mb-3">{block.summary}</p>
      {block.provided_params && Object.keys(block.provided_params).length > 0 && (
        <div className="mb-3 rounded-md border border-bm-border/20 bg-bm-surface/10 p-2.5">
          {Object.entries(block.provided_params).map(([key, val]) => (
            <div key={key} className="flex gap-2 text-[12px]">
              <span className="text-bm-muted font-mono">{key}:</span>
              <span className="text-bm-text">{String(val)}</span>
            </div>
          ))}
        </div>
      )}
      {block.missing_fields && block.missing_fields.length > 0 && (
        <p className="text-[12px] text-amber-300 mb-3">
          Missing: {block.missing_fields.join(", ")}
        </p>
      )}

      {/* ── Resolved states ─────────────────────────────────── */}
      {displayState === "executed" && (
        <p className="text-xs text-green-400 italic">Action executed successfully.</p>
      )}
      {displayState === "failed" && (
        <div>
          <p className="text-xs text-red-400 mb-2">
            Execution failed{executionResult?.error ? `: ${executionResult.error}` : "."}
          </p>
          <button
            type="button"
            onClick={() => {
              setResolved("pending");
              onConfirm?.();
            }}
            className="rounded-md bg-bm-accent/20 border border-bm-accent/40 px-3 py-1.5 text-sm font-medium text-bm-text hover:bg-bm-accent/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
      {displayState === "pending" && (
        <p className="text-xs text-blue-300 italic">Executing action&hellip;</p>
      )}
      {displayState === "cancelled" && (
        <p className="text-xs text-bm-muted2 italic">Action cancelled.</p>
      )}

      {/* ── Action buttons (only when idle) ─────────────────── */}
      {displayState === "idle" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setResolved("pending");
              onConfirm?.();
            }}
            className="rounded-md bg-bm-accent/20 border border-bm-accent/40 px-3 py-1.5 text-sm font-medium text-bm-text hover:bg-bm-accent/30 transition-colors"
          >
            {block.confirm_label || "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => {
              setResolved("cancelled");
              onCancel?.();
            }}
            className="rounded-md border border-bm-border/40 px-3 py-1.5 text-sm text-bm-muted hover:text-bm-text transition-colors"
          >
            Cancel
          </button>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md border border-bm-border/40 px-3 py-1.5 text-sm text-bm-muted hover:text-bm-text transition-colors"
            >
              Edit
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
