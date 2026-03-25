"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPdsProject } from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";

const STEPS = ["Basic Info", "Budget Setup", "Team", "Review"] as const;
const CSI_TEMPLATE = [
  { cost_code: "01", line_label: "General Conditions", allocation: 0.12 },
  { cost_code: "02", line_label: "Structural", allocation: 0.28 },
  { cost_code: "03", line_label: "MEP", allocation: 0.35 },
  { cost_code: "04", line_label: "Interiors / Finishes", allocation: 0.25 },
] as const;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function NewPdsProjectPage() {
  const router = useRouter();
  const { envId, businessId } = useDomainEnv();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_code: "",
    name: "",
    description: "",
    sector: "office",
    project_type: "fit-out",
    stage: "planning",
    project_manager: "",
    start_date: "",
    target_end_date: "",
    approved_budget: "",
    contingency_budget: "",
    currency_code: "USD",
    team_notes: "",
  });

  const baselineLines = useMemo(() => {
    const total = Number(form.approved_budget || 0);
    return CSI_TEMPLATE.map((line) => ({
      cost_code: line.cost_code,
      line_label: line.line_label,
      approved_amount: total > 0 ? (total * line.allocation).toFixed(2) : "0",
    }));
  }, [form.approved_budget]);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const project = await createPdsProject({
        env_id: envId,
        business_id: businessId || undefined,
        project_code: form.project_code || undefined,
        name: form.name,
        description: form.description || undefined,
        sector: form.sector,
        project_type: form.project_type,
        stage: form.stage,
        status: "active",
        project_manager: form.project_manager || undefined,
        start_date: form.start_date || undefined,
        target_end_date: form.target_end_date || undefined,
        approved_budget: form.approved_budget || 0,
        contingency_budget: form.contingency_budget || 0,
        currency_code: form.currency_code,
        baseline_period: currentPeriod(),
        baseline_lines: baselineLines,
      });
      router.push(`/lab/env/${envId}/pds/projects/${project.project_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-4" data-testid="pds-new-project">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">PDS Delivery</p>
        <h2 className="text-2xl font-semibold">New Project</h2>
        <p className="text-sm text-bm-muted2">Create the project record, initialize the baseline budget, then move straight into the cockpit.</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-lg border px-3 py-2 text-sm text-left transition ${
              step === index ? "border-bm-accent/60 bg-bm-accent/10" : "border-bm-border/70 bg-bm-surface/20"
            }`}
          >
            <span className="text-xs text-bm-muted2">Step {index + 1}</span>
            <div className="font-medium">{label}</div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-4">
        {step === 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
              placeholder="Project name"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              value={form.project_code}
              onChange={(e) => setForm((current) => ({ ...current, project_code: e.target.value }))}
              placeholder="Project code"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <select
              value={form.sector}
              onChange={(e) => setForm((current) => ({ ...current, sector: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              <option value="office">Office</option>
              <option value="healthcare">Healthcare</option>
              <option value="hospitality">Hospitality</option>
              <option value="retail">Retail</option>
              <option value="data-center">Data Center</option>
            </select>
            <select
              value={form.project_type}
              onChange={(e) => setForm((current) => ({ ...current, project_type: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              <option value="fit-out">Fit-out</option>
              <option value="renovation">Renovation</option>
              <option value="new-construction">New Construction</option>
            </select>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((current) => ({ ...current, start_date: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.target_end_date}
              onChange={(e) => setForm((current) => ({ ...current, target_end_date: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
              placeholder="Scope / description"
              className="md:col-span-2 min-h-28 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={form.approved_budget}
                onChange={(e) => setForm((current) => ({ ...current, approved_budget: e.target.value }))}
                placeholder="Approved budget"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              />
              <input
                value={form.contingency_budget}
                onChange={(e) => setForm((current) => ({ ...current, contingency_budget: e.target.value }))}
                placeholder="Contingency budget"
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              />
              <input
                value={form.currency_code}
                onChange={(e) => setForm((current) => ({ ...current, currency_code: e.target.value.toUpperCase() }))}
                className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Baseline CSI Split</p>
              <div className="mt-3 grid gap-2">
                {baselineLines.map((line) => (
                  <div key={line.cost_code} className="flex items-center justify-between rounded-lg border border-bm-border/50 px-3 py-2 text-sm">
                    <span>
                      {line.cost_code} · {line.line_label}
                    </span>
                    <span className="text-bm-muted2">{line.approved_amount}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.project_manager}
              onChange={(e) => setForm((current) => ({ ...current, project_manager: e.target.value }))}
              placeholder="Project manager"
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <select
              value={form.stage}
              onChange={(e) => setForm((current) => ({ ...current, stage: e.target.value }))}
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            >
              <option value="planning">Planning</option>
              <option value="preconstruction">Preconstruction</option>
              <option value="procurement">Procurement</option>
              <option value="construction">Construction</option>
              <option value="closeout">Closeout</option>
            </select>
            <textarea
              value={form.team_notes}
              onChange={(e) => setForm((current) => ({ ...current, team_notes: e.target.value }))}
              placeholder="Initial team / resourcing notes"
              className="md:col-span-2 min-h-28 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            />
            <p className="md:col-span-2 text-xs text-bm-muted2">
              Team notes are captured for kickoff context today. Dedicated resource assignment workflows will layer in next.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Core</p>
              <div className="mt-2 space-y-1 text-sm">
                <div>{form.name || "Unnamed project"}</div>
                <div className="text-bm-muted2">{form.project_code || "No code"}</div>
                <div className="text-bm-muted2">{form.sector} · {form.project_type}</div>
                <div className="text-bm-muted2">{form.start_date || "—"} to {form.target_end_date || "—"}</div>
              </div>
            </div>
            <div className="rounded-lg border border-bm-border/70 bg-bm-surface/30 p-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Financial Setup</p>
              <div className="mt-2 space-y-1 text-sm">
                <div>Approved: {form.approved_budget || "0"} {form.currency_code}</div>
                <div>Contingency: {form.contingency_budget || "0"} {form.currency_code}</div>
                <div>Baseline period: {currentPeriod()}</div>
                <div>Manager: {form.project_manager || "Unassigned"}</div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0 || submitting}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (step === STEPS.length - 1) {
                void onSubmit();
                return;
              }
              setStep((current) => Math.min(STEPS.length - 1, current + 1));
            }}
            disabled={submitting || (step === 0 && form.name.trim().length < 2)}
            className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40 disabled:opacity-50"
          >
            {step === STEPS.length - 1 ? (submitting ? "Creating..." : "Create Project") : "Continue"}
          </button>
        </div>
      </div>
    </section>
  );
}
