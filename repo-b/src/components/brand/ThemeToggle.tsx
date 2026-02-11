"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Theme = "system" | "light" | "dark";
type Resolved = "light" | "dark";

const STORAGE_KEY = "theme";

function getSystemTheme(): Resolved {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [systemTheme, setSystemTheme] = useState<Resolved>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
    setSystemTheme(getSystemTheme());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  // Avoid hydration mismatch — render nothing on server
  if (!mounted) {
    return <div className={cn("h-9 w-[156px]", className)} />;
  }

  const options: Array<{ value: Theme; icon: string; label: string }> = [
    { value: "system", icon: "◐", label: "Auto" },
    { value: "light", icon: "☀", label: "Light" },
    { value: "dark", icon: "☾", label: "Dark" },
  ];

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-bm-border/70 bg-bm-surface/65 p-1",
        className
      )}
      role="group"
      aria-label="Theme"
      data-testid="theme-toggle"
    >
      {options.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => setTheme(o.value)}
            aria-label={`${o.label} theme`}
            data-testid={`theme-${o.value}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
              active
                ? "bg-bm-accent/20 text-bm-text border border-bm-accent/30"
                : "text-bm-muted hover:text-bm-text hover:bg-bm-surface2/55 border border-transparent"
            )}
            aria-pressed={active}
          >
            <span aria-hidden>{o.icon}</span>
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
