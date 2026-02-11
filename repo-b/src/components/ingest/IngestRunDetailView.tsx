"use client";

import { useEffect, useState } from "react";
import { getIngestRun, IngestRun } from "@/lib/bos-api";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";

export default function IngestRunDetailView({ runId }: { runId: string }) {
  const [run, setRun] = useState<IngestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    getIngestRun(runId)
      .then((payload) => {
        if (!active) return;
        setRun(payload);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load run");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runId]);

  if (loading) {
    return <div className="h-40 rounded-lg border border-bm-border/70 bg-bm-surface/40 animate-pulse" />;
  }

  if (error || !run) {
    return <p className="text-sm text-bm-danger">{error || "Run not found"}</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-base">Run {run.id}</CardTitle>
          <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
              <p className="text-[10px] uppercase text-bm-muted2">Status</p>
              <p className="text-sm mt-1">{run.status}</p>
            </div>
            <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
              <p className="text-[10px] uppercase text-bm-muted2">Read</p>
              <p className="text-sm mt-1">{run.rows_read}</p>
            </div>
            <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
              <p className="text-[10px] uppercase text-bm-muted2">Valid</p>
              <p className="text-sm mt-1">{run.rows_valid}</p>
            </div>
            <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
              <p className="text-[10px] uppercase text-bm-muted2">Inserted</p>
              <p className="text-sm mt-1">{run.rows_inserted}</p>
            </div>
            <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
              <p className="text-[10px] uppercase text-bm-muted2">Updated</p>
              <p className="text-sm mt-1">{run.rows_updated}</p>
            </div>
            <div className="rounded-lg border border-bm-border/70 bg-bm-bg/20 p-2">
              <p className="text-[10px] uppercase text-bm-muted2">Rejected</p>
              <p className="text-sm mt-1">{run.rows_rejected}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Lineage</CardTitle>
          <pre className="text-xs mt-3 rounded-lg border border-bm-border/70 bg-bm-bg/20 p-3 overflow-auto">
            {JSON.stringify(run.lineage_json, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="text-sm uppercase tracking-[0.14em] text-bm-muted2">Errors</CardTitle>
          {run.errors.length === 0 ? (
            <p className="text-sm text-bm-success mt-3">No row-level errors recorded.</p>
          ) : (
            <div className="space-y-2 mt-3 max-h-72 overflow-auto">
              {run.errors.map((err, idx) => (
                <div key={`${err.error_code}-${idx}`} className="rounded-lg border border-bm-danger/25 bg-bm-danger/8 p-2">
                  <p className="text-xs text-bm-danger font-medium">
                    {err.error_code} • row {err.row_number || "-"}
                    {err.column_name ? ` • ${err.column_name}` : ""}
                  </p>
                  <p className="text-xs text-bm-muted mt-1">{err.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
