import * as React from "react";
import { cn } from "@/lib/cn";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md bg-bm-surface/85 border border-bm-border/70 px-3 py-2 text-sm text-bm-text " +
          "placeholder:text-bm-muted2 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/60 focus-visible:border-bm-accent/55 " +
          "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
