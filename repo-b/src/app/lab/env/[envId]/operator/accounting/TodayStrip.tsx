"use client";

import type { NvQueue, NvARAging } from "@/types/nv-accounting";

type Fragment = {
  key: string;
  label: string;
  count?: number;
  amount?: string;
  tone: "ok" | "warn" | "error" | "info";
  onClick: () => void;
};

type Props = {
  queue: NvQueue | null;
  arAging: NvARAging | null;
  unclassifiedVendors: number;
  reimbursementPending: string | null;
  onJumpToView: (view: "needs" | "txns" | "recs" | "invs" | "subs") => void;
  onFilterOverdue: () => void;
};

const TONE_COLOR: Record<Fragment["tone"], string> = {
  ok: "var(--sem-up)",
  warn: "var(--sem-warn)",
  error: "var(--sem-error)",
  info: "var(--fg-2)",
};

export function TodayStrip({
  queue,
  arAging,
  unclassifiedVendors,
  reimbursementPending,
  onJumpToView,
  onFilterOverdue,
}: Props) {
  const fragments: Fragment[] = [];

  const txnsToReview = queue?.items.filter((i) => i.type === "categorize" || i.type === "match-receipt").length ?? 0;
  if (txnsToReview > 0) {
    fragments.push({
      key: "txns",
      label: `${txnsToReview} transaction${txnsToReview === 1 ? "" : "s"} need review`,
      tone: "warn",
      onClick: () => onJumpToView("needs"),
    });
  }

  const overdueCount = queue?.items.filter((i) => i.type === "overdue-invoice").length ?? 0;
  if (overdueCount > 0) {
    fragments.push({
      key: "overdue",
      label: `${overdueCount} overdue invoice${overdueCount === 1 ? "" : "s"}`,
      tone: "error",
      onClick: onFilterOverdue,
    });
  }

  if (unclassifiedVendors > 0) {
    fragments.push({
      key: "vendors",
      label: `${unclassifiedVendors} subscription${unclassifiedVendors === 1 ? "" : "s"} unclassified`,
      tone: "warn",
      onClick: () => onJumpToView("subs"),
    });
  }

  const reimbursable = queue?.items.filter((i) => i.type === "reimbursable").length ?? 0;
  if (reimbursable > 0) {
    fragments.push({
      key: "reimburse",
      label: reimbursementPending
        ? `${reimbursementPending} reimbursement pending`
        : `${reimbursable} reimbursement${reimbursable === 1 ? "" : "s"} pending`,
      tone: "info",
      onClick: () => onJumpToView("needs"),
    });
  }

  // Suppress unused-prop lint when there's no AR aging signal yet.
  void arAging;

  return (
    <div
      style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 16px",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--line-1)",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.04em",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          color: "var(--fg-3)",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          fontSize: 10,
          flexShrink: 0,
        }}
      >
        Today
      </span>
      {fragments.length === 0 ? (
        <span style={{ color: "var(--fg-3)" }}>All clear</span>
      ) : (
        fragments.map((f, idx) => (
          <span key={f.key} style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            {idx > 0 && <span style={{ color: "var(--line-3)" }}>·</span>}
            <button
              type="button"
              onClick={f.onClick}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: TONE_COLOR[f.tone],
                fontFamily: "inherit",
                fontSize: "inherit",
                letterSpacing: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              {f.label}
            </button>
          </span>
        ))
      )}
    </div>
  );
}
