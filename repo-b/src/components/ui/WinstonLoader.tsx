"use client";

/**
 * WinstonLoader — global system loading indicator.
 *
 * Motion principle: the bowtie IS the animation.
 * No outer rings, no orbiting elements, no decoration doing the work.
 * The bowtie SVG itself rotates with physics-based easing that implies
 * real mass: spin-up inertia, friction-based deceleration, overshoot settle.
 *
 * Phases driven by useWinstonLoader() store:
 *   idle         → invisible
 *   loading_fast → energetic bowtie spin (strong cubic-bezier, 1.1s/rev)
 *   loading_slow → dragging deceleration (2.8s/rev, friction curve)
 *   thinking     → gentle 18° rocking — deliberate, not frantic
 *   complete     → settle animation: overshoot → correct → rest at 0°
 *
 * SVG centering: transformBox="fill-box" + transformOrigin="center" on the
 * SVG element itself ensures the bowtie rotates around its own geometric
 * center (12,12 in a 24×24 viewBox), not the container's top-left corner.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useWinstonLoader, type LoaderPhase } from "@/lib/loading-state";
import { WinstonBowtieIcon } from "@/components/winston-companion/WinstonAvatar";

// FAB position — must match WinstonCompanionSurface button exactly
const FAB_BOTTOM = 24; // px  (md:bottom-6)
const FAB_RIGHT  = 24; // px  (md:right-6)
const FAB_SIZE   = 64; // px  (h-16 w-16)

export default function WinstonLoader() {
  const phase      = useWinstonLoader((s) => s.phase);
  const storeLabel = useWinstonLoader((s) => s.label);
  const [visibleLabel, setVisibleLabel] = useState<string | null>(null);
  const [mounted, setMounted]           = useState(false);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Label appears only after 800ms of sustained loading
  useEffect(() => {
    if (labelTimer.current) { clearTimeout(labelTimer.current); labelTimer.current = null; }
    if (phase === "loading_slow" || phase === "thinking") {
      labelTimer.current = setTimeout(() => {
        setVisibleLabel(storeLabel ?? labelForPhase(phase));
      }, 800);
    } else {
      setVisibleLabel(null);
    }
    return () => { if (labelTimer.current) clearTimeout(labelTimer.current); };
  }, [phase, storeLabel]);

  // SSR guard
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || phase === "idle") return null;

  const isComplete = phase === "complete";

  return (
    <div
      aria-live="polite"
      aria-label={visibleLabel ?? "Loading"}
      className={cn(
        "pointer-events-none fixed z-[200] flex flex-col items-center justify-center gap-3",
        isComplete ? "inset-auto" : "inset-0",
      )}
      style={isComplete ? { bottom: FAB_BOTTOM, right: FAB_RIGHT, width: FAB_SIZE, height: FAB_SIZE } : undefined}
    >
      {/* Subtle backdrop — fades in only on slow/thinking phases so fast loads don't interrupt */}
      {!isComplete && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-500",
            phase === "loading_fast"
              ? "opacity-0"
              : "opacity-100 bg-[rgba(5,7,11,0.14)] backdrop-blur-[1px]",
          )}
        />
      )}

      {/* Button shell — same visual identity as the persistent FAB */}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full",
          "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.95),rgba(255,255,255,0.6)_35%,rgba(12,18,28,0.96)_100%)]",
          "border border-white/45",
          isComplete
            ? "h-full w-full shadow-[0_20px_60px_-28px_rgba(0,0,0,0.8)]"
            : "h-14 w-14 shadow-[0_16px_48px_-20px_rgba(0,0,0,0.7)]",
        )}
      >
        {/* Arrival confirmation ring — fires once as loader resolves into FAB */}
        {isComplete && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full border border-bm-accent/50 animate-[loader-arrival-ring_0.9s_ease-out_forwards]"
          />
        )}

        {/*
          THE BOWTIE — the animated element.

          Key technique for correct SVG rotation:
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
          This anchors the rotation to the SVG's own bounding box center (12,12)
          rather than the CSS containing block's origin. Without this, the bowtie
          would orbit the container's top-left corner.

          Each phase applies a different named animation directly to the SVG.
          The container shell never rotates — only the bowtie does.
        */}
        <WinstonBowtieIcon
          className={cn(
            "relative z-10",
            isComplete ? "h-[58%] w-[58%]" : "h-[58%] w-[58%]",
            bowtieAnimationClass(phase),
            // In complete phase, color stays black to match FAB resting state
            isComplete ? "text-black" : "text-black",
          )}
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
          }}
        />
      </div>

      {/* Microcopy — only after 800ms, only on non-complete phases */}
      {!isComplete && visibleLabel && (
        <p className="relative z-10 font-mono text-[11px] uppercase tracking-[0.18em] text-white/70 animate-[winston-fade-in_0.2s_ease-out]">
          {visibleLabel}
        </p>
      )}
    </div>
  );
}

// ─── Animation class per phase ────────────────────────────────────────────────

function bowtieAnimationClass(phase: LoaderPhase): string {
  switch (phase) {
    case "loading_fast":
      // Spin-up: appears with a small rotation kick, then fast continuous spin.
      // The appear animation plays once; spin-fast loops. We stack them so the
      // entrance feels like the spin-up beginning rather than a separate event.
      return "animate-[loader-appear_0.28s_cubic-bezier(0.34,1.4,0.64,1)_forwards,loader-spin-fast_1.1s_cubic-bezier(0.4,0,0.2,1)_0.25s_infinite]";

    case "loading_slow":
      // Friction: same direction but visibly heavier — longer period, stronger ease
      return "animate-[loader-spin-slow_2.8s_cubic-bezier(0.25,0.1,0.1,1)_infinite]";

    case "thinking":
      // Rocking: deliberate ±18° oscillation. Feels cognitive, not mechanical.
      return "animate-[loader-think_3.2s_ease-in-out_infinite]";

    case "complete":
      // Settle: plays once — overshoots by ~6°, micro-corrects, rests at 0°.
      // This is the "Winston orienting himself" moment.
      return "animate-[loader-settle_0.7s_cubic-bezier(0.34,1.2,0.64,1)_forwards]";

    default:
      return "";
  }
}

function labelForPhase(phase: LoaderPhase): string {
  switch (phase) {
    case "loading_slow": return "Preparing data";
    case "thinking":     return "Preparing AI context";
    default:             return "Loading";
  }
}

// ─── Inline workspace loader ──────────────────────────────────────────────────

/**
 * Lightweight inline skeleton replacing "Resolving environment context...".
 * Uses the same bowtie-spins-with-friction treatment at small scale.
 */
export function WorkspaceContextLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-2 py-4">
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <WinstonBowtieIcon
          className="h-full w-full text-bm-muted2 animate-[loader-spin-slow_2.8s_cubic-bezier(0.25,0.1,0.1,1)_infinite]"
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">
        {label ?? "Loading workspace"}
      </span>
    </div>
  );
}
