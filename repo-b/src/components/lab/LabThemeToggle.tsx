"use client";

import { useLabTheme, type LabTheme } from "@/components/lab/LabThemeProvider";
import { cn } from "@/lib/cn";

const OPTIONS: Array<{ value: LabTheme; label: string; icon: string }> = [
  { value: "system", label: "System", icon: "◐" },
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "☾" },
];

export default function LabThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useLabTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-xl border border-bm-border/70 bg-bm-surface/65 p-1 shadow-bm-card",
        className
      )}
      role="group"
      aria-label="Lab theme"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
              active
                ? "bg-bm-accent/20 text-bm-text border border-bm-accent/30"
                : "text-bm-muted hover:text-bm-text hover:bg-bm-surface2/55 border border-transparent"
            )}
            aria-pressed={active}
          >
            <span aria-hidden>{option.icon}</span>
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

