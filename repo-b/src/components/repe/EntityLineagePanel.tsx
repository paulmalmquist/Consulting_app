"use client";

import { Dialog } from "@/components/ui/Dialog";
import type { ReV2EntityLineageResponse } from "@/lib/bos-api";

function fmtValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return value.toLocaleString();
  }
  return value;
}

function tone(status: string): string {
  if (status === "missing_data" || status === "schema_error") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (status === "fallback" || status === "stale") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

function issueTone(severity: string): string {
  if (severity === "error") return "border-red-500/40 bg-red-500/10 text-red-200";
  if (severity === "warn") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-bm-border/60 bg-bm-surface/30 text-bm-text";
}

export function EntityLineagePanel({
  open,
  onOpenChange,
  title,
  lineage,
  loading,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  lineage: ReV2EntityLineageResponse | null;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Object-by-object lineage from rendered values back to persisted inputs and upstream rollups."
    >
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {loading ? (
          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            Loading lineage...
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {!loading && !error && lineage?.issues?.length ? (
          <div className="space-y-2">
            {lineage.issues.map((issue) => (
              <div
                key={`${issue.code}-${issue.message}`}
                className={`rounded-lg border p-3 text-sm ${issueTone(issue.severity)}`}
              >
                <p className="font-medium">{issue.code}</p>
                <p className="mt-1">{issue.message}</p>
              </div>
            ))}
          </div>
        ) : null}
        {!loading && !error && !lineage ? (
          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
            No lineage data available.
          </div>
        ) : null}
        {!loading && !error && lineage ? (
          <div className="space-y-3">
            {lineage.widgets.map((widget) => (
              <div key={widget.widget_key} className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{widget.label}</p>
                    <p className="text-xs text-bm-muted2">{widget.widget_key}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] ${tone(widget.status ?? "")}`}>
                    {widget.status?.replace("_", " ") ?? "unknown"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-bm-muted2 sm:grid-cols-2">
                  <div>
                    <p className="uppercase tracking-[0.08em]">Value</p>
                    <p className="mt-1 text-sm text-bm-text">{fmtValue(widget.display_value)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.08em]">Endpoint</p>
                    <p className="mt-1 break-all">{widget.endpoint}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.08em]">Source</p>
                    <p className="mt-1 break-all">{widget.source_table}.{widget.source_column}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.08em]">Row Ref</p>
                    <p className="mt-1 break-all">{widget.source_row_ref || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.08em]">Run ID</p>
                    <p className="mt-1 break-all">{widget.run_id || "—"}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-[0.08em]">Inputs Hash</p>
                    <p className="mt-1 break-all">{widget.inputs_hash || "—"}</p>
                  </div>
                </div>
                {widget.computed_from.length ? (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-bm-muted2">Computed From</p>
                    <p className="mt-1 text-xs text-bm-muted2">{widget.computed_from.join(" -> ")}</p>
                  </div>
                ) : null}
                {widget.propagates_to.length ? (
                  <div className="mt-2">
                    <p className="text-[11px] uppercase tracking-[0.08em] text-bm-muted2">Propagates To</p>
                    <p className="mt-1 text-xs text-bm-muted2">{widget.propagates_to.join(", ")}</p>
                  </div>
                ) : null}
                {widget.notes.length ? (
                  <div className="mt-2 rounded-md border border-bm-border/50 bg-bm-surface/30 p-2 text-xs text-bm-muted2">
                    {widget.notes.join(" ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
