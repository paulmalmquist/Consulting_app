"use client";

import React, { useCallback, useEffect, useRef } from "react";
import type { CommandMessage, StructuredResultAction } from "@/lib/commandbar/store";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import StructuredResultCard from "@/components/commandbar/StructuredResultCard";
import ResponseBlockRenderer from "./ResponseBlockRenderer";

const STARTER_QUERIES = [
  "What assets have refinance risk in the next 24 months?",
  "Run a waterfall assuming a 10% IRR hurdle",
  "Compare portfolio performance under a +100bps rate scenario",
  "Show LP distributions by vintage year",
  "Stress all assets with 75bps cap rate expansion",
  "Summarize fund performance — IRR, TVPI, DPI",
];

/**
 * Strip raw tool payloads and JSON blobs from the visible answer.
 */
function cleanAssistantContent(raw: string): string {
  let text = raw;
  text = text.replace(/^\s*\{["']tool_name["'][\s\S]*?\}\s*/g, "");
  text = text.replace(/^\s*\{["']resolved_scope["'][\s\S]*?\}\s*/g, "");
  text = text.replace(/^(event:\s*\w+\n?data:\s*\{[^}]*\}\n?)+/gm, "");
  return text.trim();
}

function ThinkingIndicator({ status, progress }: { status?: string; progress?: number }) {
  const showProgress = typeof progress === "number" && progress > 0 && progress < 1;
  const primary = status || "Thinking";

  return (
    <div className="flex items-start gap-3 animate-winston-fade-in">
      <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
        <svg
          className="h-4 w-4 animate-winston-spin text-bm-accent"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex flex-col gap-0.5 pt-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-sm text-bm-muted animate-winston-glow">{primary}</span>
          {!showProgress && (
            <span className="inline-flex gap-0.5 ml-0.5">
              <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-1" />
              <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-2" />
              <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-3" />
            </span>
          )}
        </div>
        {showProgress && (
          <div className="w-full max-w-[200px] h-1 rounded-full bg-bm-border/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-bm-accent transition-all duration-300 ease-out"
              style={{ width: `${Math.round(progress! * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onAction,
}: {
  message: CommandMessage;
  onAction?: (action: StructuredResultAction) => void;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const hasBlocks = message.responseBlocks && message.responseBlocks.length > 0;
  const hasStructured = !!message.structuredResult;
  const hasText = message.content.trim().length > 0;

  // Render response blocks and/or structured result for assistant
  if (!isUser && !isSystem && (hasBlocks || hasStructured)) {
    const displayContent = cleanAssistantContent(message.content);
    // Check if text content overlaps with markdown blocks (avoid duplication)
    const hasMarkdownBlock = message.responseBlocks?.some((b) => b.type === "markdown_text");

    return (
      <div className="animate-winston-fade-in space-y-2">
        {message.responseBlocks?.map((block) => (
          <ResponseBlockRenderer key={block.block_id} block={block} />
        ))}
        {hasStructured && (
          <StructuredResultCard result={message.structuredResult!} onAction={onAction} />
        )}
        {hasText && !hasMarkdownBlock && displayContent && (
          <div className="text-[13px] text-bm-text leading-relaxed whitespace-pre-wrap break-words font-sans">
            {displayContent}
          </div>
        )}
      </div>
    );
  }

  const displayContent = isUser || isSystem ? message.content : cleanAssistantContent(message.content);

  return (
    <div className={`animate-winston-fade-in ${isUser ? "flex justify-end" : ""}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-bm-accent/15 text-bm-text"
            : isSystem
              ? "border border-bm-danger/20 bg-bm-danger/5 text-bm-danger"
              : "text-bm-text"
        }`}
      >
        <pre className="whitespace-pre-wrap break-words font-sans">{displayContent}</pre>
      </div>
    </div>
  );
}

export default function ChatConversationArea({
  messages,
  thinking,
  thinkingStatus,
  thinkingProgress,
  onAction,
  onExampleClick,
}: {
  messages: CommandMessage[];
  thinking?: boolean;
  thinkingStatus?: string;
  thinkingProgress?: number;
  onAction?: (action: StructuredResultAction) => void;
  onExampleClick?: (example: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !atBottom;
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, thinking]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--bm-border)/0.5) transparent" }}
      >
        <div className="mx-auto max-w-4xl">
          {messages.length === 0 && !thinking ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 min-h-[400px]">
              <div className="text-center space-y-2">
                <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-xl border border-bm-border/30 bg-bm-surface/30">
                  <svg className="h-6 w-6 text-bm-accent" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <p className="text-base font-semibold text-bm-text">Winston</p>
                <p className="text-[13px] text-bm-muted">Run an analysis or ask a question</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                {STARTER_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onExampleClick?.(q)}
                    className="text-left rounded-lg border border-bm-border/30 bg-bm-surface/20 px-3 py-2.5 text-[12px] text-bm-muted leading-snug transition-colors hover:border-bm-accent/30 hover:bg-bm-accent/5 hover:text-bm-text"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onAction={onAction} />
              ))}
              {thinking && <ThinkingIndicator status={thinkingStatus} progress={thinkingProgress} />}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
