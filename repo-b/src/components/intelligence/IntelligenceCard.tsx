"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/Card";
import { type IntelCard, type CardType, CARD_TYPE_LABELS } from "@/lib/intelligence/cards";

// One card in the executive intelligence feed (plan PR 4). Variant accents per
// card_type; hover reveals actions; anomaly_flag glows and pulses. The "Investigate"
// action launches a grounded investigation session when the card has a usable
// source_ref (PR 8.6); otherwise it stays disabled, fail-closed.

// A card can launch an investigation only when its source_ref is a non-empty object —
// the session is grounded on that source. An empty/absent source_ref means there is
// nothing to investigate yet, so the action is disabled rather than launching an
// ungrounded session.
export function hasUsableSourceRef(card: Pick<IntelCard, "source_ref">): boolean {
  const ref = card.source_ref;
  return Boolean(ref) && typeof ref === "object" && Object.keys(ref).length > 0;
}

// Per-type accent classes (Tailwind bm-* token families used across the app).
const TYPE_ACCENT: Record<CardType, { bar: string; chip: string; icon: string }> = {
  dashboard:     { bar: "bg-bm-accent",     chip: "text-bm-accent",         icon: "▤" },
  report:        { bar: "bg-bm-muted",      chip: "text-bm-text-secondary", icon: "▦" },
  story:         { bar: "bg-bm-success",    chip: "text-bm-success",        icon: "❧" },
  investigation: { bar: "bg-bm-warning",    chip: "text-bm-warning",        icon: "⌕" },
  forecast:      { bar: "bg-bm-purple",     chip: "text-bm-purple",         icon: "📈" },
  finding:       { bar: "bg-bm-accent",     chip: "text-bm-accent",         icon: "◆" },
  alert:         { bar: "bg-bm-danger",     chip: "text-bm-danger",         icon: "▲" },
};

export interface IntelligenceCardProps {
  card: IntelCard;
  onOpen?: (card: IntelCard) => void;
  onDismiss?: (card: IntelCard) => void;
  onForkInvestigation?: (card: IntelCard) => void; // inert until PR 6
  className?: string;
}

export function IntelligenceCard({
  card, onOpen, onDismiss, onForkInvestigation, className,
}: IntelligenceCardProps) {
  const accent = TYPE_ACCENT[card.card_type] ?? TYPE_ACCENT.report;
  const anomaly = card.anomaly_flag;

  return (
    <Card
      hover
      variant={anomaly ? "danger" : "default"}
      className={cn(
        "group relative overflow-hidden p-4 transition-all duration-200",
        anomaly && "shadow-[0_0_0_1px_var(--bm-danger-border),0_0_18px_-4px_var(--bm-danger)]",
        className,
      )}
    >
      {/* Left accent bar */}
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", accent.bar)} aria-hidden />

      {/* Anomaly pulsing dot */}
      {anomaly && (
        <span className="absolute right-3 top-3 flex h-2 w-2" aria-label="needs attention">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bm-danger opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-bm-danger" />
        </span>
      )}

      <div className="pl-2">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs", accent.chip)} aria-hidden>{accent.icon}</span>
          <span className={cn("font-mono text-[10px] uppercase tracking-wider", accent.chip)}>
            {CARD_TYPE_LABELS[card.card_type]}
          </span>
          {card.created_by && card.created_by !== "system" && (
            <span className="font-mono text-[10px] text-bm-text-muted">· {card.created_by}</span>
          )}
        </div>

        <h3 className="mt-1.5 text-sm font-semibold text-bm-text">{card.title}</h3>
        {card.summary && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-bm-text-muted">{card.summary}</p>
        )}

        {/* Hover-revealed actions */}
        <div className="mt-3 flex items-center gap-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {onOpen && (
            <button type="button" onClick={() => onOpen(card)}
              className="rounded border border-bm-border px-2 py-1 font-mono text-[11px] text-bm-text hover:border-bm-border-hi">
              Open
            </button>
          )}
          {onDismiss && (
            <button type="button" onClick={() => onDismiss(card)}
              className="rounded border border-bm-border px-2 py-1 font-mono text-[11px] text-bm-text-muted hover:border-bm-border-hi">
              Dismiss
            </button>
          )}
          {/* Investigate: enabled only when a handler is wired AND the card has a usable
              source_ref to ground the session on. Otherwise disabled, fail-closed. */}
          {(() => {
            const canInvestigate = Boolean(onForkInvestigation) && hasUsableSourceRef(card);
            return (
              <button
                type="button"
                disabled={!canInvestigate}
                title={canInvestigate
                  ? "Open a grounded investigation for this card"
                  : "This card has no source to investigate yet"}
                onClick={() => canInvestigate && onForkInvestigation?.(card)}
                className={cn(
                  "rounded border border-bm-border px-2 py-1 font-mono text-[11px]",
                  canInvestigate
                    ? "text-bm-text hover:border-bm-border-hi"
                    : "cursor-not-allowed text-bm-text-muted opacity-60",
                )}
              >
                ▶ Investigate
              </button>
            );
          })()}
        </div>
      </div>
    </Card>
  );
}

export default IntelligenceCard;
