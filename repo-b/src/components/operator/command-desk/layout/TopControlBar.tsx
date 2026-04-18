"use client";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Dot } from "../atoms/Dot";
import { Caps } from "../atoms/Caps";
import { LiveClock } from "../atoms/LiveClock";

export type TopControlBarStatusCounts = {
  synced: number;
  needsAction: number;
  overdue: number;
};

type TopControlBarProps = {
  product?: string;
  title: string;
  descriptor?: string;
  liveSyncLabel?: string;
  liveSyncFresh?: boolean;
  statusCounts?: TopControlBarStatusCounts;
  envLabel?: string;
  actor?: string;
  onBack?: () => void;
  primaryActions?: ReactNode;
  logo?: ReactNode;
};

export function TopControlBar({
  product = "NOVENDOR",
  title,
  descriptor,
  liveSyncLabel,
  liveSyncFresh = true,
  statusCounts,
  envLabel = "PROD",
  actor,
  onBack,
  primaryActions,
  logo,
}: TopControlBarProps) {
  return (
    <div
      style={{
        height: 52,
        padding: "0 16px",
        background: "var(--bg-void)",
        borderBottom: "1px solid var(--line-2)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          title="Back to Operator"
          style={{
            background: "transparent",
            border: "1px solid var(--line-2)",
            color: "var(--fg-2)",
            height: 28,
            width: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={14} />
        </button>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {logo}
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
          <Caps size={9} color="var(--fg-3)">{product}</Caps>
          <Caps size={9} color="var(--neon-cyan)">{title.toUpperCase()}</Caps>
        </div>
      </div>
      <div style={{ width: 1, height: 28, background: "var(--line-2)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: "var(--fg-1)",
          }}
        >
          {title}
        </span>
        <Dot color={liveSyncFresh ? "var(--sem-up)" : "var(--sem-warn)"} size={5} />
        {descriptor && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", letterSpacing: ".04em" }}>
            {descriptor}
          </span>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {statusCounts && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot color="var(--sem-up)" size={4} />
            <span style={{ color: "var(--fg-3)" }}>SYNCED</span>
            <span style={{ color: "var(--fg-1)" }}>{statusCounts.synced}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot color="var(--neon-amber)" size={4} />
            <span style={{ color: "var(--fg-3)" }}>NEEDS</span>
            <span style={{ color: "var(--fg-1)" }}>{statusCounts.needsAction}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Dot color="var(--sem-error)" size={4} />
            <span style={{ color: "var(--fg-3)" }}>OVERDUE</span>
            <span style={{ color: "var(--sem-down)" }}>{statusCounts.overdue}</span>
          </span>
        </div>
      )}
      <LiveClock />
      {liveSyncLabel && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-3)", letterSpacing: ".04em" }}>
          {liveSyncLabel}
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          padding: "2px 6px",
          border: "1px solid var(--neon-cyan)",
          color: "var(--neon-cyan)",
          letterSpacing: ".08em",
          borderRadius: 2,
        }}
      >
        {envLabel}
      </span>
      {actor && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-2)" }}>{actor}</span>}
      {primaryActions && (
        <>
          <div style={{ width: 1, height: 28, background: "var(--line-2)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>{primaryActions}</div>
        </>
      )}
    </div>
  );
}
