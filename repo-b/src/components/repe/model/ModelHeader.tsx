"use client";

import { useState } from "react";
import { CheckCircle2, Archive, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import type { ReModel } from "./types";

export function ModelHeader({
  model,
  onStatusChange,
}: {
  model: ReModel;
  onStatusChange: (status: string) => void;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);

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
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
              model.status === "approved"
                ? "bg-green-500/10 text-green-400 border border-green-500/30"
                : model.status === "archived"
                  ? "bg-bm-surface/40 text-bm-muted2 border border-bm-border/50"
                  : "bg-bm-accent/10 text-bm-accent border border-bm-accent/30"
            }`}
          >
            {model.status}
          </span>
          {model.status === "draft" && (
            <button
              onClick={() => onStatusChange("approved")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
            >
              <CheckCircle2 size={12} /> Approve
            </button>
          )}
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
