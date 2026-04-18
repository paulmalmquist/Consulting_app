"use client";
import { Caps } from "../atoms/Caps";

export type ViewSwitcherView = {
  key: string;
  label: string;
  count: number;
  accent: string;
};

type ViewSwitcherProps = {
  views: ViewSwitcherView[];
  value: string;
  onChange: (key: string) => void;
  sortLabel?: string;
  groupLabel?: string;
};

export function ViewSwitcher({ views, value, onChange, sortLabel, groupLabel }: ViewSwitcherProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        borderBottom: "1px solid var(--line-2)",
        background: "var(--bg-panel-2)",
        flex: "none",
      }}
    >
      {views.map((v) => {
        const isA = v.key === value;
        return (
          <div
            key={v.key}
            onClick={() => onChange(v.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 18px",
              height: 36,
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: isA ? "var(--fg-1)" : "var(--fg-3)",
              background: isA ? "var(--bg-panel)" : "transparent",
              borderRight: "1px solid var(--line-2)",
              borderBottom: isA ? `2px solid ${v.accent}` : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            <span>{v.label}</span>
            <span
              style={{
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 2,
                background: isA ? v.accent : "var(--bg-inset)",
                color: isA ? "var(--bg-void)" : "var(--fg-3)",
                border: `1px solid ${isA ? v.accent : "var(--line-2)"}`,
                fontWeight: 600,
              }}
            >
              {v.count}
            </span>
          </div>
        );
      })}
      <div style={{ flex: 1, borderBottom: "1px solid var(--line-2)", marginBottom: -1 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 12px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--fg-3)",
          letterSpacing: ".08em",
        }}
      >
        {sortLabel && (
          <>
            <Caps>SORT</Caps>
            <span style={{ color: "var(--fg-1)" }}>{sortLabel} ▾</span>
          </>
        )}
        {sortLabel && groupLabel && <span style={{ color: "var(--line-3)" }}>│</span>}
        {groupLabel && (
          <>
            <Caps>GROUP</Caps>
            <span style={{ color: "var(--fg-1)" }}>{groupLabel} ▾</span>
          </>
        )}
      </div>
    </div>
  );
}
