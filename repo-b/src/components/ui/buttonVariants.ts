import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/60 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-bm-accent text-bm-accentContrast shadow-bm-glow " +
    "hover:bg-bm-accent2 hover:shadow-bm-card",
  secondary:
    "bg-bm-surface/70 text-bm-text border border-bm-border/80 " +
    "hover:border-bm-borderStrong hover:bg-bm-surface2/70",
  ghost:
    "text-bm-text/90 hover:bg-bm-surface/55 hover:text-bm-text border border-transparent",
  destructive:
    "bg-bm-danger text-bm-accentContrast " +
    "hover:bg-bm-danger/90 shadow-bm-glow",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonVariants(opts?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}): string {
  const { variant = "primary", size = "md", className } = opts || {};
  return cn(base, variants[variant], sizes[size], className);
}

