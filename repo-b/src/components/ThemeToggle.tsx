"use client";

import { useEffect, useState } from "react";
import {
  applyThemeAccent,
  applyThemeMode,
  getStoredThemeAccent,
  getStoredThemeMode,
  persistThemeAccent,
  persistThemeMode,
  ThemeAccent,
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
  const [accent, setAccent] = useState<ThemeAccent>("teal");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredThemeMode();
    const storedAccent = getStoredThemeAccent();
    setMode(stored);
    setAccent(storedAccent);
    applyThemeMode(stored);
    applyThemeAccent(storedAccent);
  }, []);

  const setThemeMode = (next: ThemeMode) => {
    setMode(next);
    applyThemeMode(next);
    persistThemeMode(next);
  };

  const setThemeAccent = (next: ThemeAccent) => {
    setAccent(next);
    applyThemeAccent(next);
    persistThemeAccent(next);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        data-testid="theme-toggle"
        aria-label="Open appearance controls"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-bm-border/80 bg-bm-surface/70 text-bm-muted transition hover:border-bm-borderStrong hover:text-bm-text"
      >
        <ModeIcon mode={mode} />
      </button>

      <div
        className={cn(
          "pointer-events-none absolute right-0 top-12 z-50 w-64 translate-x-3 rounded-xl border border-bm-border/70 bg-bm-surface/95 p-4 opacity-0 shadow-bm-card backdrop-blur-md transition duration-200",
          open && "pointer-events-auto translate-x-0 opacity-100"
        )}
        role="dialog"
        aria-label="Theme controls"
      >
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Mode</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setThemeMode("dark")}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-medium transition",
                  mode === "dark"
                    ? "border-bm-accent/60 bg-bm-accent/15 shadow-[0_0_8px_hsl(var(--bm-accent-glow)/0.55)]"
                    : "border-bm-border/80 hover:border-bm-borderStrong"
                )}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setThemeMode("light")}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-medium transition",
                  mode === "light"
                    ? "border-bm-accent/60 bg-bm-accent/15 shadow-[0_0_8px_hsl(var(--bm-accent-glow)/0.55)]"
                    : "border-bm-border/80 hover:border-bm-borderStrong"
                )}
              >
                Light
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Accent</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setThemeAccent("teal")}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-medium transition",
                  accent === "teal"
                    ? "border-bm-accent/60 bg-bm-accent/15 shadow-[0_0_8px_hsl(var(--bm-accent-glow)/0.55)]"
                    : "border-bm-border/80 hover:border-bm-borderStrong"
                )}
              >
                Teal
              </button>
              <button
                type="button"
                onClick={() => setThemeAccent("blue")}
                className={cn(
                  "rounded-md border px-3 py-2 text-xs font-medium transition",
                  accent === "blue"
                    ? "border-bm-accent/60 bg-bm-accent/15 shadow-[0_0_8px_hsl(var(--bm-accent-glow)/0.55)]"
                    : "border-bm-border/80 hover:border-bm-borderStrong"
                )}
              >
                Blue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
