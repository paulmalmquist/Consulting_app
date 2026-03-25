"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { CommandRun, ExecutionPlan } from "@/lib/commandbar/types";
import type { AssistantPlan } from "@/lib/commandbar/schemas";

function statusVariant(status: CommandRun["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "running" || status === "pending") return "accent" as const;
  if (status === "needs_clarification" || status === "cancelled") return "warning" as const;
  return "danger" as const;
}

function stepVariant(status: string) {
  if (status === "completed") return "success" as const;
  if (status === "running" || status === "pending") return "accent" as const;
  if (status === "cancelled" || status === "skipped") return "warning" as const;
  return "danger" as const;
}

function statusText(status: CommandRun["status"]) {
  if (status === "completed") return "Execution complete.";
  if (status === "running") return "Winston is executing and streaming logs.";
  if (status === "pending") return "Execution queued.";
  if (status === "failed") return "Execution failed.";
  if (status === "needs_clarification") return "Execution paused for clarification.";
  if (status === "cancelled") return "Execution cancelled.";
  return "Execution blocked.";
}

export default function ExecutePanel({
  plan,
  run,
  running,
  onCancel,
  onRetry,
  onCopySummary,
}: {
  plan: AssistantPlan | ExecutionPlan | null;
  run: CommandRun | null;
  running: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onCopySummary: () => void;
}) {
  const openLink = run?.verification?.flatMap((item) => item.links || [])[0];

  return (
    <section className="min-h-0 flex-1 overflow-hidden p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="bm-section-label">Execute</p>
        {run ? <Badge variant={statusVariant(run.status)}>{run.status.replace("_", " ")}</Badge> : null}
      </div>

      {!run ? (
        <p className="mt-2 text-sm text-bm-muted">
          Stage 3: execution starts only after confirmation and is fully auditable.
        </p>
      ) : (
        <div className="mt-2 flex h-[calc(100%-1.75rem)] min-h-0 flex-col space-y-3 text-sm">
          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2">
            <p className="text-bm-text">{statusText(run.status)}</p>
            <p className="mt-1 text-xs text-bm-muted font-mono">Run ID: {run.runId}</p>
          </div>

          {plan ? (
            <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-2">
              <p className="bm-section-label">Step Status</p>
              <ul className="mt-2 space-y-1">
                {plan.steps.map((step, idx) => {
                  const result = run.stepResults.find((item) => item.stepId === step.id);
                  const label = result?.status || "pending";
                  return (
                    <li key={step.id} className="flex items-center justify-between gap-2 rounded bg-bm-bg/45 px-2 py-1 text-xs">
                      <span className="text-bm-text">
                        {idx + 1}. {step.title}
                      </span>
                      <Badge variant={stepVariant(label)}>{label}</Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 rounded-lg border border-bm-border/60 bg-bm-bg/45 p-2">
            <p className="bm-section-label">Streaming Logs</p>
            <div className="mt-2 h-full max-h-[160px] overflow-y-auto text-xs text-bm-muted">
              {run.logs.length ? (
                <ul className="space-y-1" data-testid="execute-logs">
                  {run.logs.map((line, idx) => (
                    <li key={`${run.runId}_${idx}`} className="font-mono">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No logs yet.</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {running ? (
              <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
                Stop Run
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              Retry
            </Button>
            <Button type="button" size="sm" onClick={onCopySummary}>
              Copy Summary
            </Button>
            {openLink ? (
              <a
                href={openLink.href}
                className="inline-flex h-8 items-center rounded-md border border-bm-border/70 px-3 text-xs hover:bg-bm-surface/55"
              >
                {openLink.label}
              </a>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
