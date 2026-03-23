"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { ExecutionPlan } from "@/lib/commandbar/types";

type PlanEdits = {
  envId: string;
  businessId: string;
  name: string;
  industry: string;
  notes: string;
};

export default function PlanCard({
  plan,
  onConfirm,
  onCancel,
  onChooseClarification,
  onToggleEdit,
  editing,
  edits,
  onEditChange,
  confirmLabel,
  confirmDisabled,
}: {
  plan: ExecutionPlan;
  onConfirm: () => void;
  onCancel: () => void;
  onChooseClarification: (value: string) => void;
  onToggleEdit: () => void;
  editing: boolean;
  edits: PlanEdits;
  onEditChange: (key: keyof PlanEdits, value: string) => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}) {
  const riskVariant =
    plan.risk === "high" ? "danger" : plan.risk === "medium" ? "warning" : "success";

  return (
    <Card className="border border-bm-border/70 bg-bm-surface/35">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Draft Plan Ready</CardTitle>
            <p className="mt-1 text-sm text-bm-muted">{plan.intentSummary}</p>
          </div>
          <Badge variant={riskVariant}>Risk: {plan.risk.toUpperCase()}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Operation</p>
            <p className="text-bm-text">{plan.operationName || "unknown"}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Risk + Mutations</p>
            <p className="text-bm-text">
              {plan.risk.toUpperCase()} · {plan.mutations.length ? plan.mutations.join(", ") : "Read-only"}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
            Proposed Actions
          </p>
          <ul className="space-y-1 text-sm text-bm-text">
            {plan.steps.map((step, index) => (
              <li key={step.id}>
                {index + 1}. {step.title}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Impacted</p>
            <p className="text-bm-text">{plan.impactedEntities.join(", ") || "none"}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Target</p>
            <p className="text-bm-text">
              {plan.target?.envName || "n/a"}
              {plan.target?.envId ? ` (${plan.target.envId})` : ""}
            </p>
          </div>
        </div>

        {plan.operationParams ? (
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-2 text-xs text-bm-muted">
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Parameters</p>
            <pre className="overflow-x-auto whitespace-pre-wrap text-bm-text">
              {JSON.stringify(plan.operationParams, null, 2)}
            </pre>
          </div>
        ) : null}

        {plan.target?.envName || plan.target?.envId ? (
          <div className="rounded-lg border border-bm-border/70 bg-bm-surface/20 p-2 text-xs text-bm-muted">
            <p>
              Target environment:{" "}
              <span className="text-bm-text">
                {plan.target?.envName || "unknown"}{" "}
                {plan.target?.envId ? `(${plan.target.envId})` : ""}
              </span>
            </p>
            {plan.intent.action === "delete" ? (
              <p className="mt-1 text-bm-danger">
                Endpoint: <span className="font-mono">DELETE /api/v1/environments/{plan.target?.envId || "{envId}"}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {plan.clarification?.needed ? (
          <div className="rounded-lg border border-bm-warning/40 bg-bm-warning/10 p-2 text-sm text-bm-text">
            <p>{plan.clarification.reason || "This command needs clarification before execution."}</p>
            {plan.clarification.options?.length ? (
              <div className="mt-2 space-y-2">
                {plan.clarification.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="block w-full rounded-md border border-bm-border/70 bg-bm-bg/40 px-2 py-1 text-left text-xs text-bm-text hover:bg-bm-surface/60"
                    onClick={() => onChooseClarification(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <div className="space-y-2 rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3">
            <p className="text-xs text-bm-muted">Edit plan parameters before confirmation.</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input
                value={edits.name}
                onChange={(event) => onEditChange("name", event.target.value)}
                placeholder="Environment/Business name"
              />
              <Input
                value={edits.industry}
                onChange={(event) => onEditChange("industry", event.target.value)}
                placeholder="Industry"
              />
              <Input
                value={edits.envId}
                onChange={(event) => onEditChange("envId", event.target.value)}
                placeholder="Environment ID"
              />
              <Input
                value={edits.businessId}
                onChange={(event) => onEditChange("businessId", event.target.value)}
                placeholder="Business ID"
              />
            </div>
            <Input
              value={edits.notes}
              onChange={(event) => onEditChange("notes", event.target.value)}
              placeholder="Notes"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onToggleEdit}>
            {editing ? "Done Editing" : "Edit Plan"}
          </Button>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          {!plan.clarification?.needed ? (
            <Button size="sm" onClick={onConfirm} disabled={Boolean(confirmDisabled)}>
              {confirmLabel || "Confirm & Run"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
