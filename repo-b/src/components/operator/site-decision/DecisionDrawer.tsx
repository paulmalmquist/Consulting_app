"use client";

import { useEffect } from "react";

export function DecisionDrawer({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-2xl rounded-t-2xl border border-white/10 bg-bm-bg p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="text-base font-semibold text-bm-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-bm-muted2 hover:text-bm-text"
          >
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-auto py-4">{children}</div>
        {footer ? (
          <div className="border-t border-white/10 pt-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
