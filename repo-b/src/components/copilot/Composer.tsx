"use client";

import React from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { CopilotAttachment } from "@/components/copilot/types";

export default function Composer({
  prompt,
  onPromptChange,
  onSend,
  onFileSelected,
  onRemoveAttachment,
  attachments,
  suggestions,
  disabled,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onFileSelected: (file: File) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  attachments: CopilotAttachment[];
  suggestions: string[];
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="border-t border-bm-border/50 bg-bm-surface/20 px-6 py-4">
      {attachments.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-2 rounded-full border border-bm-border/50 bg-bm-bg/50 px-3 py-1.5 text-xs text-bm-text">
              <span>{attachment.name}</span>
              <span className="text-bm-muted2">{attachment.status}</span>
              <button type="button" onClick={() => onRemoveAttachment(attachment.id)} className="text-bm-muted2 hover:text-bm-text">
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-3 rounded-3xl border border-bm-border/60 bg-bm-bg/60 p-3">
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={3}
          placeholder="Ask Winston to analyze, retrieve, or act..."
          className="min-h-[96px] flex-1 resize-none border-0 bg-transparent text-sm leading-6 text-bm-text outline-none placeholder:text-bm-muted2"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex flex-col items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelected(file);
              event.currentTarget.value = "";
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            Attach file
          </Button>
          <Button type="button" size="sm" onClick={onSend} disabled={disabled || !prompt.trim()}>
            Send
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPromptChange(suggestion)}
            className="rounded-full border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted transition hover:border-bm-accent/40 hover:text-bm-text"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
