"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { CommandRun, PlanStep } from "@/lib/commandbar/types";

function statusVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "failed" || status === "cancelled") return "danger" as const;
  if (status === "running") return "accent" as const;
  return "default" as const;
}

export default function ExecutionTimeline({
  run,
  steps,
  onStop,
  logsOpen,
  onToggleLogs,
}: {
  run: CommandRun;
  steps: PlanStep[];
  onStop: () => void;
  logsOpen: boolean;
  onToggleLogs: () => void;
}) {
  return (
    <Card className="border border-bm-border/70 bg-bm-surface/35">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Execution Progress</CardTitle>
            <p className="mt-1 text-xs text-bm-muted">Run: {run.runId}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant(run.status)}>Status: {run.status}</Badge>
            {run.status === "running" ? (
              <Button size="sm" variant="secondary" onClick={onStop}>
                Stop
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="space-y-2">
          {steps.map((step, index) => {
            const result = run.stepResults.find((item) => item.stepId === step.id);
            const state = result?.status || "pending";
            return (
              <div
                key={step.id}
                className="rounded-lg border border-bm-border/70 bg-bm-surface/25 p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-bm-text">
                    {index + 1}. {step.title}
                  </p>
                  <Badge variant={statusVariant(state)}>{state}</Badge>
                </div>
                {result?.error ? (
                  <p className="mt-1 text-xs text-bm-danger">{result.error}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-2">
          <button
            type="button"
            onClick={onToggleLogs}
            className="text-xs text-bm-muted hover:text-bm-text"
          >
            {logsOpen ? "Hide logs" : "Show logs"}
          </button>
          {logsOpen ? (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-md bg-bm-bg/70 p-2 text-xs text-bm-muted">
              {run.logs.length ? (
                <ul className="space-y-1">
                  {run.logs.map((log, idx) => (
                    <li key={`${run.runId}_${idx}`}>{log}</li>
                  ))}
                </ul>
              ) : (
                <p>No logs yet.</p>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
