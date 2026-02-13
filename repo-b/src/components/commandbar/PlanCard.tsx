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
            <p className="mb-1 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Mutations</p>
            <p className="text-bm-text">{plan.mutations.length ? plan.mutations.join(", ") : "Read-only"}</p>
          </div>
        </div>

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
          <Button size="sm" onClick={onConfirm} disabled={Boolean(confirmDisabled)}>
            {confirmLabel || "Confirm & Run"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
