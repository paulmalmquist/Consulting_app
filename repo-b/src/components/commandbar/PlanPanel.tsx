"use client";

import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { AssistantPlan } from "@/lib/commandbar/schemas";

function riskVariant(risk: AssistantPlan["riskLevel"]) {
  if (risk === "high") return "danger" as const;
  if (risk === "medium") return "warning" as const;
  return "success" as const;
}

export default function PlanPanel({
  plan,
  planning,
  onNeedConfirm,
  onReset,
  onClarificationChoice,
}: {
  plan: AssistantPlan | null;
  planning: boolean;
  onNeedConfirm: () => void;
  onReset: () => void;
  onClarificationChoice: (value: string) => void;
}) {
  return (
    <section className="border-b border-bm-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="bm-section-label">Plan</p>
        {plan ? <Badge variant={riskVariant(plan.riskLevel)}>Risk {plan.riskLevel}</Badge> : null}
      </div>

      {planning ? (
        <div className="mt-2 animate-pulse space-y-2 rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3">
          <div className="h-2 rounded bg-bm-surface/70" />
          <div className="h-2 rounded bg-bm-surface/60" />
          <div className="h-2 w-2/3 rounded bg-bm-surface/55" />
        </div>
      ) : null}

      {!planning && !plan ? (
        <p className="mt-2 text-sm text-bm-muted">
          Stage 1: Winston drafts a deterministic action plan from your request.
        </p>
      ) : null}

      {plan ? (
        <div className="mt-2 space-y-3 text-sm">
          <p className="text-bm-text">{plan.intentSummary}</p>

          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2">
            <p className="bm-section-label">Steps</p>
            <ol className="mt-2 space-y-2">
              {plan.steps.map((step, idx) => (
                <li key={step.id} className="rounded-md border border-bm-border/50 bg-bm-bg/40 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-bm-text">
                      {idx + 1}. {step.title}
                    </p>
                    <Badge variant={step.mutation ? "warning" : "success"}>
                      {step.mutation ? "Change" : "Read-only"}
                    </Badge>
                  </div>
                  {step.description ? <p className="mt-1 text-xs text-bm-muted">{step.description}</p> : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2">
            <p className="bm-section-label">Preview Diff</p>
            {plan.previewDiff.length ? (
              <div className="mt-2 space-y-1 font-mono text-xs">
                {plan.previewDiff.map((row) => (
                  <div
                    key={`${row.field}_${row.after || ""}`}
                    className="grid grid-cols-[130px_1fr_1fr] gap-2 rounded bg-bm-bg/45 px-2 py-1"
                  >
                    <span className="text-bm-muted">{row.field}</span>
                    <span className="text-bm-muted2">{row.before ?? "—"}</span>
                    <span className="text-bm-text">{row.after ?? "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-bm-muted">No structural changes previewed.</p>
            )}
          </div>

          {plan.clarification?.needed ? (
            <div className="rounded-lg border border-bm-warning/45 bg-bm-warning/10 p-2 text-xs text-bm-text">
              <p>{plan.clarification.reason || "Clarification is required before confirmation."}</p>
              {plan.clarification.options?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {plan.clarification.options.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onClarificationChoice(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onReset}>
              Reset
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onNeedConfirm}
              disabled={Boolean(plan.clarification?.needed)}
            >
              Continue to Confirm
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
