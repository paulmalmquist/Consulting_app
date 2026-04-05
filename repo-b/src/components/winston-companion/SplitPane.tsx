"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const MIN_PANE_PX = 150;
const LS_KEY = "winston-split-ratio";
const DEFAULT_RATIO = 0.65;

/** Snap presets for mobile: chat-only, default, explore-focus */
const SNAP_PRESETS = [1.0, 0.65, 0.35] as const;

function readPersistedRatio(): number {
  if (typeof window === "undefined") return DEFAULT_RATIO;
  const saved = window.localStorage.getItem(LS_KEY);
  if (saved) {
    const parsed = parseFloat(saved);
    if (!Number.isNaN(parsed) && parsed >= 0.15 && parsed <= 0.95) return parsed;
  }
  return DEFAULT_RATIO;
}

export default function SplitPane({
  chatPane,
  explorePane,
  collapsed = false,
  onToggleCollapse,
}: {
  chatPane: React.ReactNode;
  explorePane: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const [ratio, setRatio] = useState(readPersistedRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const persistRatio = useCallback((r: number) => {
    setRatio(r);
    try { window.localStorage.setItem(LS_KEY, r.toFixed(3)); } catch { /* noop */ }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalH = rect.height;
    if (totalH < MIN_PANE_PX * 2) return;
    const y = e.clientY - rect.top;
    const clamped = Math.max(MIN_PANE_PX, Math.min(totalH - MIN_PANE_PX, y));
    persistRatio(clamped / totalH);
  }, [persistRatio]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Cycle snap presets on double-click
  const onDoubleClick = useCallback(() => {
    const current = ratio;
    const closest = SNAP_PRESETS.reduce((prev, snap) =>
      Math.abs(snap - current) < Math.abs(prev - current) ? snap : prev
    );
    const idx = SNAP_PRESETS.indexOf(closest as typeof SNAP_PRESETS[number]);
    const next = SNAP_PRESETS[(idx + 1) % SNAP_PRESETS.length];
    persistRatio(next);
  }, [ratio, persistRatio]);

  const chatPct = collapsed ? 100 : ratio * 100;
  const explorePct = collapsed ? 0 : (1 - ratio) * 100;

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ display: "grid", gridTemplateRows: `${chatPct}% auto ${explorePct}%` }}
    >
      {/* Chat pane — own scroll container */}
      <div className="flex min-h-0 flex-col overflow-hidden">
        {chatPane}
      </div>

      {/* Resize handle */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          className="flex h-2 flex-shrink-0 cursor-row-resize items-center justify-center hover:bg-bm-border/20 active:bg-bm-border/30 transition"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
        >
          <div className="h-0.5 w-10 rounded-full bg-bm-border/40" />
        </div>
      )}

      {/* Explorer pane — own scroll container */}
      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-9 flex-shrink-0 items-center gap-2 border-t border-bm-border/30 px-4 text-xs text-bm-muted hover:bg-bm-surface/20 transition"
        >
          <span className="rotate-180">▾</span>
          <span>Explore</span>
        </button>
      ) : (
        <div className="min-h-0 overflow-y-auto">
          {explorePane}
        </div>
      )}
    </div>
  );
}
