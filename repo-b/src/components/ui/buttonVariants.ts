import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bm-ring/70 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-bm-accent to-bm-accent2 text-bm-accentContrast shadow-[0_0_0_1px_hsl(var(--bm-border)/0.06)] " +
    "hover:brightness-105 hover:scale-[1.02] hover:shadow-bm-glow active:scale-[0.99]",
  secondary:
    "bg-transparent text-bm-text border border-bm-border/80 " +
    "hover:border-bm-accent/60 hover:bg-bm-accent/10",
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
