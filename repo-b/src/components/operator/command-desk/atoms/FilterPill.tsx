import { useState } from "react";
import type { ReactNode } from "react";

type FilterPillProps = {
  label: string;
  value: ReactNode;
  active?: boolean;
  onClick?: () => void;
};

export function FilterPill({ label, value, active, onClick }: FilterPillProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        padding: "0 10px",
        height: 26,
        borderRadius: 3,
        border: `1px solid ${active ? "var(--neon-cyan)" : hover ? "var(--line-3)" : "var(--line-2)"}`,
        background: active ? "rgba(0,229,255,.06)" : hover ? "var(--bg-row-hover)" : "var(--bg-inset)",
        color: active ? "var(--neon-cyan)" : "var(--fg-1)",
        cursor: onClick ? "pointer" : "default",
        transition: "all 80ms",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          color: active ? "var(--neon-cyan)" : "var(--fg-3)",
          letterSpacing: ".08em",
          fontSize: 10,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ color: active ? "var(--neon-cyan)" : "var(--fg-1)" }}>{value}</span>
      <span style={{ color: "var(--fg-4)", fontSize: 8 }}>▾</span>
    </div>
  );
}
