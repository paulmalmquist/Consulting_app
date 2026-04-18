"use client";
import { Dot } from "../atoms/Dot";

export type StatusBarHotkey = { keys: string; label: string };

type StatusBarProps = {
  version: string;
  syncState?: "live" | "stale" | "down";
  syncLabel?: string;
  hotkeys?: StatusBarHotkey[];
  periodLocked?: { period: string; by?: string };
  right?: string;
};

export function StatusBar({
  version,
  syncState = "live",
  syncLabel,
  hotkeys = [],
  periodLocked,
  right,
}: StatusBarProps) {
  const syncColor =
    syncState === "live" ? "var(--sem-up)" : syncState === "stale" ? "var(--neon-amber)" : "var(--sem-down)";
  return (
    <div
      style={{
        height: 22,
        padding: "0 14px",
        background: "var(--bg-void)",
        borderTop: "1px solid var(--line-2)",
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--fg-3)",
        letterSpacing: ".04em",
      }}
    >
      <span style={{ color: "var(--fg-2)" }}>{version}</span>
      <span style={{ color: "var(--line-3)" }}>│</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Dot color={syncColor} size={4} />
        <span>{syncLabel ?? syncState.toUpperCase()}</span>
      </span>
      <span style={{ color: "var(--line-3)" }}>│</span>
      {hotkeys.map((h, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--line-2)",
              borderRadius: 2,
              padding: "0 4px",
              color: "var(--fg-1)",
            }}
          >
            {h.keys}
          </span>
          <span>{h.label}</span>
        </span>
      ))}
      <div style={{ flex: 1 }} />
      {periodLocked && (
        <span>
          last close · <span style={{ color: "var(--fg-1)" }}>{periodLocked.period}</span> · locked
          {periodLocked.by ? ` by ${periodLocked.by}` : ""}
        </span>
      )}
      {right && <span>{right}</span>}
    </div>
  );
}
