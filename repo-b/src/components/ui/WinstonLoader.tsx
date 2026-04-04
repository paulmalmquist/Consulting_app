"use client";

/**
 * WinstonLoader — global system loading indicator.
 *
 * Driven by useWinstonLoader() store. Phases:
 *   idle         → invisible
 *   loading_fast → fast spin (bowtie icon, centered)
 *   loading_slow → slower spin + label after 800ms
 *   thinking     → AI pulse (different rhythm)
 *   complete     → decelerate + shrink to FAB position, then idle
 *
 * All animations use transform/opacity only (GPU-accelerated).
 * The component is mounted globally in Providers and is always in the DOM
 * when non-idle so it appears within 100ms of any trigger.
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useWinstonLoader, type LoaderPhase } from "@/lib/loading-state";
import { WinstonBowtieIcon } from "@/components/winston-companion/WinstonAvatar";

// FAB position (must match WinstonCompanionSurface button)
// bottom-4 md:bottom-6 right-4 md:right-6 — we target the md values
const FAB_BOTTOM = 24; // px, matches md:bottom-6
const FAB_RIGHT = 24;  // px, matches md:right-6
const FAB_SIZE = 64;   // px, h-16 w-16

type LabelTimer = ReturnType<typeof setTimeout> | null;

export default function WinstonLoader() {
  const phase = useWinstonLoader((s) => s.phase);
  const storeLabel = useWinstonLoader((s) => s.label);
  const [visibleLabel, setVisibleLabel] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const labelTimer = useRef<LabelTimer>(null);

  // Show label only after 800ms of active loading
  useEffect(() => {
    if (labelTimer.current) {
      clearTimeout(labelTimer.current);
      labelTimer.current = null;
    }
    if (phase === "loading_slow" || phase === "thinking") {
      labelTimer.current = setTimeout(() => {
        setVisibleLabel(storeLabel ?? labelForPhase(phase));
      }, 800);
    } else {
      setVisibleLabel(null);
    }
    return () => {
      if (labelTimer.current) clearTimeout(labelTimer.current);
    };
  }, [phase, storeLabel]);

  // Track whether we were previously visible so we can play exit correctly
  const prevPhaseRef = useRef<LoaderPhase>("idle");
  useEffect(() => {
    prevPhaseRef.current = phase;
  });

  // Mount guard — avoids SSR mismatch
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const isVisible = phase !== "idle";
  if (!isVisible) return null;

  return (
    <div
      aria-live="polite"
      aria-label={visibleLabel ?? "Loading"}
      className={cn(
        "pointer-events-none fixed z-[200] flex flex-col items-center justify-center gap-3",
        phase === "complete"
          ? // Exit: animate toward FAB position (bottom-right)
            "inset-auto"
          : // Active: centered overlay
            "inset-0",
      )}
      style={
        phase === "complete"
          ? {
              bottom: FAB_BOTTOM,
              right: FAB_RIGHT,
              width: FAB_SIZE,
              height: FAB_SIZE,
            }
          : undefined
      }
    >
      {/* Backdrop — only on centered phases */}
      {phase !== "complete" && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-300",
            phase === "loading_fast" ? "opacity-0" : "opacity-100 bg-[rgba(5,7,11,0.18)] backdrop-blur-[1px]",
          )}
        />
      )}

      {/* Icon container */}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full",
          "bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.95),rgba(255,255,255,0.6)_35%,rgba(12,18,28,0.96)_100%)]",
          "border border-white/45 shadow-[0_20px_60px_-28px_rgba(0,0,0,0.8)]",
          phaseIconClass(phase),
        )}
      >
        {/* Spinning ring — only on loading phases */}
        {(phase === "loading_fast" || phase === "loading_slow") && (
          <span
            className={cn(
              "absolute inset-[-3px] rounded-full border-2 border-transparent",
              "border-t-bm-accent/70 border-r-bm-accent/30",
              phase === "loading_fast"
                ? "animate-[loader-spin-fast_0.7s_linear_infinite]"
                : "animate-[loader-spin-slow_2.2s_cubic-bezier(0.4,0,0.6,1)_infinite]",
            )}
          />
        )}

        {/* AI thinking ring — different rhythm */}
        {phase === "thinking" && (
          <span className="absolute inset-0 rounded-full bg-bm-accent/12 animate-[loader-ai-pulse_2.4s_ease-in-out_infinite]" />
        )}

        {/* Complete: ripple ring */}
        {phase === "complete" && (
          <span className="absolute inset-0 rounded-full bg-bm-accent/20 animate-[loader-ring_1.2s_ease-out_forwards]" />
        )}

        {/* Bowtie icon */}
        <WinstonBowtieIcon
          className={cn(
            "relative z-10",
            phase === "complete" ? "h-[58%] w-[58%] text-black" : "h-[58%] w-[58%] text-black",
            phase === "thinking" && "animate-[loader-ai-pulse_2.4s_ease-in-out_infinite]",
          )}
        />
      </div>

      {/* Microcopy label — centered phases only, appears after 800ms */}
      {phase !== "complete" && visibleLabel && (
        <p
          className="relative z-10 font-mono text-[11px] uppercase tracking-[0.18em] text-white/70 animate-[winston-fade-in_0.2s_ease-out]"
        >
          {visibleLabel}
        </p>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function phaseIconClass(phase: LoaderPhase): string {
  switch (phase) {
    case "loading_fast":
      return "h-14 w-14 animate-[loader-fade-in_0.15s_ease-out_forwards]";
    case "loading_slow":
      return "h-14 w-14";
    case "thinking":
      return "h-14 w-14";
    case "complete":
      // Shrink to match FAB exactly
      return "h-full w-full animate-[loader-settle_0.5s_cubic-bezier(0.34,1.56,0.64,1)_forwards]";
    default:
      return "h-14 w-14";
  }
}

function labelForPhase(phase: LoaderPhase): string {
  switch (phase) {
    case "loading_slow":
      return "Preparing data";
    case "thinking":
      return "Preparing AI context";
    default:
      return "Loading";
  }
}

// ─── Inline page loader (replaces "Resolving environment context...") ────────

/**
 * Lightweight inline skeleton used in workspace shells while env context loads.
 * Not a full overlay — renders in the normal document flow.
 */
export function WorkspaceContextLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-2 py-4 text-sm text-bm-muted2">
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <WinstonBowtieIcon className="h-full w-full text-bm-muted2 animate-[loader-spin-slow_2.2s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.16em]">
        {label ?? "Loading workspace"}
      </span>
    </div>
  );
}
