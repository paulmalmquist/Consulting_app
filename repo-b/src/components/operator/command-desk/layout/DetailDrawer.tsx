"use client";
import { useEffect } from "react";
import type { ReactNode } from "react";

type DetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  accent?: string;
  header: ReactNode;
  body: ReactNode;
  footer?: ReactNode;
  width?: number;
};

export function DetailDrawer({
  open,
  onClose,
  accent = "var(--neon-cyan)",
  header,
  body,
  footer,
  width = 380,
}: DetailDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width,
        background: "var(--bg-panel)",
        borderLeft: "1px solid var(--line-3)",
        boxShadow: "-12px 0 32px rgba(0,0,0,.55)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        animation: "command-desk-slide-left 140ms cubic-bezier(0.2,0.8,0.2,1)",
        zIndex: 20,
      }}
    >
      <div style={{ height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ flex: "none" }}>{header}</div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{body}</div>
      {footer && (
        <div
          style={{
            flex: "none",
            padding: "10px 14px",
            borderTop: "1px solid var(--line-2)",
            background: "var(--bg-panel-2)",
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
