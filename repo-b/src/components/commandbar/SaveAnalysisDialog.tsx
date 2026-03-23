"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface SaveAnalysisDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, description: string) => void;
  defaultTitle?: string;
  defaultDescription?: string;
}

/**
 * A modal dialog for saving analysis results from the command bar.
 * Renders a title input, description textarea, and Save/Cancel actions.
 * Styled to match the bm-surface dark theme.
 */
export function SaveAnalysisDialog({
  open,
  onClose,
  onSave,
  defaultTitle = "",
  defaultDescription = "",
}: SaveAnalysisDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Reset fields when dialog opens with new defaults
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setDescription(defaultDescription);
      // Focus the title input after mount transition
      const timer = setTimeout(() => titleRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open, defaultTitle, defaultDescription]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const handleSave = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      titleRef.current?.focus();
      return;
    }
    onSave(trimmedTitle, description.trim());
  }, [title, description, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-winston-fade-in"
    >
      <div
        className="w-full max-w-md rounded-xl border border-bm-border/30 bg-bm-surface shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-bm-border/20 px-5 py-4">
          <h2 className="text-sm font-semibold text-bm-text">Save Analysis</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-bm-muted hover:bg-bm-border/20 hover:text-bm-text transition-colors"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Title input */}
          <div>
            <label
              htmlFor="save-analysis-title"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-bm-muted2"
            >
              Title
            </label>
            <input
              ref={titleRef}
              id="save-analysis-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Q1 2026 Portfolio Review"
              className="w-full rounded-lg border border-bm-border/30 bg-bm-bg/50 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2/50 outline-none transition-colors focus:border-bm-accent/50 focus:ring-1 focus:ring-bm-accent/20"
            />
          </div>

          {/* Description textarea */}
          <div>
            <label
              htmlFor="save-analysis-description"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-bm-muted2"
            >
              Description
              <span className="ml-1 font-normal normal-case tracking-normal text-bm-muted2/60">
                (optional)
              </span>
            </label>
            <textarea
              id="save-analysis-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes about this analysis..."
              rows={3}
              className="w-full resize-none rounded-lg border border-bm-border/30 bg-bm-bg/50 px-3 py-2 text-sm text-bm-text placeholder:text-bm-muted2/50 outline-none transition-colors focus:border-bm-accent/50 focus:ring-1 focus:ring-bm-accent/20"
              style={{ scrollbarWidth: "thin", scrollbarColor: "hsl(var(--bm-border)/0.5) transparent" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-bm-border/20 px-5 py-3">
          <span className="text-[10px] text-bm-muted2">
            Cmd+Enter to save
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-bm-border/30 bg-transparent px-4 py-1.5 text-xs font-medium text-bm-muted transition-colors hover:bg-bm-border/10 hover:text-bm-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!title.trim()}
              className="rounded-lg bg-bm-accent px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-bm-accent/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
