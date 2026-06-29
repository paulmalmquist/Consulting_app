"use client";

import { useId, useState, type ReactNode } from "react";
import { C } from "./primitives";

// Accessible, dependency-free tooltip for the RUL Calibration evidence surface.
// (@radix-ui/react-tooltip is not a repo dependency; we don't add one for this.)
// The trigger is a real <button> so it is keyboard-focusable; the bubble shows on
// hover AND focus and hides on blur/leave/Escape. aria-describedby ties the bubble
// to the trigger for screen readers. Dark, high-contrast, concise — and never the
// only place a critical caveat lives (those also render on the page).

export function RulInfoTooltip({
  label,
  children,
  triggerLabel = "More info",
  width = 260,
}: {
  /** Tooltip body text. */
  label: ReactNode;
  /** The visible trigger (an info glyph by default). */
  children?: ReactNode;
  triggerLabel?: string;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-label={triggerLabel}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 15,
          height: 15,
          borderRadius: 999,
          border: `1px solid ${C.borderHi}`,
          background: "transparent",
          color: C.faint,
          fontFamily: C.mono,
          fontSize: 9,
          lineHeight: 1,
          cursor: "help",
          padding: 0,
        }}
      >
        {children ?? "i"}
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: "absolute",
            bottom: "calc(100% + 7px)",
            left: 0,
            zIndex: 90,
            width,
            maxWidth: "70vw",
            background: C.panelHi,
            border: `1px solid ${C.borderHi}`,
            borderRadius: 8,
            padding: "9px 11px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            fontFamily: C.sans,
            fontSize: 12,
            lineHeight: 1.5,
            color: C.text,
            pointerEvents: "none",
            whiteSpace: "normal",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
