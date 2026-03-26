"use client";

import { useState, useRef, useEffect } from "react";
import {
  Lock,
  Unlock,
  Archive,
  ChevronRight,
  RefreshCw,
  GitCompare,
  Download,
  Loader2,
  ClipboardList,
  MoreHorizontal,
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { ReModel, ModelScenario, FundScenarioTab } from "./types";

const STATUS_DISPLAY: Record<string, { label: string; classes: string }> = {
  draft: {
    label: "Draft",
    classes: "bg-bm-accent/10 text-bm-accent border-bm-accent/30",
  },
  official_base_case: {
    label: "Official Base Case",
    classes: "bg-green-500/10 text-green-400 border-green-500/30",
  },
  archived: {
    label: "Archived",
    classes: "bg-bm-surface/40 text-bm-muted2 border-bm-border/50",
  },
};

const QUARTER_OPTIONS = (() => {
  const opts: string[] = [];
  const now = new Date();
  const year = now.getFullYear();
  for (let y = year - 2; y <= year + 1; y++) {
    for (let q = 1; q <= 4; q++) {
      opts.push(`${y}Q${q}`);
    }
  }
  return opts;
})();

function OverflowMenu({
  items,
}: {
  items: { label: string; icon: typeof Lock; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center rounded-lg border border-bm-border/50 p-1.5 text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-bm-border/50 bg-bm-surface/95 py-1 shadow-lg backdrop-blur-sm">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                onClick={() => { item.onClick(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-bm-muted2 hover:bg-bm-surface/50 hover:text-bm-text"
              >
                <Icon size={12} />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FundScenarioHeader({
  model,
  scenario,
  quarter,
  onQuarterChange,
  onStatusChange,
  onRecalculate,
  onTabChange,
  resultLoading,
  fundName,
  assetCount,
  investmentCount,
  jvCount,
  computedAt,
}: {
  model: ReModel;
  scenario: ModelScenario | null;
  quarter: string;
  onQuarterChange: (q: string) => void;
  onStatusChange: (status: string) => void;
  onRecalculate: () => void;
  onTabChange?: (tab: FundScenarioTab) => void;
  resultLoading: boolean;
  fundName: string | null;
  assetCount: number;
  investmentCount?: number;
  jvCount?: number;
  computedAt?: string | null;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const display = STATUS_DISPLAY[model.status] ?? STATUS_DISPLAY.draft;

  // Build overflow menu items based on status
  const overflowItems: { label: string; icon: typeof Lock; onClick: () => void }[] = [];
  if (model.status === "official_base_case") {
    overflowItems.push({ label: "Return to Draft", icon: Unlock, onClick: () => onStatusChange("draft") });
  }
  if (model.status !== "archived") {
    overflowItems.push({ label: "Archive Model", icon: Archive, onClick: () => setArchiveOpen(true) });
  }

  return (
    <>
      <div className="space-y-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-bm-muted2">
          <span>Models</span>
          <ChevronRight size={12} />
          <span>{model.name}</span>
          <ChevronRight size={12} />
          <span className="text-bm-text">{scenario?.name ?? "Base Case"}</span>
        </div>

        <div className="flex items-start justify-between">
          {/* Left: Title + metadata */}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{model.name}</h1>
              {/* Status badge */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border ${display.classes}`}
              >
                {model.status === "official_base_case" && <Lock size={10} />}
                {display.label}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-sm text-bm-muted2">
              {fundName && <span>{fundName}</span>}
              <span className="text-bm-border">|</span>
              <span>{quarter}</span>
              <span className="text-bm-border">|</span>
              <span>
                {investmentCount != null ? `${investmentCount} inv` : ""}
                {jvCount != null ? ` / ${jvCount} JV` : ""}
                {investmentCount != null ? " / " : ""}
                {assetCount} asset{assetCount !== 1 ? "s" : ""}
              </span>
              {computedAt && (
                <>
                  <span className="text-bm-border">|</span>
                  <span className="text-[11px] text-bm-muted">
                    Calc: {new Date(computedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Quarter picker */}
            <select
              value={quarter}
              onChange={(e) => onQuarterChange(e.target.value)}
              className="rounded-lg border border-bm-border/50 bg-bm-surface/10 px-2.5 py-1.5 text-xs text-bm-text outline-none focus:border-bm-border-strong/70"
            >
              {QUARTER_OPTIONS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>

            {/* Recalculate */}
            <button
              onClick={onRecalculate}
              disabled={resultLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text disabled:opacity-40"
            >
              {resultLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Recalculate
            </button>

            {/* Compare quick action */}
            {onTabChange && (
              <button
                onClick={() => onTabChange("compare")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
              >
                <GitCompare size={12} /> Compare
              </button>
            )}

            {/* Export */}
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
              title="Export scenario data"
            >
              <Download size={12} /> Export
            </button>

            {/* Audit quick action */}
            {onTabChange && (
              <button
                onClick={() => onTabChange("audit")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
              >
                <ClipboardList size={12} /> Audit
              </button>
            )}

            {/* Draft → Set as Official Base Case */}
            {model.status === "draft" && (
              <button
                onClick={() => setLockOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
              >
                <Lock size={12} /> Set as Official Base Case
              </button>
            )}

            {/* Overflow menu (Return to Draft, Archive) */}
            <OverflowMenu items={overflowItems} />
          </div>
        </div>
      </div>

      {/* Lock confirmation dialog */}
      <Dialog
        open={lockOpen}
        onOpenChange={setLockOpen}
        title="Set as Official Base Case"
        description="This will lock the model as the official base case. You can return it to draft later."
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setLockOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-bm-muted2 hover:bg-bm-surface/30"
            >
              Cancel
            </button>
            <button
              onClick={() => { onStatusChange("official_base_case"); setLockOpen(false); }}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
            >
              Confirm
            </button>
          </div>
        }
      >
        <p className="text-sm text-bm-muted2">
          Setting this model as official will mark it as the canonical base case for the fund.
        </p>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Model"
        description="Archive this model? It will no longer appear in the active list."
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setArchiveOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-bm-muted2 hover:bg-bm-surface/30"
            >
              Cancel
            </button>
            <button
              onClick={() => { onStatusChange("archived"); setArchiveOpen(false); }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              Archive
            </button>
          </div>
        }
      >
        <p className="text-sm text-bm-muted2">
          Archived models are preserved but hidden from the active model list.
        </p>
      </Dialog>
    </>
  );
}
