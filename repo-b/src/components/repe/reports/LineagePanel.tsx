"use client";
import React from "react";

/* ── LineagePanel ─────────────────────────────────────────────────
   Small card showing model lineage metadata (model name, model_id,
   snapshot quarter, computed_at).
   ────────────────────────────────────────────────────────────────── */

import { GitBranch } from "lucide-react";

export interface LineageInfo {
  model_name: string;
  model_id: string;
  snapshot_quarter: string;
  computed_at: string;
}

interface LineagePanelProps {
  lineage: LineageInfo;
}

export default function LineagePanel({ lineage }: LineagePanelProps) {
  const computedDate = (() => {
    try {
      return new Date(lineage.computed_at).toLocaleString();
    } catch {
      return lineage.computed_at;
    }
  })();

  return (
    <div
      className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4"
      data-testid="lineage-panel"
    >
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={14} className="text-bm-muted2" />
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 font-medium">
          Data Lineage
        </h3>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-bm-muted2">Model Name</dt>
          <dd className="font-medium mt-0.5">{lineage.model_name}</dd>
        </div>
        <div>
          <dt className="text-xs text-bm-muted2">Model ID</dt>
          <dd className="font-mono text-xs mt-0.5 break-all">
            {lineage.model_id}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-bm-muted2">Snapshot Quarter</dt>
          <dd className="font-medium mt-0.5">{lineage.snapshot_quarter}</dd>
        </div>
        <div>
          <dt className="text-xs text-bm-muted2">Computed At</dt>
          <dd className="text-xs mt-0.5">{computedDate}</dd>
        </div>
      </dl>
    </div>
  );
}
