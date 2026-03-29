"use client";

import React, { useCallback, useRef, useMemo } from "react";
import {
  usePretextComposerHeight,
  useElementWidth,
} from "@/hooks/usePretext";

export default function ChatPromptComposer({
  value,
  onChange,
  onSend,
  busy,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  busy: boolean;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Track wrapper width for pretext measurement
  const wrapperWidth = useElementWidth(wrapperRef);

  // Textarea has px-4 (16px * 2 = 32px horizontal padding) + 2px border
  const textareaContentWidth = Math.max(0, wrapperWidth - 34);

  // Compute height via pretext — no DOM reflow
  const computedHeight = usePretextComposerHeight(
    value,
    textareaContentWidth,
    160, // maxHeight
    20   // py-2.5 vertical padding
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!busy && value.trim()) {
        onSend();
      }
    }
  };

  return (
    <div className="border-t border-bm-border/30 bg-bm-bg/80 backdrop-blur-sm px-4 py-3">
      <div className="mx-auto max-w-4xl flex items-end gap-2">
        <div ref={wrapperRef} className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || "Ask Winston or run a command..."}
            disabled={busy}
            rows={1}
            className="w-full resize-none rounded-lg border border-bm-border/40 bg-bm-surface/30 px-4 py-2.5 text-[13px] text-bm-text placeholder:text-bm-muted/60 focus:border-bm-accent/50 focus:outline-none focus:ring-1 focus:ring-bm-accent/30 disabled:opacity-50 transition-colors"
            style={{
              height: computedHeight > 0 ? computedHeight : undefined,
              maxHeight: 160,
            }}
          />
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={busy || !value.trim()}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bm-accent/20 border border-bm-accent/40 text-bm-text hover:bg-bm-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Send (Enter)"
        >
          {busy ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M2 8l6-6m0 0l6 6M8 2v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
