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

      {/* era theme layer — keyed so each selection cross-fades; carries the accessible label. The image
          sits on this element so its background-size can vary (cover for photos/motifs, a fixed share
          for a centered logo); the tone wash is a full-bleed child so the custom size never warps it. */}
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
            backgroundImage: bd.image ? `url("${bd.image}")` : undefined,
            backgroundSize: bd.size ?? "cover",
            backgroundPosition: bd.focus ?? "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          <div style={{ position: "absolute", inset: 0,
            background: `radial-gradient(120% 95% at 28% 16%, ${bd.tone}33, transparent 60%)` }} />
        </div>
      )}

      {/* scrim for readability + fade to background before the chart */}
      <div style={{ position: "absolute", inset: 0, background: SCRIM }} />

      {/* Translucent fact marks — a few of the selected event's own metrics, stamped over the image as
          faint mission annotations so the background participates in the story. They live in this
          backdrop layer (zIndex 0), so the hero title/cards/CTA always paint over them — the marks only
          show through the negative space, never covering foreground. Decorative echo of the KPI cards
          (same values), so aria-hidden. Hidden on narrow widths; renders only as many as exist. */}
      {event && event.metrics && event.metrics.length > 0 && (
        <div className="hidden lg:flex" aria-hidden style={{
          position: "absolute", top: 78, right: 24,
          flexDirection: "column", gap: 12, alignItems: "flex-end", maxWidth: "42%", opacity: 0.6,
        }}>
          {event.metrics.slice(0, 3).map(([label, value]) => (
            <div key={label} style={{ textAlign: "right", borderRight: `2px solid ${event.color}66`, paddingRight: 9 }}>
              <div style={{ fontFamily: C.mono, fontSize: 16, color: event.color, lineHeight: 1.05,
                textShadow: "0 1px 10px rgba(0,0,0,0.7)" }}>{value}</div>
              <div style={{ fontFamily: C.mono, fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase",
                color: C.faint, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

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
