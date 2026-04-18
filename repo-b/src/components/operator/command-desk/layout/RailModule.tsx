"use client";
import type { ReactNode } from "react";
import { Caps } from "../atoms/Caps";

type RailModuleProps = {
  title: string;
  accent?: string;
  caption?: string;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
};

export function RailModule({
  title,
  accent = "var(--neon-cyan)",
  caption,
  action,
  children,
}: RailModuleProps) {
  return (
    <div
      style={{
        background: "var(--bg-panel)",
        border: "1px solid var(--line-2)",
        borderRadius: 3,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 2,
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          background: "var(--bg-panel-2)",
          borderBottom: "1px solid var(--line-2)",
        }}
      >
        <Caps color={accent}>{title}</Caps>
        {caption && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--fg-3)",
              letterSpacing: ".08em",
            }}
          >
            {caption}
          </span>
        )}
        {action && (
          <span
            onClick={action.onClick}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--neon-cyan)",
              letterSpacing: ".08em",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {action.label} ›
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
