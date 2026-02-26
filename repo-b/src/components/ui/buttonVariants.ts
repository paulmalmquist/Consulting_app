import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[transform,box-shadow] duration-[120ms] " +
  "focus-visible:outline-none focus-visible:shadow-[0_0_4px_hsl(var(--bm-accent)/0.3)] focus-visible:ring-1 focus-visible:ring-bm-ring/50 " +
  "disabled:opacity-50 disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-bm-accent text-bm-accentContrast shadow-[0_0_0_1px_hsl(var(--bm-accent)/0.22),0_8px_18px_-14px_rgba(5,9,14,0.72)] " +
    "hover:-translate-y-[2px] hover:shadow-[0_0_0_1px_hsl(var(--bm-accent)/0.3),0_14px_24px_-16px_rgba(5,9,14,0.75)] active:translate-y-0",
  secondary:
    "bg-transparent text-bm-text border border-bm-border/80 " +
    "hover:border-bm-accent/55 hover:-translate-y-[1px]",
  ghost:
    "text-bm-text/90 border border-transparent hover:bg-bm-surface/40",
  destructive:
    "bg-bm-danger text-bm-accentContrast shadow-[0_0_0_1px_hsl(var(--bm-danger)/0.28),0_8px_18px_-14px_rgba(5,9,14,0.7)] " +
    "hover:-translate-y-[2px] hover:shadow-[0_0_0_1px_hsl(var(--bm-danger)/0.3),0_14px_24px_-16px_rgba(5,9,14,0.75)] active:translate-y-0",
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
