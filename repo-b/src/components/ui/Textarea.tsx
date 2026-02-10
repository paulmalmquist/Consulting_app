import * as React from "react";
import { cn } from "@/lib/cn";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg bg-bm-surface/60 border border-bm-border/80 px-3 py-2 text-sm text-bm-text " +
          "placeholder:text-bm-muted2 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/60 " +
          "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

