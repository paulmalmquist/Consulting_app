"use client";

import React from "react";
import { useEffect, useRef } from "react";
import type { CommandMessage } from "@/lib/commandbar/store";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import ResponseBlockRenderer from "@/components/copilot/ResponseBlockRenderer";

function hasMarkdownBlock(blocks: AssistantResponseBlock[] | null | undefined) {
  return Boolean(blocks?.some((block) => block.type === "markdown_text"));
}

export default function ConversationViewport({
  messages,
  thinking,
  thinkingStatus,
  onConfirmAction,
}: {
  messages: CommandMessage[];
  thinking: boolean;
  thinkingStatus?: string;
  onConfirmAction?: (block: Extract<AssistantResponseBlock, { type: "confirmation" }>) => void;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking, thinkingStatus]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        {messages.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-bm-border/70 bg-bm-surface/20 p-8 text-center">
            <h2 className="text-xl font-semibold text-bm-text">Winston Copilot Workspace</h2>
            <p className="mt-2 text-sm leading-6 text-bm-muted">
              Ask grounded portfolio questions, render inline analytics, and run governed actions without leaving the workspace.
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          const isUser = message.role === "user";
          const bubbleClasses = isUser
            ? "ml-auto max-w-3xl rounded-3xl bg-bm-accent/15 px-5 py-4"
            : "max-w-5xl space-y-3";
          return (
            <article key={message.id} className={bubbleClasses}>
              <div className={`text-[11px] uppercase tracking-[0.18em] ${isUser ? "text-bm-accent" : "text-bm-muted2"}`}>
                {isUser ? "You" : "Winston"}
              </div>
              {!isUser && message.responseBlocks?.length ? (
                <div className="space-y-3">
                  {message.responseBlocks.map((block) => (
                    <ResponseBlockRenderer
                      key={block.block_id}
                      block={block}
                      onConfirmAction={onConfirmAction}
                    />
                  ))}
                  {message.content && !hasMarkdownBlock(message.responseBlocks) ? (
                    <div className="whitespace-pre-wrap text-[14px] leading-7 text-bm-text">{message.content}</div>
                  ) : null}
                </div>
              ) : (
                <div className="whitespace-pre-wrap text-[14px] leading-7 text-bm-text">{message.content}</div>
              )}
            </article>
          );
        })}

        {thinking ? (
          <div className="max-w-4xl rounded-3xl border border-bm-border/60 bg-bm-surface/20 px-5 py-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-bm-muted2">Winston</div>
            <div className="mt-2 flex items-center gap-3">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-bm-accent animate-pulse" />
              <span className="text-sm text-bm-muted">{thinkingStatus || "Working on it..."}</span>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
