"use client";

import { useState } from "react";
import { Lock, Unlock, Archive, ChevronRight, LayoutDashboard } from "lucide-react";
import { useRepeBasePath } from "@/lib/repe-context";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { ReModel } from "./types";

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

export function ModelHeader({
  model,
  onStatusChange,
}: {
  model: ReModel;
  onStatusChange: (status: string) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const display = STATUS_DISPLAY[model.status] ?? STATUS_DISPLAY.draft;
  const basePath = useRepeBasePath();
  const fundId = model.primary_fund_id ?? model.fund_id;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-bm-muted2 mb-1">
            <span>Models</span>
            <ChevronRight size={12} />
            <span>{model.name}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{model.name}</h1>
          {model.description && (
            <p className="mt-1 text-sm text-bm-muted2">{model.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Fund Workspace link */}
          {fundId && (
            <a
              href={`${basePath}/models/${model.model_id}/fund-scenario`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-accent/30 bg-bm-accent/10 px-3 py-1.5 text-xs font-medium text-bm-accent hover:bg-bm-accent/20"
            >
              <LayoutDashboard size={12} /> Fund Workspace
            </a>
          )}

          {/* Status Badge */}
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

          {/* Official Base Case → Return to Draft */}
          {model.status === "official_base_case" && (
            <button
              onClick={() => onStatusChange("draft")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-xs text-bm-muted2 hover:bg-bm-surface/40 hover:text-bm-text"
            >
              <Unlock size={12} /> Return to Draft
            </button>
          )}

          {/* Archive (not available when already archived) */}
          {model.status !== "archived" && (
            <button
              onClick={() => setArchiveOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
            >
              <Archive size={12} /> Archive
            </button>
          )}
        </div>
      </div>

      {/* Lock Confirmation Dialog */}
      <Dialog
        open={lockOpen}
        onOpenChange={setLockOpen}
        title="Set as Official Base Case"
        description={`Lock "${model.name}" as the Official Base Case? This will prevent edits to scope and assumptions.`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setLockOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onStatusChange("official_base_case");
                setLockOpen(false);
              }}
              className="bg-green-600 text-white hover:bg-green-500"
            >
              Lock as Base Case
            </Button>
          </>
        }
      >
        <p className="text-sm text-bm-muted2">
          You can return to Draft later if changes are needed.
        </p>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Model"
        description={`Are you sure you want to archive "${model.name}"? Archived models become read-only and cannot be edited.`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                onStatusChange("archived");
                setArchiveOpen(false);
              }}
            >
              Archive
            </Button>
          </>
        }
      >
        <p className="text-sm text-bm-muted2">
          This action will lock the model and prevent further changes to scope, assumptions, and surgery overrides.
        </p>
      </Dialog>
    </>
  );
}
