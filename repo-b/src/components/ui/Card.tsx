import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  variant = "default",
  hover = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "elevated" | "glass" | "danger" | "warning" | "success";
  hover?: boolean;
}) {
  const variants: Record<string, string> = {
    default:  "bg-bm-surface border-bm-border",
    elevated: "bg-bm-surface border-bm-border shadow-bm-md",
    glass:    "bm-glass",
    danger:   "bg-bm-danger-bg border-bm-danger-border",
    warning:  "bg-bm-warning-bg border-bm-warning-border",
    success:  "bg-bm-success-bg border-bm-success-border",
  };

  const hoverClass = hover
    ? "hover:border-bm-border-hi hover:bg-bm-surface-alt cursor-pointer"
    : "";

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors duration-200",
        variants[variant] ?? variants.default,
        hoverClass,
        className,
      )}
      {...props}
    />
  );
}

export function CardInteractive({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bm-glass-interactive rounded-lg cursor-pointer", className)} {...props} />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-0", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn("text-[1.1rem] font-semibold tracking-[-0.01em]", className)} {...props} />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-bm-muted mt-2", className)} {...props} />;
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
