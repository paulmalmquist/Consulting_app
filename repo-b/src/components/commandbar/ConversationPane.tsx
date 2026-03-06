"use client";

import { useEffect, useRef } from "react";
import type { CommandMessage } from "@/lib/commandbar/store";

function ThinkingIndicator({ status }: { status?: string }) {
  return (
    <div className="flex items-start gap-3 animate-winston-fade-in">
      {/* Rotating thinking icon */}
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
      <div className="flex flex-col gap-0.5 pt-0.5">
        <div className="flex items-center gap-1">
          <span className="text-sm text-bm-muted animate-winston-glow">
            {status || "Thinking"}
          </span>
          <span className="inline-flex gap-0.5 ml-0.5">
            <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-1" />
            <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-2" />
            <span className="h-1 w-1 rounded-full bg-bm-accent animate-winston-dot-3" />
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: CommandMessage }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  return (
    <div className={`animate-winston-fade-in ${isUser ? "flex justify-end" : ""}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? "bg-bm-accent/15 text-bm-text"
            : isSystem
              ? "border border-bm-danger/20 bg-bm-danger/5 text-bm-danger"
              : "text-bm-text"
        }`}
      >
        <pre className="whitespace-pre-wrap break-words font-sans">{message.content}</pre>
      </div>
    </div>
  );
}

export default function ConversationPane({
  messages,
  thinking,
  thinkingStatus,
}: {
  contextKey?: string;
  messages: CommandMessage[];
  examples?: string[];
  recentRuns?: unknown[];
  thinking?: boolean;
  thinkingStatus?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 scrollbar-hide">
        {messages.length === 0 && !thinking ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-bm-border/40 bg-bm-surface/40">
              <svg className="h-5 w-5 text-bm-accent" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className="text-sm text-bm-muted">Ask Winston anything about your portfolio.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {thinking && <ThinkingIndicator status={thinkingStatus} />}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  );
}
