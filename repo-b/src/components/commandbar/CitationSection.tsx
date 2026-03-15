"use client";

import React, { useState } from "react";

interface Citation {
  chunk_id: string;
  source_filename: string;
  section_heading: string | null;
  section_path: string | null;
  chunk_text: string;
  score: number;
}

interface CitationSectionProps {
  citations: Citation[];
}

/**
 * Renders a collapsible "Sources" section below structured results in the
 * command bar conversation. Each citation shows the source filename,
 * section heading, a text snippet, and a relevance score badge.
 * Clicking a citation expands it to show the full chunk text.
 */
export function CitationSection({ citations }: CitationSectionProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (!citations.length) return null;

  const INITIAL_VISIBLE = 3;
  const visible = showAll ? citations : citations.slice(0, INITIAL_VISIBLE);
  const hasMore = citations.length > INITIAL_VISIBLE;

  const toggleExpand = (chunkId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  const truncate = (text: string, maxLen: number): string => {
    if (!text) return "";
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen).trimEnd() + "\u2026";
  };

  const scoreBadge = (score: number) => {
    const pct = Math.round(score * 100);
    let colorClass = "bg-emerald-500/15 text-emerald-400";
    if (pct < 50) colorClass = "bg-amber-500/15 text-amber-400";
    if (pct < 30) colorClass = "bg-red-500/15 text-red-400";
    return (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}
      >
        {pct}%
      </span>
    );
  };

  return (
    <div className="mt-3 animate-winston-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-bm-muted2">
          Sources
        </span>
        <span className="text-[10px] text-bm-muted">
          ({citations.length})
        </span>
        {hasMore && (
          <button
            type="button"
            onClick={() => setShowAll((prev) => !prev)}
            className="ml-auto text-[11px] text-bm-accent hover:underline transition-colors"
          >
            {showAll ? "Show less" : `+${citations.length - INITIAL_VISIBLE} more`}
          </button>
        )}
      </div>

      {/* Citation cards */}
      <div className="space-y-1.5">
        {visible.map((citation) => {
          const isExpanded = expandedIds.has(citation.chunk_id);

          return (
            <button
              key={citation.chunk_id}
              type="button"
              onClick={() => toggleExpand(citation.chunk_id)}
              className="w-full text-left rounded-lg border border-bm-border/20 bg-bm-surface/20 px-3 py-2 transition-all duration-200 hover:border-bm-accent/30 hover:bg-bm-surface/40"
            >
              {/* Top row: filename + score */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {/* Document icon */}
                  <svg
                    className="h-3.5 w-3.5 flex-shrink-0 text-bm-muted"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M4 1h5.586L13 4.414V14a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 1v4h4"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="text-xs font-medium text-bm-text truncate">
                    {citation.source_filename}
                  </span>
                </div>
                {scoreBadge(citation.score)}
              </div>

              {/* Section heading */}
              {citation.section_heading && (
                <div className="mt-0.5 text-[11px] text-bm-muted truncate">
                  {citation.section_path
                    ? `${citation.section_path} > ${citation.section_heading}`
                    : citation.section_heading}
                </div>
              )}

              {/* Snippet / full text */}
              <div
                className={`mt-1 text-[11px] leading-relaxed text-bm-muted2 transition-all duration-200 ${
                  isExpanded ? "whitespace-pre-wrap" : "line-clamp-2"
                }`}
              >
                {isExpanded ? citation.chunk_text : truncate(citation.chunk_text, 200)}
              </div>

              {/* Expand indicator */}
              <div className="mt-1 flex justify-end">
                <svg
                  className={`h-3 w-3 text-bm-muted2 transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
