"use client";

import { useEffect, useState } from "react";
import {
  applyThemeMode,
  getStoredThemeMode,
  persistThemeMode,
  ThemeMode
} from "@/lib/theme";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { cn } from "@/lib/cn";

type ThemeToggleProps = {
  className?: string;
  size?: "sm" | "md";
};

export default function ThemeToggle({ className, size = "sm" }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = getStoredThemeMode();
    setMode(stored);
    applyThemeMode(stored);
  }, []);

  const toggle = () => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyThemeMode(next);
    persistThemeMode(next);
  };

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label={`Switch to ${mode === "dark" ? "light" : "dark"} theme`}
      onClick={toggle}
      className={cn(
        buttonVariants({ variant: "secondary", size }),
        "min-w-[6.5rem]",
        className
      )}
    >
      {mode === "dark" ? "Light Mode" : "Dark Mode"}
    </button>
  );
}
