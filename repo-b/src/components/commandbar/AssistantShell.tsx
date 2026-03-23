"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export type AssistantStage = "plan" | "confirm" | "execute";

function stageCopy(stage: AssistantStage) {
  if (stage === "plan") return "Plan";
  if (stage === "confirm") return "Confirm";
  return "Execute";
}

function statusVariant(stage: AssistantStage) {
  if (stage === "plan") return "accent" as const;
  if (stage === "confirm") return "warning" as const;
  return "success" as const;
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )];
}

export default function AssistantShell({
  open,
  onClose,
  stage,
  authenticated,
  workspace,
  advancedOpen,
  onToggleAdvanced,
  leftPane,
  rightPane,
  showRightPane = true,
}: {
  open: boolean;
  onClose: () => void;
  stage: AssistantStage;
  authenticated: boolean | null;
  workspace: {
    env: string;
    business: string;
    route: string;
  };
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  showRightPane?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    lastActiveElementRef.current = document.activeElement as HTMLElement;
    // Focus the textarea (command input) if available, otherwise first focusable
    const textarea = panelRef.current?.querySelector<HTMLTextAreaElement>('textarea[data-testid="global-commandbar-input"]');
    if (textarea) {
      textarea.focus();
    } else {
      const focusables = focusableElements(panelRef.current);
      focusables[0]?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusableElements(panelRef.current);
      if (!elements.length) return;

      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lastActiveElementRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Winston command center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close Winston command center"
      />

      <div
        ref={panelRef}
        className="absolute bottom-0 right-0 h-[93vh] w-full max-w-[1500px] overflow-hidden rounded-t-2xl border border-bm-border/65 bg-bm-bg/95 shadow-bm-card md:bottom-4 md:right-4 md:h-[92vh] md:rounded-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,hsl(var(--bm-accent)/0.16),transparent_38%),radial-gradient(circle_at_20%_80%,hsl(var(--bm-accent)/0.08),transparent_32%)]" />
        <div className="relative z-10 flex h-full flex-col">
          <header className="border-b border-bm-border/60 px-4 py-2.5 md:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-bm-accent/30 bg-bm-accent/10">
                  <svg className="h-3.5 w-3.5 text-bm-accent" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.414 1.414M11.536 11.536l1.414 1.414M3.05 12.95l1.414-1.414M11.536 4.464l1.414-1.414"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h2 className="text-base font-semibold">Winston</h2>
                {showRightPane && <Badge variant={statusVariant(stage)}>{stageCopy(stage)}</Badge>}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleAdvanced}
                  aria-expanded={advancedOpen}
                  aria-controls="winston-advanced-drawer"
                  className="rounded-md p-1.5 text-bm-muted hover:text-bm-text hover:bg-bm-surface/60 transition-colors"
                  title={advancedOpen ? "Hide debug panel" : "Debug / diagnostics"}
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1a1 1 0 0 1 1 1v1.07A5.5 5.5 0 0 1 13 8.5V10l1 2H2l1-2V8.5A5.5 5.5 0 0 1 7 3.07V2a1 1 0 0 1 1-1zM5.5 13a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  type="button"
                  data-testid="global-commandbar-close"
                  onClick={onClose}
                  className="rounded-md p-1.5 text-bm-muted hover:text-bm-text hover:bg-bm-surface/60 transition-colors"
                  title="Close (Esc)"
                >
                  <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </header>

          <main className={cn(
            "grid min-h-0 flex-1 gap-3 overflow-hidden p-3 md:p-4",
            showRightPane ? "grid-cols-1 md:grid-cols-[1.25fr_1fr]" : "grid-cols-1 md:max-w-2xl md:mx-auto"
          )}>
            <section className={cn("min-h-0 overflow-hidden rounded-xl border border-bm-border/60 bg-bm-surface/25")}>{leftPane}</section>
            {showRightPane && (
              <section className={cn("min-h-0 overflow-hidden rounded-xl border border-bm-border/60 bg-bm-surface/25")}>{rightPane}</section>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
