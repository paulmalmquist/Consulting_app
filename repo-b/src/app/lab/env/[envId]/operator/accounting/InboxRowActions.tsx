"use client";

import { useState } from "react";
import type { NvQueueItem, NvQueueItemType } from "@/types/nv-accounting";

export type InboxDisposition =
  | "match"
  | "reimbursable"
  | "categorize"
  | "classify"
  | "resolve"
  | "snooze-1d"
  | "snooze-7d"
  | "ignore";

type Props = {
  item: NvQueueItem;
  onDisposition: (item: NvQueueItem, disposition: InboxDisposition) => void;
};

// Map queue item type → up to 2 primary inline actions. Anything else hides
// behind the overflow menu. Keeps rows scannable; full disposition still
// available via overflow.
const PRIMARY_BY_TYPE: Record<NvQueueItemType, InboxDisposition[]> = {
  "review-receipt":  ["resolve", "ignore"],
  "match-receipt":   ["match", "snooze-7d"],
  "categorize":      ["categorize", "ignore"],
  "overdue-invoice": ["resolve", "snooze-7d"],
  "reimbursable":    ["reimbursable", "ignore"],
};

const LABEL: Record<InboxDisposition, string> = {
  match: "Match",
  reimbursable: "Reimburse",
  categorize: "Categorize",
  classify: "Classify",
  resolve: "Resolve",
  "snooze-1d": "Snooze 1d",
  "snooze-7d": "Snooze 7d",
  ignore: "Ignore",
};

const OVERFLOW_ORDER: InboxDisposition[] = [
  "match",
  "reimbursable",
  "categorize",
  "classify",
  "resolve",
  "snooze-1d",
  "snooze-7d",
  "ignore",
];

export function InboxRowActions({ item, onDisposition }: Props) {
  const [open, setOpen] = useState(false);
  const primary = PRIMARY_BY_TYPE[item.type] ?? ["resolve", "ignore"];
  const overflow = OVERFLOW_ORDER.filter((d) => !primary.includes(d));

  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onClick={stop}
      onMouseDown={stop}
      style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}
    >
      {primary.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDisposition(item, d)}
          style={{
            background: "transparent",
            border: "1px solid var(--line-2)",
            color: "var(--fg-2)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "3px 7px",
            borderRadius: 3,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-row-hover)";
            e.currentTarget.style.color = "var(--fg-1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--fg-2)";
          }}
        >
          {LABEL[d]}
        </button>
      ))}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "1px solid var(--line-2)",
            color: "var(--fg-3)",
            width: 22,
            height: 22,
            borderRadius: 3,
            cursor: "pointer",
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="More actions"
        >
          ⋯
        </button>
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              right: 0,
              minWidth: 140,
              background: "var(--bg-panel)",
              border: "1px solid var(--line-3)",
              borderRadius: 4,
              boxShadow: "var(--shadow-raised)",
              zIndex: 10,
              padding: 4,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {overflow.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDisposition(item, d);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  textAlign: "left",
                  color: "var(--fg-2)",
                  fontFamily: "var(--font-sans)",
                  fontSize: 12,
                  padding: "6px 10px",
                  cursor: "pointer",
                  borderRadius: 3,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-row-hover)";
                  e.currentTarget.style.color = "var(--fg-1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--fg-2)";
                }}
              >
                {LABEL[d]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
