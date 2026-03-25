"use client";

import { useState } from "react";
import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReV2EntityLineageResponse,
} from "@/lib/bos-api";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";

interface Props {
  assetId: string;
  quarter: string;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  lineage: ReV2EntityLineageResponse | null;
  assetCreatedAt?: string;
}

export default function AuditSection({
  assetId,
  quarter,
  financialState,
  periods,
  lineage,
  assetCreatedAt,
}: Props) {
  const [lineageOpen, setLineageOpen] = useState(false);

  return (
    <div className="space-y-4" data-testid="asset-audit-section">
      {/* Runs & Audit Trail */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
            Runs &amp; Audit Trail
          </h3>
          <button
            type="button"
            onClick={() => setLineageOpen(true)}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
          >
            View Lineage
          </button>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
            <p className="font-medium">Asset Created</p>
            <p className="text-xs text-bm-muted2">
              {assetCreatedAt?.slice(0, 19).replace("T", " ") || "—"}
            </p>
          </div>
          {financialState && (
            <>
              <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
                <p className="font-medium">Latest Quarter State</p>
                <p className="text-xs text-bm-muted2">
                  Quarter: {financialState.quarter} &middot; Run:{" "}
                  {financialState.run_id?.slice(0, 8) || "—"}
                </p>
                <p className="text-xs text-bm-muted2">
                  Inputs Hash: {financialState.inputs_hash || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
                <p className="font-medium">Quarter State Count</p>
                <p className="text-xs text-bm-muted2">
                  {periods.length} quarters with data
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Asset Lineage \u00B7 ${quarter}`}
        lineage={lineage}
      />
    </div>
  );
}
