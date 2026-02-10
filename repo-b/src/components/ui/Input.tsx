import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full h-10 rounded-lg bg-bm-surface/60 border border-bm-border/80 px-3 text-sm text-bm-text " +
          "placeholder:text-bm-muted2 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/60 " +
          "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

