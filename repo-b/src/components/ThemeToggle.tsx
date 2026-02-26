"use client";

import { useEffect, useState } from "react";
import {
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode,
  ThemeMode
} from "@/lib/theme";
import { cn } from "@/lib/cn";

type ThemeToggleProps = {
  className?: string;
};

function ModeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.9 4.9 1.4 1.4" />
        <path d="m17.7 17.7 1.4 1.4" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m4.9 19.1 1.4-1.4" />
        <path d="m17.7 6.3 1.4-1.4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3c0 0 0 0 0 0A7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>("dark");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredThemeMode();
    setMode(stored);
    applyThemeMode(stored);
  }, []);

  const setThemeMode = (next: ThemeMode) => {
    setMode(next);
    applyThemeMode(next);
    persistThemeMode(next);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        data-testid="theme-toggle"
        aria-label="Toggle appearance"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-bm-border/70 bg-bm-surface/85 text-bm-muted transition-[transform,box-shadow] duration-[120ms] hover:-translate-y-[1px] hover:text-bm-text"
      >
        <ModeIcon mode={mode} />
      </button>

      <div
        className={cn(
          "pointer-events-none absolute right-0 top-12 z-50 w-48 translate-x-3 rounded-lg border border-bm-border/70 bg-bm-surface/95 p-4 opacity-0 shadow-bm-card backdrop-blur-sm transition-[transform,opacity] duration-[120ms]",
          open && "pointer-events-auto translate-x-0 opacity-100"
        )}
        role="dialog"
        aria-label="Theme controls"
      >
        <p className="bm-section-label">Mode</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setThemeMode("dark")}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium transition-[box-shadow] duration-[120ms]",
              mode === "dark"
                ? "border-bm-accent/55 bg-bm-accent/12 shadow-bm-glow"
                : "border-bm-border/80 hover:bg-bm-surface/40"
            )}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setThemeMode("light")}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium transition-[box-shadow] duration-[120ms]",
              mode === "light"
                ? "border-bm-accent/55 bg-bm-accent/12 shadow-bm-glow"
                : "border-bm-border/80 hover:bg-bm-surface/40"
            )}
          >
            Light
          </button>
        </div>
      </div>
    </div>
  );
}
