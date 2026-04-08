"use client";

import { useState } from "react";
import {
  fetchWinstonAssist,
  applyAssistAsNextAction,
  type WinstonAssistResult,
} from "@/lib/cro-api";

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  RESEARCH: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Research" },
  OUTREACH: { bg: "bg-purple-500/15", text: "text-purple-400", label: "Outreach" },
  BUILD: { bg: "bg-amber-500/15", text: "text-amber-400", label: "Build" },
  CLOSE: { bg: "bg-emerald-500/15", text: "text-emerald-400", label: "Close" },
};

const ACTION_TYPE_MAP: Record<string, string> = {
  RESEARCH: "research",
  OUTREACH: "email",
  BUILD: "proposal",
  CLOSE: "follow_up",
};

export function WinstonAssistPanel({
  dealId,
  envId,
  businessId,
  stageKey,
  onActionApplied,
}: {
  dealId: string;
  envId: string;
  businessId: string;
  stageKey?: string;
  onActionApplied?: () => void;
}) {
  const [result, setResult] = useState<WinstonAssistResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setApplied(false);
    try {
      const res = await fetchWinstonAssist({
        deal_id: dealId,
        env_id: envId,
        business_id: businessId,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate assist");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.copyable_prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = result.copyable_prompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleApplyAsNextAction() {
    if (!result) return;
    setApplying(true);
    try {
      await applyAssistAsNextAction({
        deal_id: dealId,
        env_id: envId,
        business_id: businessId,
        description: result.next_step,
        action_type: ACTION_TYPE_MAP[result.category] || "task",
      });
      setApplied(true);
      onActionApplied?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply action");
    } finally {
      setApplying(false);
    }
  }

  if (!result && !loading && !error) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <p className="text-xs text-bm-muted2 mb-3">
          Winston analyzes this deal and recommends the highest-leverage next move.
        </p>
        <button
          onClick={handleGenerate}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/80 transition-colors"
        >
          Generate Next Move
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="h-6 w-6 border-2 border-bm-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-bm-muted2 mt-3">Analyzing deal...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-400">
          {error}
        </div>
        <button
          onClick={handleGenerate}
          className="mt-3 rounded-lg border border-bm-border px-3 py-1.5 text-xs text-bm-text hover:bg-bm-surface/30"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!result) return null;

  const catStyle = CATEGORY_STYLES[result.category] || CATEGORY_STYLES.RESEARCH;

  return (
    <div className="space-y-4">
      {/* Category + Confidence */}
      <div className="flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${catStyle.bg} ${catStyle.text}`}>
          {catStyle.label}
        </span>
        <span className="text-[11px] text-bm-muted2">
          {result.confidence}% confidence
        </span>
        <span className="text-[11px] text-bm-muted2 ml-auto">
          Score: {result.deal_score}/100
        </span>
      </div>

      {/* STATE */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
          State
        </h4>
        <ul className="space-y-0.5">
          {result.state.map((s, i) => (
            <li key={i} className="text-xs text-bm-text flex gap-1.5">
              <span className="text-bm-muted2 shrink-0">·</span>
              {s}
            </li>
          ))}
        </ul>
      </div>

      {/* PROBLEM */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
          Problem
        </h4>
        <p className="text-xs text-bm-text">{result.problem}</p>
      </div>

      {/* NEXT STEP */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
          Next Step
        </h4>
        <p className="text-xs text-bm-text font-medium">{result.next_step}</p>
      </div>

      {/* COPYABLE PROMPT */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-bm-muted2 mb-1">
          Prompt
        </h4>
        <div className="rounded-lg bg-bm-surface/40 border border-bm-border/30 p-3">
          <pre className="text-[11px] text-bm-text font-mono whitespace-pre-wrap break-words leading-relaxed">
            {result.copyable_prompt}
          </pre>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={handleCopy}
          className="rounded-lg border border-bm-border px-3 py-1.5 text-xs font-medium text-bm-text hover:bg-bm-surface/30 transition-colors"
        >
          {copied ? "Copied" : "Copy Prompt"}
        </button>
        <button
          onClick={handleApplyAsNextAction}
          disabled={applying || applied}
          className="rounded-lg bg-bm-accent/20 border border-bm-accent/30 px-3 py-1.5 text-xs font-medium text-bm-accent hover:bg-bm-accent/30 transition-colors disabled:opacity-50"
        >
          {applied ? "Applied" : applying ? "Applying..." : "Apply as Next Action"}
        </button>
        <button
          onClick={handleGenerate}
          className="rounded-lg border border-bm-border px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:text-bm-text hover:bg-bm-surface/30 transition-colors"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}
