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
 *
 * Usage (on the Funds page):
 *   <ContextRail>
 *     <RailPortfolioSnapshot fundCount={3} avgTvpi="1.61x" aum="$2.0B" activeAssets={33} />
 *     <RailRecentRuns runs={recentRuns} />
 *   </ContextRail>
 */

import {
  TrendingUp,
  TrendingDown,
  Minus,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
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
      <p className="nv-eyebrow text-bm-muted2">
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
            <dd className="nv-metric text-sm text-bm-text shrink-0">
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
                <dd className={cn("nv-metric flex items-center gap-1 text-sm shrink-0", toneClass)}>
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
// Recent Runs (fund detail and workflow surfaces)
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
          <dd className="nv-metric text-sm text-bm-success">{baseIrr}</dd>
        </div>
        {stressIrr && (
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-[11px] text-bm-muted2">Stress IRR</dt>
            <dd className="nv-metric text-sm text-bm-warning">{stressIrr}</dd>
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
