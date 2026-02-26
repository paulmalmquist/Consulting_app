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
};

export type InsightSection = {
  title: string;
  items: InsightItem[];
};

export type InsightRailProps = {
  sections: InsightSection[];
  className?: string;
};

export function InsightRail({ sections, className }: InsightRailProps) {
  return (
    <aside className={cn("space-y-5", className)}>
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="bm-section-label">{section.title}</p>
          {section.items.length === 0 ? (
            <p className="text-xs text-bm-muted2">No items.</p>
          ) : (
            <div className="space-y-1.5">
              {section.items.map((item) => {
                const sev = item.severity || "info";
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border border-bm-border/50 border-l-2 bg-bm-surface/20 px-3 py-2",
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
                    {item.action && (
                      <Link
                        href={item.action.href}
                        className="mt-1.5 inline-block text-xs text-bm-accent hover:underline"
                      >
                        {item.action.label}
                      </Link>
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
