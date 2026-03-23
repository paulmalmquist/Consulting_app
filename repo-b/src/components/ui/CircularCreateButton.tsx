"use client";

import { Plus } from "lucide-react";

interface CircularCreateButtonProps {
  tooltip: string;
  onClick: () => void;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function CircularCreateButton({
  tooltip,
  onClick,
  size = "md",
  disabled = false,
  className = "",
  "data-testid": dataTestId,
}: CircularCreateButtonProps) {
  const sizeClasses = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSize = size === "sm" ? 14 : 16;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={tooltip}
      title={tooltip}
      data-testid={dataTestId}
      className={`inline-flex items-center justify-center rounded-full bg-bm-accent text-white transition-all hover:bg-bm-accent/90 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 ${sizeClasses} ${className}`}
    >
      <Plus size={iconSize} strokeWidth={2.5} />
    </button>
  );
}
