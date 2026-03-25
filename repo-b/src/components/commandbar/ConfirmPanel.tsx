"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { AssistantPlan } from "@/lib/commandbar/schemas";

type PlanOverrides = {
  envId: string;
  businessId: string;
  name: string;
  industry: string;
  notes: string;
};

export default function ConfirmPanel({
  plan,
  stageActive,
  overrides,
  onOverrideChange,
  confirmText,
  onConfirmTextChange,
  confirming,
  onBack,
  onConfirmExecute,
}: {
  plan: AssistantPlan | null;
  stageActive: boolean;
  overrides: PlanOverrides;
  onOverrideChange: (key: keyof PlanOverrides, value: string) => void;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  confirming: boolean;
  onBack: () => void;
  onConfirmExecute: () => void;
}) {
  return (
    <section className="border-b border-bm-border/60 p-3">
      <p className="bm-section-label">Confirm</p>
      {!plan ? (
        <p className="mt-2 text-sm text-bm-muted">
          Stage 2: review exactly what will change, then explicitly confirm.
        </p>
      ) : (
        <div className="mt-2 space-y-3 text-sm">
          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2">
            <p className="bm-section-label">What Will Change</p>
            {plan.mutations.length ? (
              <ul className="mt-2 list-disc pl-5 text-bm-text">
                {plan.mutations.map((mutation) => (
                  <li key={mutation}>{mutation}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 rounded-md border border-bm-success/40 bg-bm-success/10 p-2 text-bm-text">
                No changes will be written. This run is read-only.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-bm-border/60 bg-bm-surface/25 p-2">
            <p className="bm-section-label">Targets</p>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input
                value={overrides.envId}
                onChange={(event) => onOverrideChange("envId", event.target.value)}
                placeholder="Environment ID"
                aria-label="Environment ID override"
              />
              <Input
                value={overrides.businessId}
                onChange={(event) => onOverrideChange("businessId", event.target.value)}
                placeholder="Business ID"
                aria-label="Business ID override"
              />
              <Input
                value={overrides.name}
                onChange={(event) => onOverrideChange("name", event.target.value)}
                placeholder="Name override"
                aria-label="Name override"
              />
              <Input
                value={overrides.industry}
                onChange={(event) => onOverrideChange("industry", event.target.value)}
                placeholder="Industry override"
                aria-label="Industry override"
              />
            </div>
            <Input
              className="mt-2"
              value={overrides.notes}
              onChange={(event) => onOverrideChange("notes", event.target.value)}
              placeholder="Notes"
              aria-label="Notes override"
            />
          </div>

          {plan.requiresDoubleConfirmation ? (
            <div className="rounded-lg border border-bm-danger/40 bg-bm-danger/10 p-2 text-xs">
              <p className="text-bm-text">
                High risk operation. Type <span className="font-mono">{plan.doubleConfirmationPhrase}</span> to continue.
              </p>
              <Input
                className="mt-2"
                value={confirmText}
                onChange={(event) => onConfirmTextChange(event.target.value)}
                placeholder={plan.doubleConfirmationPhrase || "DELETE"}
                aria-label="High risk confirmation text"
              />
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <Badge variant={stageActive ? "accent" : "default"}>{stageActive ? "Active" : "Ready"}</Badge>
            <p className="text-xs text-bm-muted">
              Confirmation token is required before Winston can execute this plan.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onBack}>
              Back to Plan
            </Button>
            <Button type="button" size="sm" onClick={onConfirmExecute} disabled={confirming}>
              {confirming ? "Starting..." : "Confirm and Execute"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
