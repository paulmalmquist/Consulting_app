import React from "react";

export interface WaterfallRunRow {
  runId: string;
  status: "draft" | "completed" | "locked";
}

interface WaterfallRunsProps {
  rows: WaterfallRunRow[];
}

export function WaterfallRuns({ rows }: WaterfallRunsProps) {
  return (
    <section data-testid="waterfall-runs">
      {rows.map((row) => (
        <div key={row.runId} data-testid="waterfall-run-row">
          <span>{row.runId}</span>
          <span data-testid={`waterfall-status-${row.runId}`}>{row.status}</span>
          <button data-testid={`waterfall-lock-${row.runId}`} disabled={row.status !== "completed"}>
            Lock Run
          </button>
        </div>
      ))}
    </section>
  );
}
