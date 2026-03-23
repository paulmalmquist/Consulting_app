type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonVariantOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export function buttonVariants(options: ButtonVariantOptions = {}): string {
  const variant = options.variant ?? "primary";
  const size = options.size ?? "md";

  const base =
    "inline-flex items-center justify-center rounded-lg border font-medium transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";
  const variants: Record<ButtonVariant, string> = {
    primary: "border-indigo-600 bg-indigo-600 px-4 text-white hover:bg-indigo-500",
    secondary:
      "border-bm-border/70 bg-white px-4 text-bm-text hover:bg-gray-50",
    ghost: "border-transparent bg-transparent px-3 text-bm-text hover:bg-gray-100",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "h-9 py-2 text-sm",
    md: "h-10 py-2 text-sm",
  };

  return [base, variants[variant], sizes[size], options.className]
    .filter(Boolean)
    .join(" ");
}
