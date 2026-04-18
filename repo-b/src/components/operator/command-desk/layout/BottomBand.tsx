"use client";
import type { ReactNode } from "react";
import { Caps } from "../atoms/Caps";

export type BottomBandPanel = {
  key: string;
  title: string;
  caption?: string;
  accent: string;
  body: ReactNode;
  onExpand?: () => void;
};

type BottomBandProps = {
  panels: BottomBandPanel[];
  height?: number;
};

export function BottomBand({ panels, height = 220 }: BottomBandProps) {
  return (
    <div
      style={{
        height,
        borderTop: "1px solid var(--line-2)",
        background: "var(--bg-base)",
        display: "grid",
        gridTemplateColumns: `repeat(${panels.length}, 1fr)`,
      }}
    >
      {panels.map((p, i) => (
        <div
          key={p.key}
          style={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            borderRight: i < panels.length - 1 ? "1px solid var(--line-2)" : "none",
            position: "relative",
            overflow: "hidden",
            background: "var(--bg-panel)",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: `linear-gradient(90deg, ${p.accent}, transparent)`,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px 6px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <Caps color={p.accent}>{p.title}</Caps>
              {p.caption && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)" }}>
                  {p.caption}
                </span>
              )}
            </div>
            {p.onExpand && (
              <span
                onClick={p.onExpand}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--fg-3)",
                  letterSpacing: ".08em",
                  cursor: "pointer",
                }}
              >
                EXPAND ›
              </span>
            )}
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: "0 12px 10px" }}>{p.body}</div>
        </div>
      ))}
    </div>
  );
}
