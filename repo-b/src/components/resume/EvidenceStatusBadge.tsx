import type { CSSProperties } from "react";
import type { EvidenceStatus } from "./evidenceGraphData";

type Style = {
  background: string;
  borderColor: string;
  color: string;
  borderStyle?: CSSProperties["borderStyle"];
};

const STATUS_STYLES: Record<EvidenceStatus, Style> = {
  Production: {
    background: "rgba(212,152,64,0.10)",
    borderColor: "var(--ros-accent-gold)",
    color: "var(--ros-accent-gold)",
  },
  Winston: {
    background: "rgba(208,85,48,0.12)",
    borderColor: "var(--ros-accent-warm)",
    color: "var(--ros-accent-warm)",
  },
  Prototype: {
    background: "rgba(208,85,48,0.05)",
    borderColor: "var(--ros-accent-warm)",
    borderStyle: "dashed",
    color: "var(--ros-accent-warm)",
  },
  Advisory: {
    background: "transparent",
    borderColor: "var(--ros-text-muted)",
    color: "var(--ros-text-muted)",
  },
  Gap: {
    background: "transparent",
    borderColor: "var(--ros-text-dim)",
    borderStyle: "dashed",
    color: "var(--ros-text-dim)",
  },
};

export function EvidenceStatusBadge({
  status,
  size = "sm",
}: {
  status: EvidenceStatus;
  size?: "sm" | "xs";
}) {
  const s = STATUS_STYLES[status];
  const isXs = size === "xs";
  return (
    <span
      className={
        "inline-flex items-center rounded border font-bold tracking-[0.14em] uppercase whitespace-nowrap leading-none " +
        (isXs ? "px-1.5 py-[3px] text-[9px]" : "px-2 py-[4px] text-[10px]")
      }
      style={{
        background: s.background,
        borderColor: s.borderColor,
        borderStyle: s.borderStyle ?? "solid",
        color: s.color,
      }}
    >
      {status}
    </span>
  );
}
