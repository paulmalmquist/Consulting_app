"use client";

import React from "react";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";

type ErrBlock = Extract<AssistantResponseBlock, { type: "error" }>;

export default function ErrorBlock({
  block,
  onRetry,
}: {
  block: ErrBlock;
  onRetry?: () => void;
}) {
  return (
    <div className="my-2 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
      {block.title && (
        <p className="text-sm font-semibold text-red-300 mb-1">{block.title}</p>
      )}
      <p className="text-[13px] text-red-200">{block.message}</p>
      {block.recoverable && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md border border-red-500/30 px-3 py-1 text-[12px] text-red-300 hover:bg-red-500/10 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}
