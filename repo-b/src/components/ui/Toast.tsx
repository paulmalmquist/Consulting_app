"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type ToastVariant = "default" | "success" | "warning" | "danger";

type ToastItem = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastCtx = {
  push: (t: Omit<ToastItem, "id">) => void;
};

const ToastContext = React.createContext<ToastCtx | undefined>(undefined);

function genId() {
  return `t_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const push = React.useCallback((t: Omit<ToastItem, "id">) => {
    const id = genId();
    const item: ToastItem = { id, ...t };
    setItems((prev) => [...prev, item]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="fixed z-[60] right-4 bottom-4 flex flex-col gap-2 w-[min(420px,calc(100vw-2rem))]"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "bm-glass rounded-2xl p-4 border",
              t.variant === "success" && "border-bm-success/35",
              t.variant === "warning" && "border-bm-warning/35",
              t.variant === "danger" && "border-bm-danger/35",
              t.variant === "default" && "border-bm-border/70"
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">{t.title}</div>
                {t.description ? (
                  <div className="text-sm text-bm-muted mt-1">{t.description}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-xs text-bm-muted hover:text-bm-text"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

