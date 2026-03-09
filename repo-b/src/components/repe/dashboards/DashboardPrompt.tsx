"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { HintChip } from "@/lib/dashboards/types";
import { generateHints, type HintContext } from "@/lib/dashboards/hint-engine";

/* --------------------------------------------------------------------------
 * Props
 * -------------------------------------------------------------------------- */
interface Props {
  onGenerate: (prompt: string) => void;
  generating: boolean;
  context: HintContext;
}

/* --------------------------------------------------------------------------
 * Chip category colors
 * -------------------------------------------------------------------------- */
const CHIP_COLORS: Record<string, string> = {
  metric: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
  layout: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
  comparison: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
  export: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800",
  filter: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800",
  scope: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/40 dark:text-slate-300 dark:border-slate-700",
};

/* --------------------------------------------------------------------------
 * Component
 * -------------------------------------------------------------------------- */
export default function DashboardPrompt({ onGenerate, generating, context }: Props) {
  const [prompt, setPrompt] = useState("");
  const [hints, setHints] = useState<HintChip[]>([]);

  // Update hints when prompt or context changes
  useEffect(() => {
    const ctx: HintContext = {
      ...context,
      has_prompt: prompt.trim().length > 0,
      prompt_text: prompt,
    };
    setHints(generateHints(ctx));
  }, [prompt, context]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || generating) return;
    onGenerate(prompt.trim());
  }, [prompt, generating, onGenerate]);

  const handleChipClick = useCallback((chip: HintChip) => {
    if (chip.action === "replace") {
      setPrompt(chip.text);
    } else {
      setPrompt((prev) => prev + chip.text);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="space-y-3">
      {/* Prompt input */}
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your dashboard... e.g., 'Build a dashboard for multifamily assets with NOI, occupancy, DSCR, and debt maturity'"
          className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 pr-24 text-sm text-bm-text placeholder-bm-muted2 shadow-[0_8px_24px_-16px_rgba(15,23,42,0.12)] transition-colors focus:border-bm-accent focus:outline-none focus:ring-2 focus:ring-bm-accent/20 dark:border-white/10 dark:bg-[rgba(15,23,42,0.82)] dark:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.8)] resize-none"
          rows={3}
          disabled={generating}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!prompt.trim() || generating}
          className="absolute right-3 bottom-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
        >
          {generating ? (
            <span className="flex items-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Building...
            </span>
          ) : (
            "Generate"
          )}
        </button>
      </div>

      {/* Hint chips */}
      {hints.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {hints.map((chip, i) => (
            <button
              key={`${chip.label}-${i}`}
              type="button"
              onClick={() => handleChipClick(chip)}
              disabled={generating}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:shadow-sm disabled:opacity-40 ${
                CHIP_COLORS[chip.category] || CHIP_COLORS.scope
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
