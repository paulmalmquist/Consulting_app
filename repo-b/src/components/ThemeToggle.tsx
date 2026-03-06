"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
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
    return <Sun className="h-4 w-4" strokeWidth={1.5} />;
  }
  return <Moon className="h-4 w-4" strokeWidth={1.5} />;
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-bm-border/40 bg-bm-surface/40 text-bm-muted transition-colors duration-100 hover:bg-bm-surface/20 hover:text-bm-text"
      >
        <ModeIcon mode={mode} />
      </button>

      <div
        className={cn(
          "pointer-events-none absolute right-0 top-10 z-50 w-48 translate-x-2 rounded-lg border border-bm-border/20 bg-bm-surface/95 p-3 opacity-0 backdrop-blur-sm transition-[transform,opacity] duration-100",
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
              "rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-100",
              mode === "dark"
                ? "border-bm-accent/55 bg-bm-accent/12 text-bm-text"
                : "border-bm-border/30 text-bm-muted hover:bg-bm-surface/20 hover:text-bm-text"
            )}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setThemeMode("light")}
            className={cn(
              "rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-100",
              mode === "light"
                ? "border-bm-accent/55 bg-bm-accent/12 text-bm-text"
                : "border-bm-border/30 text-bm-muted hover:bg-bm-surface/20 hover:text-bm-text"
            )}
          >
            Light
          </button>
        </div>
      </div>
    </div>
  );
}
