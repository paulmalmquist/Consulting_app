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
          "placeholder:text-bm-muted2 transition-[box-shadow,border-color] duration-[120ms] " +
          "focus-visible:outline-none focus-visible:shadow-[0_0_4px_hsl(var(--bm-accent)/0.3)] focus-visible:border-bm-accent/55 " +
          "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
