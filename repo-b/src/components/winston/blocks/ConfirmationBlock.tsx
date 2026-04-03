"use client";

import React, { useState } from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type ConfirmBlock = Extract<AssistantResponseBlock, { type: "confirmation" }>;

export default function ConfirmationBlock({
  block,
  onConfirm,
  onCancel,
  onEdit,
}: {
  block: ConfirmBlock;
  onConfirm?: () => void;
  onCancel?: () => void;
  onEdit?: () => void;
}) {
  const [resolved, setResolved] = useState<"confirmed" | "cancelled" | null>(null);

  return (
    <div className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
          {resolved === "confirmed" ? "Confirmed" : resolved === "cancelled" ? "Cancelled" : "Confirmation Required"}
        </span>
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
      {resolved ? (
        <p className="text-xs text-bm-muted2 italic">
          {resolved === "confirmed" ? "Action confirmed — executing..." : "Action cancelled."}
        </p>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setResolved("confirmed");
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
