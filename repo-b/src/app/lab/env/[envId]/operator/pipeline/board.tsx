"use client";

import type { ExecutionBoardColumn, ExecutionCard } from "@/lib/cro-api";

export type ActionBucket = "today" | "overdue" | "this_week" | "waiting" | "blocked";

const ACTION_BUCKETS: Array<{ key: ActionBucket; label: string; accent: string }> = [
  { key: "today",     label: "Today",     accent: "var(--neon-cyan)" },
  { key: "overdue",   label: "Overdue",   accent: "var(--sem-error)" },
  { key: "this_week", label: "This Week", accent: "var(--neon-amber)" },
  { key: "waiting",   label: "Waiting",   accent: "var(--neon-violet)" },
  { key: "blocked",   label: "Blocked",   accent: "var(--fg-3)" },
];

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalDate(value: string): Date {
  // ISO "YYYY-MM-DD" should be interpreted as a local date, not UTC midnight.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** Fallback client-side bucketer — used only when `card.action_view_bucket` is absent.
 *  Mirrors the server rule order in backend/app/services/pipeline_buckets.py. */
export function bucketForActionView(card: ExecutionCard): ActionBucket {
  const risk = card.risk_flags ?? [];
  if (risk.includes("snoozed")) return "blocked";
  if (card.momentum_status === "declining" || risk.includes("waiting_reply")) return "waiting";
  if (!card.next_action_due) return risk.includes("no_next_action") ? "overdue" : "this_week";
  const today = startOfLocalDay(new Date());
  const due = startOfLocalDay(parseLocalDate(card.next_action_due));
  const diffMs = due.getTime() - today.getTime();
  if (diffMs < 0) return "overdue";
  if (diffMs === 0) return "today";
  const days = Math.round(diffMs / 86_400_000);
  if (days <= 7) return "this_week";
  return "this_week";
}

type MaybeBucketed = ExecutionCard & { action_view_bucket?: ActionBucket };

export function resolveBucket(card: MaybeBucketed): ActionBucket {
  return card.action_view_bucket ?? bucketForActionView(card);
}

/** Re-group stage columns into action-view buckets. Closed stages are dropped. */
export function toActionViewColumns(columns: ExecutionBoardColumn[]): ExecutionBoardColumn[] {
  const grouped: Record<ActionBucket, ExecutionCard[]> = {
    today: [],
    overdue: [],
    this_week: [],
    waiting: [],
    blocked: [],
  };
  for (const col of columns) {
    if (col.execution_column_key === "closed_won" || col.execution_column_key === "closed_lost") continue;
    for (const card of col.cards) {
      grouped[resolveBucket(card as MaybeBucketed)].push(card);
    }
  }
  return ACTION_BUCKETS.map(({ key, label }) => ({
    execution_column_key: key,
    execution_column_label: label,
    cards: grouped[key],
    total_value: grouped[key].reduce((s, c) => s + (c.amount || 0), 0),
    weighted_value: grouped[key].reduce((s, c) => s + (c.amount || 0) * (c.win_probability ?? 0.3), 0),
  }));
}

export { ACTION_BUCKETS };
