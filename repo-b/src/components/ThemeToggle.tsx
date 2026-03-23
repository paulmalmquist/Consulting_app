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
    return <Sun className="h-4 w-4" data-testid="theme-icon-sun" strokeWidth={1.5} />;
  }
  return <Moon className="h-4 w-4" data-testid="theme-icon-moon" strokeWidth={1.5} />;
}

export default function ThemeToggle({ className }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>("dark");

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

  const nextMode: ThemeMode = mode === "light" ? "dark" : "light";
  const ariaLabel = mode === "light" ? "Switch to dark mode" : "Switch to light mode";

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label={ariaLabel}
      onClick={() => setThemeMode(nextMode)}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-bm-border/40 bg-bm-surface/40 text-bm-muted transition-[background-color,color,border-color] duration-150 hover:bg-bm-surface/20 hover:text-bm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-accent/40",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center transition-transform duration-150 ease-out",
          mode === "light" ? "rotate-0" : "-rotate-12"
        )}
      >
        <ModeIcon mode={mode} />
      </span>
    </button>
  );
}
