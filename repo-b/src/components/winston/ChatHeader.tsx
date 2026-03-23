"use client";

import React from "react";

export default function ChatHeader({
  envName,
  businessName,
  conversationCount,
  onNewChat,
}: {
  envName?: string | null;
  businessName?: string | null;
  conversationCount?: number;
  onNewChat: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-bm-border/30 bg-bm-bg/80 backdrop-blur-sm px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-bm-border/30 bg-bm-surface/30">
          <svg className="h-4 w-4 text-bm-accent" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-bm-text">Winston</p>
          <div className="flex items-center gap-1.5 text-[11px] text-bm-muted">
            {businessName && <span>{businessName}</span>}
            {businessName && envName && <span className="text-bm-border">/</span>}
            {envName && <span>{envName}</span>}
            {!businessName && !envName && <span>No workspace selected</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {typeof conversationCount === "number" && conversationCount > 0 && (
          <span className="text-[11px] text-bm-muted">{conversationCount} conversations</span>
        )}
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-md border border-bm-border/40 bg-bm-surface/20 px-3 py-1.5 text-[12px] text-bm-muted hover:text-bm-text hover:border-bm-accent/30 transition-colors"
        >
          New Chat
        </button>
      </div>
    </div>
  );
}
