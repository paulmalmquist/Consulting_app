import * as React from "react";
import { cn } from "@/lib/cn";

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full h-10 rounded-md bg-bm-surface/60 border border-bm-border/80 px-3 text-sm text-bm-text " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/70 focus-visible:border-bm-accent/60 " +
          "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
