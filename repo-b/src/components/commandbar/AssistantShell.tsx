"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    lastActiveElementRef.current = document.activeElement as HTMLElement;
    const focusables = focusableElements(panelRef.current);
    focusables[0]?.focus();

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
        className="absolute bottom-0 right-0 h-[93vh] w-full max-w-[1100px] overflow-hidden rounded-t-2xl border border-bm-border/65 bg-bm-bg/95 shadow-bm-card md:bottom-4 md:right-4 md:h-[92vh] md:rounded-2xl"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,hsl(var(--bm-accent)/0.16),transparent_38%),radial-gradient(circle_at_20%_80%,hsl(var(--bm-accent)/0.08),transparent_32%)]" />
        <div className="relative z-10 flex h-full flex-col">
          <header className="border-b border-bm-border/60 px-4 py-3 md:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="bm-section-label">Winston Assistant</p>
                <h2 className="mt-1 text-lg font-semibold">Command Center</h2>
                <p className="mt-1 text-xs text-bm-muted">
                  {authenticated === false
                    ? "Sign in to run operations. Plans remain view-only until authentication is restored."
                    : "Plan, confirm, and execute with a full audit trail."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(stage)}>{stageCopy(stage)}</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onToggleAdvanced}
                  aria-expanded={advancedOpen}
                  aria-controls="winston-advanced-drawer"
                >
                  {advancedOpen ? "Hide Advanced" : "Advanced / Debug"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="global-commandbar-close"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
              <div className="rounded-lg border border-bm-border/65 bg-bm-surface/35 px-3 py-2">
                <p className="bm-section-label">Security</p>
                <p className="mt-1 text-bm-muted">
                  Every action requires an explicit confirmation before execution.
                </p>
              </div>
              <div className="rounded-lg border border-bm-border/65 bg-bm-surface/35 px-3 py-2">
                <p className="bm-section-label">Workspace</p>
                <p className="mt-1 text-bm-muted">
                  Env: <span className="text-bm-text">{workspace.env}</span> · Business:{" "}
                  <span className="text-bm-text">{workspace.business}</span> · Route:{" "}
                  <span className="text-bm-text">{workspace.route}</span>
                </p>
              </div>
            </div>
          </header>

          <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 md:grid-cols-[1.25fr_1fr] md:p-4">
            <section className={cn("min-h-0 overflow-hidden rounded-xl border border-bm-border/60 bg-bm-surface/25")}>{leftPane}</section>
            <section className={cn("min-h-0 overflow-hidden rounded-xl border border-bm-border/60 bg-bm-surface/25")}>{rightPane}</section>
          </main>
        </div>
      </div>
    </div>
  );
}
