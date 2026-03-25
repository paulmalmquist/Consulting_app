"use client";

import { useState } from "react";
import {
  Lock,
  Unlock,
  Archive,
  ChevronRight,
  RefreshCw,
  GitCompare,
  Download,
  Loader2,
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import type { ReModel, ModelScenario } from "./types";

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

export function FundScenarioHeader({
  model,
  scenario,
  quarter,
  onQuarterChange,
  onStatusChange,
  onRecalculate,
  resultLoading,
  fundName,
  assetCount,
}: {
  model: ReModel;
  scenario: ModelScenario | null;
  quarter: string;
  onQuarterChange: (q: string) => void;
  onStatusChange: (status: string) => void;
  onRecalculate: () => void;
  resultLoading: boolean;
  fundName: string | null;
  assetCount: number;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const display = STATUS_DISPLAY[model.status] ?? STATUS_DISPLAY.draft;

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
            <h1 className="text-2xl font-bold tracking-tight">{model.name}</h1>
            <div className="mt-1 flex items-center gap-3 text-sm text-bm-muted2">
              {fundName && <span>{fundName}</span>}
              <span className="text-bm-border">|</span>
              <span>Scenario: {scenario?.name ?? "Base Case"}</span>
              <span className="text-bm-border">|</span>
              <span>{assetCount} asset{assetCount !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Right: Status + actions */}
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

            {/* Status badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border ${display.classes}`}
            >
              {model.status === "official_base_case" && <Lock size={10} />}
              {display.label}
            </span>

            {/* Draft → Set as Official Base Case */}
            {model.status === "draft" && (
              <button
                onClick={() => setLockOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
              >
                <Lock size={12} /> Set as Official Base Case
              </button>
            )}

            {/* Official → Return to Draft */}
            {model.status === "official_base_case" && (
              <button
                onClick={() => onStatusChange("draft")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/40 hover:text-bm-text"
              >
                <Unlock size={12} /> Return to Draft
              </button>
            )}

            {/* Archive */}
            {model.status !== "archived" && (
              <button
                onClick={() => setArchiveOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/40 hover:text-bm-text"
              >
                <Archive size={12} /> Archive
              </button>
            )}
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
