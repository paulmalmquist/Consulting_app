"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { StateCard } from "@/components/ui/StateCard";
import { IntelligenceCard } from "./IntelligenceCard";
import { type IntelCard } from "@/lib/intelligence/cards";

// The executive intelligence feed (plan PR 4). Groups cards into Needs Attention
// (anomaly), Today, and This Week. Reorder is a CSS transition; cards are already
// server-sorted (anomaly, priority, recency). No home wiring (PR 5).

export interface IntelligenceCardFeedProps {
  cards: IntelCard[];
  loading?: boolean;
  error?: string | null;
  nullReason?: string | null;
  onOpen?: (card: IntelCard) => void;
  onDismiss?: (card: IntelCard) => void;
  onForkInvestigation?: (card: IntelCard) => void;
  className?: string;
}

type Group = { key: string; label: string; cards: IntelCard[] };

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupCards(cards: IntelCard[]): Group[] {
  const todayStart = startOfToday();
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  const attention: IntelCard[] = [];
  const today: IntelCard[] = [];
  const week: IntelCard[] = [];
  const earlier: IntelCard[] = [];

  for (const c of cards) {
    if (c.anomaly_flag) { attention.push(c); continue; }
    const ts = c.last_updated_at ? new Date(c.last_updated_at).getTime() : 0;
    if (ts >= todayStart) today.push(c);
    else if (ts >= weekStart) week.push(c);
    else earlier.push(c);
  }

  return [
    { key: "attention", label: "Needs Attention", cards: attention },
    { key: "today", label: "Today", cards: today },
    { key: "week", label: "This Week", cards: week },
    { key: "earlier", label: "Earlier", cards: earlier },
  ].filter((g) => g.cards.length > 0);
}

export function IntelligenceCardFeed({
  cards, loading, error, nullReason,
  onOpen, onDismiss, onForkInvestigation, className,
}: IntelligenceCardFeedProps) {
  if (loading) return <StateCard state="loading" />;
  if (error) {
    return <StateCard state="error" title="Could not load the feed" message={error} />;
  }
  if (nullReason) {
    return (
      <StateCard
        state="empty"
        title="Feed unavailable"
        description={`null_reason: ${nullReason}`}
      />
    );
  }
  if (cards.length === 0) {
    return (
      <StateCard
        state="empty"
        title="No findings yet"
        description="Winston will surface observations here as your environments generate data."
      />
    );
  }

  const groups = groupCards(cards);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className={cn(
            "mb-2 font-mono text-[11px] uppercase tracking-wider",
            g.key === "attention" ? "text-bm-danger" : "text-bm-text-muted",
          )}>
            {g.label}
            <span className="ml-2 text-bm-text-muted">{g.cards.length}</span>
          </h2>
          <div className="grid grid-cols-1 gap-3 transition-all duration-300 sm:grid-cols-2 lg:grid-cols-3">
            {g.cards.map((c) => (
              <IntelligenceCard
                key={c.id}
                card={c}
                onOpen={onOpen}
                onDismiss={onDismiss}
                onForkInvestigation={onForkInvestigation}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default IntelligenceCardFeed;
