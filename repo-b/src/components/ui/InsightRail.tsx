import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Severity = "critical" | "warning" | "info";

const severityBorder: Record<Severity, string> = {
  critical: "border-l-bm-danger",
  warning: "border-l-bm-warning",
  info: "border-l-bm-accent",
};

const severityDot: Record<Severity, string> = {
  critical: "bg-bm-danger",
  warning: "bg-bm-warning",
  info: "bg-bm-accent",
};

export type InsightItem = {
  id: string;
  severity?: Severity;
  label: string;
  detail?: string;
  action?: { label: string; href: string };
  onAction?: { label: string; onClick: () => void };
};

export type InsightSection = {
  title: string;
  items: InsightItem[];
  emptyText?: string;
};

export type InsightRailProps = {
  sections: InsightSection[];
  className?: string;
};

export function InsightRail({ sections, className }: InsightRailProps) {
  return (
    <aside className={cn("space-y-3", className)}>
      {sections.map((section) => (
        <div key={section.title} className="rounded-lg border border-bm-border/20 bg-bm-surface/40 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            {section.title}
          </p>
          {section.items.length === 0 ? (
            <p className="mt-2 text-xs text-bm-muted2">{section.emptyText || "No items."}</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {section.items.map((item) => {
                const sev = item.severity || "info";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border border-bm-border/20 border-l-2 bg-transparent px-3 py-2.5 transition-colors duration-100 hover:bg-bm-surface/20",
                      severityBorder[sev]
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", severityDot[sev])} />
                      <span className="text-sm text-bm-text font-medium truncate">
                        {item.label}
                      </span>
                    </div>
                    {item.detail && (
                      <p className="mt-1 text-xs text-bm-muted2 line-clamp-2">{item.detail}</p>
                    )}
                    {(item.action || item.onAction) && (
                      <div className="mt-1.5 flex items-center gap-3">
                        {item.action && (
                          <Link
                            href={item.action.href}
                            className="inline-block font-mono text-[11px] text-bm-accent hover:underline"
                          >
                            {item.action.label}
                          </Link>
                        )}
                        {item.onAction && (
                          <button
                            type="button"
                            onClick={item.onAction.onClick}
                            className="inline-block font-mono text-[11px] text-bm-muted hover:text-bm-text hover:underline"
                          >
                            {item.onAction.label}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </aside>
  );
}
