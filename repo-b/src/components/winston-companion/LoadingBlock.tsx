"use client";

import { cn } from "@/lib/cn";
import WinstonAvatar from "@/components/winston-companion/WinstonAvatar";

/**
 * Inline loading message shown in the chat thread while Winston processes.
 *
 * Displays a small animated bowtie icon with a progress message that
 * updates as SSE `progress` events arrive from the backend.
 */
export default function LoadingBlock({
  message,
  stage,
}: {
  message?: string;
  stage?: string;
}) {
  const displayMessage = message || "One moment...";

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="relative flex-shrink-0">
        <WinstonAvatar className="h-6 w-6 border-bm-border/30 bg-bm-surface/60" />
        <span className="absolute inset-0 rounded-full animate-[pulse_2s_ease-in-out_infinite] bg-bm-accent/15" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(
          "text-sm text-bm-muted animate-[fadeIn_0.3s_ease-out]",
          stage === "computing" && "text-bm-text",
        )}>
          {displayMessage}
        </p>
      </div>
    </div>
  );
}
