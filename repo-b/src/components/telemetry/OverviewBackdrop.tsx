"use client";

// Overview era backdrop (Phase 9B). When a Bottleneck Map event is selected, the hero band behind the
// thesis transitions to an illustrative, era-appropriate backdrop. Strictly decorative: a dark scrim
// keeps text readable and fades fully to the page background BEFORE the chart begins, so the Bottleneck
// Map always renders on flat C.bg with its contrast and selected-dot emphasis unchanged. A missing
// asset degrades to the tone wash (CSS background-image, never an <img>), so there is no broken-image
// state. Motion is CSS-only and respects prefers-reduced-motion.

import { C } from "./primitives";
import { resolveBackdrop } from "./context/BottleneckMap/data";
import type { DecoratedEvent } from "./context/BottleneckMap/types";
import styles from "./OverviewBackdrop.module.css";

// Scrim: darken toward the page background; reach full C.bg opacity by the bottom so the band blends
// into the flat background the chart sits on. Tuned to keep hero text well above WCAG AA.
const SCRIM = "linear-gradient(180deg, rgba(7,11,17,0.62) 0%, rgba(7,11,17,0.86) 55%, #070b11 100%)";
// Persistent fallback wash (no selection / no theme) — subtle, never a hard edge.
const BASE = `linear-gradient(180deg, ${C.panel}55 0%, ${C.bg} 78%)`;

export default function OverviewBackdrop({ event }: { event: DecoratedEvent | null }) {
  const bd = resolveBackdrop(event);
  // Key the fading layer on the resolved asset/era so a new selection replays the fade-in.
  const themeKey = bd ? bd.image ?? `tone:${bd.tone}` : null;

  return (
    <div
      style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "min(60vh, 560px)",
        zIndex: 0, overflow: "hidden", pointerEvents: "none",
      }}
    >
      {/* persistent base wash */}
      <div style={{ position: "absolute", inset: 0, background: BASE }} />

      {/* era theme layer — keyed so each selection cross-fades; carries the accessible label */}
      {bd && (
        <div
          key={themeKey ?? undefined}
          className={styles.backdropFade}
          role="img"
          aria-label={bd.alt}
          data-testid="overview-backdrop-theme"
          style={{
            position: "absolute", inset: 0,
            backgroundColor: `${bd.tone}14`,
            backgroundImage: [
              `radial-gradient(120% 95% at 28% 16%, ${bd.tone}33, transparent 60%)`,
              bd.image ? `url("${bd.image}")` : null,
            ].filter(Boolean).join(", "),
            backgroundSize: "cover",
            backgroundPosition: bd.focus ?? "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      )}

      {/* scrim for readability + fade to background before the chart */}
      <div style={{ position: "absolute", inset: 0, background: SCRIM }} />

      {/* honesty label — illustrative atmosphere, never evidence. Curated era photos show their
          credit/license; generative motifs say so. */}
      {bd && (
        <div
          style={{
            position: "absolute", right: 14, bottom: 12,
            fontFamily: C.mono, fontSize: 10, letterSpacing: "0.08em", color: C.faint,
          }}
        >
          {bd.sourceKind === "generative"
            ? "Backdrop: illustrative · generative"
            : `Illustrative — ${bd.credit ?? "curated asset"}`}
        </div>
      )}
    </div>
  );
}
