"use client";

import React from "react";
import { Button } from "@/components/ui/Button";

export default function WinstonTopBar({
  environmentName,
  mode,
  onModeChange,
  onNewChat,
  onSaveConversation,
  onClearContext,
  onExportConversation,
  onOpenHistory,
}: {
  environmentName?: string | null;
  mode: "ask" | "analyze" | "act";
  onModeChange: (mode: "ask" | "analyze" | "act") => void;
  onNewChat: () => void;
  onSaveConversation: () => void;
  onClearContext: () => void;
  onExportConversation: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <div className="border-b border-bm-border/50 bg-bm-surface/20 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Winston Copilot</div>
          <h1 className="mt-1 text-2xl font-semibold text-bm-text">{environmentName || "Analytical workspace"}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-bm-border/50 bg-bm-bg/50 p-1">
            {(["ask", "analyze", "act"] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onModeChange(item)}
                className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.16em] transition ${
                  mode === item ? "bg-bm-accent text-bm-accentContrast" : "text-bm-muted2 hover:text-bm-text"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onOpenHistory}>History</Button>
          <Button type="button" variant="secondary" size="sm" onClick={onNewChat}>New chat</Button>
          <Button type="button" variant="secondary" size="sm" onClick={onSaveConversation}>Save conversation</Button>
          <Button type="button" variant="secondary" size="sm" onClick={onClearContext}>Clear context</Button>
          <Button type="button" size="sm" onClick={onExportConversation}>Export</Button>
        </div>
      </div>
    </div>
  );
}
