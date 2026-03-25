"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import type { ConversationSummary } from "@/lib/commandbar/assistantApi";

export default function ConversationHistoryDrawer({
  open,
  conversations,
  activeConversationId,
  onClose,
  onSelectConversation,
}: {
  open: boolean;
  conversations: ConversationSummary[];
  activeConversationId?: string | null;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} aria-hidden />
      <div className="flex h-full w-full max-w-md flex-col border-l border-bm-border/50 bg-bm-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-bm-border/40 px-5 py-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">History</div>
            <h2 className="mt-1 text-lg font-semibold text-bm-text">Saved conversations</h2>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {conversations.length ? conversations.map((conversation) => (
            <button
              key={conversation.conversation_id}
              type="button"
              onClick={() => onSelectConversation(conversation.conversation_id)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                conversation.conversation_id === activeConversationId
                  ? "border-bm-accent/50 bg-bm-accent/10"
                  : "border-bm-border/50 bg-bm-surface/20 hover:border-bm-accent/30"
              }`}
            >
              <div className="text-sm font-medium text-bm-text">{conversation.title || "Untitled conversation"}</div>
              <div className="mt-1 text-xs text-bm-muted2">
                {conversation.message_count} message{conversation.message_count === 1 ? "" : "s"}
              </div>
            </button>
          )) : (
            <div className="rounded-2xl border border-dashed border-bm-border/60 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
              No saved conversations yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
