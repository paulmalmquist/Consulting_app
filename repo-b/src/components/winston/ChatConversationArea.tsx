"use client";

import React, { useCallback, useEffect, useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CommandMessage, StructuredResultAction } from "@/lib/commandbar/store";
import type { AssistantResponseBlock } from "@/lib/commandbar/types";
import StructuredResultCard from "@/components/commandbar/StructuredResultCard";
import ResponseBlockRenderer from "./ResponseBlockRenderer";
import {
  measureTextHeight,
  findShrinkwrapWidth,
  useElementWidth,
  CHAT_FONT,
  CHAT_LINE_HEIGHT,
} from "@/hooks/usePretext";

const STARTER_QUERIES = [
  "What assets have refinance risk in the next 24 months?",
  "Run a waterfall assuming a 10% IRR hurdle",
  "Compare portfolio performance under a +100bps rate scenario",
  "Show LP distributions by vintage year",
  "Stress all assets with 75bps cap rate expansion",
  "Summarize fund performance — IRR, TVPI, DPI",
];

// ---------------------------------------------------------------------------
// Sizing constants for height estimation
// ---------------------------------------------------------------------------

/** Vertical padding inside a message bubble (py-2 = 8px * 2) */
const BUBBLE_PADDING_V = 16;
/** Horizontal padding inside a message bubble (px-3 = 12px * 2) */
const BUBBLE_PADDING_H = 24;
/** Gap between messages (space-y-4 = 16px) */
const MESSAGE_GAP = 16;
/** Chart block fixed height */
const CHART_BLOCK_HEIGHT = 280;
/** Minimum height for a structured result card */
const STRUCTURED_CARD_MIN_HEIGHT = 120;
/** Default height for unknown response block types */
const DEFAULT_BLOCK_HEIGHT = 60;
/** ThinkingIndicator estimated height */
const THINKING_HEIGHT = 48;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

/**
 * Estimate the pixel height of a message for the virtualizer.
 * Uses pretext for text measurement; fixed heights for structured blocks.
 */
function estimateMessageHeight(
  msg: CommandMessage,
  containerWidth: number
): number {
  const isUser = msg.role === "user";
  const hasBlocks = msg.responseBlocks && msg.responseBlocks.length > 0;
  const hasStructured = !!msg.structuredResult;

  // If the message has response blocks, sum their estimated heights
  if (!isUser && (hasBlocks || hasStructured)) {
    let totalHeight = 0;

    if (msg.responseBlocks) {
      for (const block of msg.responseBlocks) {
        switch (block.type) {
          case "chart":
            totalHeight += CHART_BLOCK_HEIGHT + 16;
            break;
          case "table":
            // Estimate based on row count, capped at a reasonable max
            totalHeight += Math.min(400, 40 + ((block as any).data?.length ?? 5) * 32);
            break;
          case "kpi_group":
            totalHeight += 100;
            break;
          case "markdown_text": {
            const mdText = (block as any).content || (block as any).text || "";
            if (mdText && containerWidth > 0) {
              totalHeight +=
                measureTextHeight(mdText, containerWidth, CHAT_FONT, CHAT_LINE_HEIGHT) + 8;
            } else {
              totalHeight += DEFAULT_BLOCK_HEIGHT;
            }
            break;
          }
          default:
            totalHeight += DEFAULT_BLOCK_HEIGHT;
        }
      }
    }

    if (hasStructured) {
      totalHeight += STRUCTURED_CARD_MIN_HEIGHT;
    }

    // Also add any trailing text content
    const displayContent = cleanAssistantContent(msg.content);
    const hasMarkdownBlock = msg.responseBlocks?.some((b) => b.type === "markdown_text");
    if (displayContent && !hasMarkdownBlock && containerWidth > 0) {
      totalHeight +=
        measureTextHeight(displayContent, containerWidth, CHAT_FONT, CHAT_LINE_HEIGHT) +
        BUBBLE_PADDING_V;
    }

    return Math.max(totalHeight, 24) + MESSAGE_GAP;
  }

  // Plain text message (user or simple assistant)
  const text = isUser ? msg.content : cleanAssistantContent(msg.content);
  if (!text.trim() || containerWidth <= 0) return 40 + MESSAGE_GAP;

  const maxBubbleWidth = containerWidth * 0.85;
  const contentWidth = maxBubbleWidth - BUBBLE_PADDING_H;
  const textHeight = measureTextHeight(text, contentWidth, CHAT_FONT, CHAT_LINE_HEIGHT);

  return textHeight + BUBBLE_PADDING_V + MESSAGE_GAP;
}

// ---------------------------------------------------------------------------
// ThinkingIndicator
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// MessageBubble — with pretext shrinkwrap
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onAction,
  containerWidth,
  isStreaming,
}: {
  message: CommandMessage;
  onAction?: (action: StructuredResultAction) => void;
  containerWidth: number;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const hasBlocks = message.responseBlocks && message.responseBlocks.length > 0;
  const hasStructured = !!message.structuredResult;
  const hasText = message.content.trim().length > 0;

  // Compute shrinkwrap width for plain text bubbles
  const shrinkwrapStyle = useMemo(() => {
    // Only shrinkwrap plain-text messages (no blocks), and not during streaming
    if (hasBlocks || hasStructured || isStreaming) return undefined;

    const text = isUser || isSystem ? message.content : cleanAssistantContent(message.content);
    if (!text.trim() || containerWidth <= 0) return undefined;

    const maxBubbleWidth = containerWidth * 0.85;
    const contentMaxWidth = maxBubbleWidth - BUBBLE_PADDING_H;
    if (contentMaxWidth <= 0) return undefined;

    const { tightWidth } = findShrinkwrapWidth(
      text,
      contentMaxWidth,
      CHAT_FONT,
      CHAT_LINE_HEIGHT
    );

    // Only apply if shrinkwrap saves meaningful space
    const optimalWidth = tightWidth + BUBBLE_PADDING_H;
    if (optimalWidth >= maxBubbleWidth - 8) return undefined;

    return { maxWidth: Math.ceil(optimalWidth) };
  }, [message.content, message.role, containerWidth, hasBlocks, hasStructured, isUser, isSystem, isStreaming]);

  // Render response blocks and/or structured result for assistant
  if (!isUser && !isSystem && (hasBlocks || hasStructured)) {
    const displayContent = cleanAssistantContent(message.content);
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
        className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed transition-[max-width] duration-200 ease-out ${
          isUser
            ? "bg-bm-accent/15 text-bm-text"
            : isSystem
              ? "border border-bm-danger/20 bg-bm-danger/5 text-bm-danger"
              : "text-bm-text"
        }`}
        style={shrinkwrapStyle ?? { maxWidth: "85%" }}
      >
        <pre className="whitespace-pre-wrap break-words font-sans">{displayContent}</pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatConversationArea — virtualized with TanStack Virtual + pretext heights
// ---------------------------------------------------------------------------

export default function ChatConversationArea({
  messages,
  thinking,
  thinkingStatus,
  thinkingProgress,
  onAction,
  onExampleClick,
  streamingMessageId,
}: {
  messages: CommandMessage[];
  thinking?: boolean;
  thinkingStatus?: string;
  thinkingProgress?: number;
  onAction?: (action: StructuredResultAction) => void;
  onExampleClick?: (example: string) => void;
  /** ID of the message currently being streamed (skip shrinkwrap for it) */
  streamingMessageId?: string;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Track the content area width for pretext measurement
  const contentWidth = useElementWidth(contentRef);

  // Total item count: messages + optional thinking indicator
  const itemCount = messages.length + (thinking ? 1 : 0);

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: useCallback(
      (index: number) => {
        if (index >= messages.length) return THINKING_HEIGHT;
        const msg = messages[index];
        if (!msg || contentWidth <= 0) return 80; // fallback before measurement
        return estimateMessageHeight(msg, contentWidth);
      },
      [messages, contentWidth]
    ),
    overscan: 8,
    // Measure actual DOM size after render for correction
    measureElement: (el) => {
      if (!el) return 0;
      return el.getBoundingClientRect().height;
    },
  });

  // Auto-scroll to bottom when new messages arrive (unless user scrolled up)
  useEffect(() => {
    if (!userScrolledUp.current && itemCount > 0) {
      virtualizer.scrollToIndex(itemCount - 1, { align: "end", behavior: "smooth" });
    }
  }, [itemCount, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUp.current = !atBottom;
  }, []);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--bm-border)/0.5) transparent",
        }}
      >
        {/* Invisible sizer element to track content width */}
        <div ref={contentRef} className="mx-auto max-w-4xl">
          {messages.length === 0 && !thinking ? (
            // Empty state — starter queries
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
            // Virtualized message list
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((virtualItem) => {
                const isThinking = virtualItem.index >= messages.length;

                if (isThinking) {
                  return (
                    <div
                      key="thinking"
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <ThinkingIndicator
                        status={thinkingStatus}
                        progress={thinkingProgress}
                      />
                    </div>
                  );
                }

                const msg = messages[virtualItem.index];
                if (!msg) return null;

                return (
                  <div
                    key={msg.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingBottom: MESSAGE_GAP,
                    }}
                  >
                    <MessageBubble
                      message={msg}
                      onAction={onAction}
                      containerWidth={contentWidth}
                      isStreaming={msg.id === streamingMessageId}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
