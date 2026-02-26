import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export type ActivityItem = {
  id: string;
  avatar?: string | React.ReactNode;
  summary: string;
  entityLink?: { label: string; href: string };
  timestamp: string;
};

export type ActivityFeedProps = {
  items: ActivityItem[];
  maxItems?: number;
  title?: string;
  className?: string;
};

function AvatarCircle({ avatar }: { avatar?: string | React.ReactNode }) {
  if (!avatar) {
    return (
      <div className="h-7 w-7 shrink-0 rounded-full bg-bm-surface2/60 border border-bm-border/50 flex items-center justify-center">
        <span className="text-[10px] text-bm-muted2">?</span>
      </div>
    );
  }
  if (typeof avatar === "string") {
    return (
      <div className="h-7 w-7 shrink-0 rounded-full bg-bm-surface2/60 border border-bm-border/50 flex items-center justify-center text-xs font-medium text-bm-muted">
        {avatar.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return <div className="h-7 w-7 shrink-0">{avatar}</div>;
}

export function ActivityFeed({
  items,
  maxItems,
  title = "Activity",
  className,
}: ActivityFeedProps) {
  const visible = maxItems ? items.slice(0, maxItems) : items;

  return (
    <div className={cn("space-y-3", className)}>
      <p className="bm-section-label">{title}</p>
      {visible.length === 0 ? (
        <p className="text-sm text-bm-muted2">No recent activity.</p>
      ) : (
        <div className="space-y-0">
          {visible.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 py-2.5 border-b border-bm-border/30 last:border-b-0"
            >
              <AvatarCircle avatar={item.avatar} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-bm-text leading-snug">{item.summary}</p>
                {item.entityLink && (
                  <Link
                    href={item.entityLink.href}
                    className="text-xs text-bm-accent hover:underline mt-0.5 inline-block"
                  >
                    {item.entityLink.label}
                  </Link>
                )}
              </div>
              <span className="shrink-0 font-mono text-[10px] text-bm-muted2 pt-0.5">
                {item.timestamp}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
