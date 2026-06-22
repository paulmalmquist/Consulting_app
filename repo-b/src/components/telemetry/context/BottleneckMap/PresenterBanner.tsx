"use client";

// Presenter-mode banner: era + step counter, the step caption (keyed fade), and on-screen
// prev/next controls so the walkthrough works without a keyboard.
import React from "react";

import { RS, RS_MONO } from "../../rsTokens";
import styles from "./BottleneckMap.module.css";
import type { LaunchEvent } from "./types";

function StepButton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className={styles.control}
      style={{ background: "transparent", border: `1px solid ${RS.line}`, color: RS.dim,
        borderRadius: 6, padding: "6px 12px", cursor: disabled ? "default" : "pointer",
        fontFamily: RS_MONO, fontSize: 12, opacity: disabled ? 0.35 : 1 }}>
      {children}
    </button>
  );
}

export default function PresenterBanner({ event, accent, idx, total, onPrev, onNext }: {
  event: LaunchEvent;
  accent: string;
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ marginTop: 14, background: RS.panel, border: `1px solid ${accent}40`,
      borderRadius: 6, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16 }}>
      <StepButton label="Previous step" onClick={onPrev} disabled={idx === 0}>←</StepButton>
      <div key={idx} className={styles.fade} style={{ flex: 1, minHeight: 44 }}>
        <div style={{ fontFamily: RS_MONO, fontSize: 10, color: accent, letterSpacing: 1.5, textTransform: "uppercase" }}>
          {event.era} · {idx + 1} / {total}
        </div>
        <div style={{ fontSize: 13.5, color: RS.text, marginTop: 3 }}>{event.caption}</div>
      </div>
      <StepButton label="Next step" onClick={onNext} disabled={idx === total - 1}>→</StepButton>
    </div>
  );
}
