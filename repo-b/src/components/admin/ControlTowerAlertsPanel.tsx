"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import type { InsightSection } from "@/components/ui/InsightRail";

type Severity = "critical" | "warning" | "info";

const itemTone: Record<Severity, string> = {
  critical:
    "border-bm-danger/20 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.92),hsl(var(--bm-danger)/0.06))]",
  warning:
    "border-bm-warning/16 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.92),hsl(var(--bm-warning)/0.05))]",
  info: "border-bm-border/10 bg-bm-surface/75",
};

const titleTone: Record<Severity, string> = {
  critical: "text-bm-text",
  warning: "text-bm-text",
  info: "text-bm-muted",
};

const dotTone: Record<Severity, string> = {
  critical: "bg-bm-danger",
  warning: "bg-bm-warning",
  info: "bg-bm-muted2",
};

export function ControlTowerAlertsPanel({
  sections,
  className,
}: {
  sections: InsightSection[];
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "rounded-xl border border-bm-warning/12 bg-[linear-gradient(180deg,hsl(var(--bm-surface)/0.82),hsl(var(--bm-surface)/0.72))] p-5 shadow-[0_18px_34px_-30px_rgba(5,9,14,0.88)]",
        className
      )}
    >
      <div className="space-y-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-bm-muted2">Alerts</p>
        <h2 className="text-lg font-semibold text-bm-text">Operational Alerts</h2>
        <p className="text-sm leading-relaxed text-bm-muted">
          Supporting signals for follow-up after the core environment queue has been scanned.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {sections.map((section, sectionIndex) => (
          <section key={section.title} className={sectionIndex === 0 ? "space-y-3" : "space-y-3 opacity-80"}>
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{section.title}</p>
              {section.items.length === 0 ? (
                <p className="text-sm text-bm-muted">{section.emptyText || "No items."}</p>
              ) : null}
            </div>

            {section.items.length > 0 ? (
              <div className="space-y-3">
                {section.items.map((item) => {
                  const severity = item.severity || "info";
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-xl border px-4 py-3 transition-[background-color,border-color,transform] duration-panel hover:-translate-y-[1px] hover:bg-bm-surface/80",
                        itemTone[severity]
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotTone[severity])} />
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-sm font-medium leading-snug", titleTone[severity])}>{item.label}</p>
                          {item.detail ? (
                            <p className="mt-1 text-sm leading-relaxed text-bm-muted line-clamp-3">{item.detail}</p>
                          ) : null}
                          {item.action || item.onAction ? (
                            <div className="mt-3 flex items-center gap-4">
                              {item.action ? (
                                <Link
                                  href={item.action.href}
                                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-bm-accent transition-colors duration-panel hover:text-bm-text"
                                >
                                  {item.action.label}
                                </Link>
                              ) : null}
                              {item.onAction ? (
                                <button
                                  type="button"
                                  onClick={item.onAction.onClick}
                                  className="font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted transition-colors duration-panel hover:text-bm-text"
                                >
                                  {item.onAction.label}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </aside>
  );
}
