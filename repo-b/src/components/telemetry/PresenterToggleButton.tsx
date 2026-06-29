"use client";

// Icon-only Play/Stop control for the guided Bottleneck Map walkthrough, rendered in the Overview hero
// header action area. No visible text — the accessible name lives on aria-label ("Play story" /
// "Stop story"). The map owns the step index; this just toggles it via the parent's signal.
import { RS } from "./rsTokens";

export default function PresenterToggleButton({ presenting, onToggle }: {
  presenting: boolean;
  onToggle: () => void;
}) {
  const color = presenting ? RS.red : RS.green;
  return (
    <button type="button" onClick={onToggle} aria-pressed={presenting}
      aria-label={presenting ? "Stop story" : "Play story"}
      title={presenting ? "Stop story" : "Play story"}
      style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center",
        borderRadius: 999, cursor: "pointer", background: `${color}1f`, border: `1px solid ${color}`, color }}>
      <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>{presenting ? "■" : "▶"}</span>
    </button>
  );
}
