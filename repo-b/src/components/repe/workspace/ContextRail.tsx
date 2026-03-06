"use client";

/**
 * ContextRail — The Right Intelligence Column
 *
 * The rail is page-aware: each route renders a different set of sections.
 * Structure per section:
 *
 *   RailSection            — wrapper with label + 1px divider top
 *   RailPortfolioSnapshot  — fund-level portfolio metrics
 *   RailAssetHealth        — asset-level operational KPIs
 *   RailModelSummary       — scenario summary + run history
 *   RailRecentRuns         — last N runs with status
 *   RailDocuments          — linked documents (IC memo, OA, model)
 *   RailWinstonPanel       — AI quick-ask (lives at bottom of rail)
 *
 * Usage (on the Funds page):
 *   <ContextRail>
 *     <RailPortfolioSnapshot fundCount={3} avgTvpi="1.61x" aum="$2.0B" activeAssets={33} />
 *     <RailRecentRuns runs={recentRuns} />
 *     <RailWinstonPanel baseUrl={apiBase} businessId={bizId} />
 *   </ContextRail>
 */

import { useState, useRef, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Rail wrapper
// ─────────────────────────────────────────────────────────────────────────────

export function ContextRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col divide-y divide-bm-border/[0.06] h-full",
        className
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper — label + top rule
// ─────────────────────────────────────────────────────────────────────────────

export function RailSection({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4 py-4 space-y-3", className)}>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
        {label}
      </p>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Snapshot (Fund list page)
// ─────────────────────────────────────────────────────────────────────────────

export interface RailPortfolioSnapshotProps {
  fundCount: number;
  avgTvpi: string;
  aum: string;
  activeAssets: number;
  debtAllocationPct?: string;
}

export function RailPortfolioSnapshot({
  fundCount,
  avgTvpi,
  aum,
  activeAssets,
  debtAllocationPct,
}: RailPortfolioSnapshotProps) {
  const metrics = [
    { label: "Funds",        value: fundCount },
    { label: "AUM",          value: aum },
    { label: "Avg TVPI",     value: avgTvpi },
    { label: "Active Assets",value: activeAssets },
    ...(debtAllocationPct
      ? [{ label: "Debt Alloc.", value: debtAllocationPct }]
      : []),
  ];

  return (
    <RailSection label="Portfolio Snapshot">
      <dl className="space-y-2.5">
        {metrics.map(({ label, value }) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-bm-muted2 truncate">{label}</dt>
            <dd className="font-display text-sm font-semibold text-bm-text tabular-nums shrink-0">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </RailSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset Health (Asset detail page)
// ─────────────────────────────────────────────────────────────────────────────

type Trend = "up" | "down" | "flat";

export interface RailHealthMetric {
  label: string;
  value: string;
  trend?: Trend;
  subtext?: string;
  tone?: "positive" | "negative" | "warning" | "neutral";
}

const TREND_ICON: Record<Trend, React.ComponentType<{ size?: number; className?: string }>> = {
  up:   TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const TONE_CLASS: Record<NonNullable<RailHealthMetric["tone"]>, string> = {
  positive: "text-bm-success",
  negative: "text-bm-danger",
  warning:  "text-bm-warning",
  neutral:  "text-bm-muted",
};

export function RailAssetHealth({ metrics }: { metrics: RailHealthMetric[] }) {
  return (
    <RailSection label="Asset Health">
      <dl className="space-y-3">
        {metrics.map(({ label, value, trend, subtext, tone }) => {
          const TrendIcon = trend ? TREND_ICON[trend] : null;
          const toneClass = tone ? TONE_CLASS[tone] : "text-bm-text";

          return (
            <div key={label}>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[11px] text-bm-muted2 truncate">{label}</dt>
                <dd className={cn("flex items-center gap-1 font-display text-sm font-semibold tabular-nums shrink-0", toneClass)}>
                  {TrendIcon && (
                    <TrendIcon size={12} className="opacity-80" aria-hidden="true" />
                  )}
                  {value}
                </dd>
              </div>
              {subtext && (
                <p className="text-[10px] text-bm-muted2 mt-0.5 text-right">{subtext}</p>
              )}
            </div>
          );
        })}
      </dl>
    </RailSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent Runs (Fund / Run Center page)
// ─────────────────────────────────────────────────────────────────────────────

type RunStatus = "complete" | "running" | "failed";

export interface RailRun {
  id: string;
  label: string;
  status: RunStatus;
  /** e.g. "2h ago" or "Mar 4" */
  timestamp: string;
}

const STATUS_ICON: Record<RunStatus, React.ComponentType<{ size?: number; className?: string }>> = {
  complete: CheckCircle2,
  running:  Loader2,
  failed:   AlertTriangle,
};

const STATUS_CLASS: Record<RunStatus, string> = {
  complete: "text-bm-success",
  running:  "text-bm-accent animate-winston-spin",
  failed:   "text-bm-danger",
};

export function RailRecentRuns({ runs }: { runs: RailRun[] }) {
  if (!runs.length) return null;

  return (
    <RailSection label="Recent Runs">
      <ul className="space-y-2.5" role="list">
        {runs.map((run) => {
          const Icon = STATUS_ICON[run.status];
          return (
            <li key={run.id} className="flex items-start gap-2.5">
              <Icon
                size={13}
                className={cn("mt-0.5 shrink-0", STATUS_CLASS[run.status])}
                aria-label={run.status}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-bm-text truncate leading-tight">
                  {run.label}
                </p>
                <p className="text-[10px] text-bm-muted2 mt-0.5">{run.timestamp}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </RailSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents (Asset / Fund page)
// ─────────────────────────────────────────────────────────────────────────────

export interface RailDocument {
  id: string;
  label: string;
  type: "memo" | "model" | "agreement" | "report" | "other";
  href?: string;
}

const DOC_LABEL: Record<RailDocument["type"], string> = {
  memo:      "IC Memo",
  model:     "Model",
  agreement: "Agreement",
  report:    "Report",
  other:     "Doc",
};

export function RailDocuments({ docs }: { docs: RailDocument[] }) {
  if (!docs.length) return null;

  return (
    <RailSection label="Documents">
      <ul className="space-y-2" role="list">
        {docs.map((doc) => (
          <li key={doc.id}>
            {doc.href ? (
              <a
                href={doc.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2.5 text-[12px] text-bm-muted
                           hover:text-bm-text transition-colors duration-fast"
              >
                <FileText size={12} className="shrink-0 text-bm-muted2" aria-hidden="true" />
                <span className="truncate flex-1">{doc.label}</span>
                <span className="font-mono text-[9px] text-bm-muted2 shrink-0">
                  {DOC_LABEL[doc.type]}
                </span>
                <ArrowRight
                  size={10}
                  className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
                  aria-hidden="true"
                />
              </a>
            ) : (
              <div className="flex items-center gap-2.5 text-[12px] text-bm-muted">
                <FileText size={12} className="shrink-0 text-bm-muted2" aria-hidden="true" />
                <span className="truncate flex-1">{doc.label}</span>
                <span className="font-mono text-[9px] text-bm-muted2 shrink-0">
                  {DOC_LABEL[doc.type]}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </RailSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Model Summary (Models page)
// ─────────────────────────────────────────────────────────────────────────────

export interface RailModelSummaryProps {
  scenarioName: string;
  baseIrr: string;
  stressIrr?: string;
  runCount: number;
  lastRun: string;
}

export function RailModelSummary({
  scenarioName,
  baseIrr,
  stressIrr,
  runCount,
  lastRun,
}: RailModelSummaryProps) {
  return (
    <RailSection label="Scenario Summary">
      <p className="text-[12px] font-medium text-bm-text truncate">{scenarioName}</p>
      <dl className="mt-2 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-[11px] text-bm-muted2">Base IRR</dt>
          <dd className="font-display text-sm font-semibold text-bm-success tabular-nums">{baseIrr}</dd>
        </div>
        {stressIrr && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-bm-muted2">Stress IRR</dt>
            <dd className="font-display text-sm font-semibold text-bm-warning tabular-nums">{stressIrr}</dd>
          </div>
        )}
        <div className="flex items-center gap-1.5 pt-1">
          <Clock size={11} className="text-bm-muted2" aria-hidden="true" />
          <span className="text-[10px] text-bm-muted2">
            {runCount} runs · Last {lastRun}
          </span>
        </div>
      </dl>
    </RailSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Observations — static/streamed insight bullets
// ─────────────────────────────────────────────────────────────────────────────

export function RailAiObservations({ observations }: { observations: string[] }) {
  if (!observations.length) return null;

  return (
    <RailSection label="AI Observations">
      <ul className="space-y-2" role="list">
        {observations.map((obs, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-[11.5px] text-bm-muted leading-snug"
          >
            <span className="mt-1 shrink-0 h-1 w-1 rounded-full bg-bm-accent/60" aria-hidden="true" />
            {obs}
          </li>
        ))}
      </ul>
    </RailSection>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Winston AI Panel — embedded quick-ask at the bottom of the rail
// ─────────────────────────────────────────────────────────────────────────────

export interface RailWinstonPanelProps {
  onAsk?: (query: string) => void;
  placeholder?: string;
  /** Suggested prompts shown as clickable chips */
  suggestions?: string[];
}

export function RailWinstonPanel({
  onAsk,
  placeholder = "Ask about portfolio exposure…",
  suggestions,
}: RailWinstonPanelProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    onAsk?.(trimmed);
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(value);
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <section className="px-4 py-4 mt-auto border-t border-bm-border/[0.08]">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <Sparkles size={12} className="text-bm-accent" aria-hidden="true" />
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          Winston AI
        </p>
      </div>

      {/* Suggestion chips */}
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handleSubmit(s)}
              className="px-2 py-0.5 text-[10px] text-bm-muted border border-bm-border/20
                         rounded-sm hover:text-bm-text hover:border-bm-border/40
                         transition-colors duration-fast"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          aria-label="Ask Winston"
          className={cn(
            "w-full resize-none rounded-sm border border-bm-border/20 bg-bm-surface/60",
            "px-3 py-2 pr-9 text-[12px] text-bm-text placeholder:text-bm-muted2",
            "focus:outline-none focus:border-bm-accent/40 focus:bg-bm-surface",
            "transition-colors duration-fast leading-relaxed",
            "scrollbar-hide"
          )}
        />
        <button
          type="button"
          onClick={() => handleSubmit(value)}
          disabled={!value.trim()}
          aria-label="Send to Winston"
          className={cn(
            "absolute right-2 bottom-2 p-1 rounded-sm transition-colors duration-fast",
            value.trim()
              ? "text-bm-accent hover:bg-bm-accent/10"
              : "text-bm-muted2 cursor-not-allowed"
          )}
        >
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>

      <p className="mt-1.5 text-[9px] text-bm-muted2">
        Enter to send · Shift+Enter for new line
      </p>
    </section>
  );
}
