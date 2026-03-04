"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";

export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "relative h-full w-full flex flex-col bm-glass shadow-bm-card",
          width,
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-bm-border/50 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[1.25rem] font-semibold leading-tight tracking-[-0.01em] truncate">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-sm text-bm-muted mt-1 truncate">{subtitle}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {/* Footer */}
        {footer ? (
          <div className="border-t border-bm-border/50 px-6 py-3 flex justify-end gap-2">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
