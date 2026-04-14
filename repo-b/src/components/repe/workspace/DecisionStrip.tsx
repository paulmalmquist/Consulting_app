"use client";

import type { DecisionStripData, DecisionSeverity } from "./buildDecisionStrip";

type Variant = "fund" | "portfolio";

interface Props {
  data: DecisionStripData;
  variant?: Variant;
  snapshotVersion?: string | null;
}

const SEVERITY_DOT: Record<DecisionSeverity, string> = {
  high: "bg-bm-danger",
  medium: "bg-bm-warning",
  low: "bg-bm-borderStrong",
};

export default function DecisionStrip({ data, variant = "fund", snapshotVersion }: Props) {
  const isCompact = variant === "portfolio";
  const issuesToShow = data.issues.slice(0, isCompact ? 2 : 3);
  const driversToShow = data.drivers.slice(0, isCompact ? 2 : 3);

  return (
    <section
      data-testid="decision-strip"
      data-variant={variant}
      aria-label="Decision strip"
      className={[
        "rounded-2xl border border-slate-200 bg-white",
        "dark:border-bm-border/[0.08] dark:bg-bm-surface/[0.92]",
        isCompact ? "px-4 py-3" : "px-5 py-4",
      ].join(" ")}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        <Column
          label="Issues"
          emptyText="No outstanding issues"
          emptyTone="neutral"
        >
          {issuesToShow.length > 0 ? (
            issuesToShow.map((bullet) => (
              <li key={bullet.key} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${SEVERITY_DOT[bullet.severity]}`}
                />
                <span>
                  <span className="text-bm-ink">{bullet.headline}</span>
                  {bullet.detail ? (
                    <span className="block text-xs text-bm-muted">{bullet.detail}</span>
                  ) : null}
                </span>
              </li>
            ))
          ) : null}
        </Column>

        <Column label="Drivers" emptyText="Drivers emerging" emptyTone="neutral">
          {driversToShow.length > 0
            ? driversToShow.map((bullet) => (
                <li key={bullet.key} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-bm-success"
                  />
                  <span className="text-bm-ink">{bullet.headline}</span>
                </li>
              ))
            : null}
        </Column>

        <Column
          label="Recommendation"
          emptyText={emptyRecommendationText(data.recommendationRejectionReason)}
          emptyTone="attention"
        >
          {data.recommendation ? (
            <li className="text-sm">
              <span className="block font-medium text-bm-ink">
                {data.recommendation.headline}
              </span>
              <span className="mt-0.5 block text-xs text-bm-muted">
                {data.recommendation.action}
              </span>
            </li>
          ) : null}
        </Column>
      </div>

      {snapshotVersion ? (
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2 text-[10px] uppercase tracking-wide text-bm-muted dark:border-bm-border/[0.08]">
          <span>Snapshot</span>
          <span className="font-mono">{snapshotVersion}</span>
        </div>
      ) : null}
    </section>
  );
}

function Column({
  label,
  children,
  emptyText,
  emptyTone,
}: {
  label: string;
  children: React.ReactNode;
  emptyText: string;
  emptyTone: "neutral" | "attention";
}) {
  const hasContent = Array.isArray(children)
    ? children.some((child) => child)
    : Boolean(children);

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-bm-muted">
        {label}
      </div>
      <ul className="mt-2 space-y-1.5">
        {hasContent ? (
          children
        ) : (
          <li
            className={
              emptyTone === "attention"
                ? "text-sm italic text-bm-warning"
                : "text-sm text-bm-muted"
            }
          >
            {emptyText}
          </li>
        )}
      </ul>
    </div>
  );
}

function emptyRecommendationText(
  reason: DecisionStripData["recommendationRejectionReason"]
): string {
  if (reason === "restate_of_top_issue") return "Awaiting recommendation";
  if (reason === "no_candidate_available") return "Awaiting recommendation";
  return "Awaiting recommendation";
}
