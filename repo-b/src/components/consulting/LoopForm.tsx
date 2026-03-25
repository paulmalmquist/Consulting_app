"use client";

import React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import type { Client } from "@/lib/cro-api";

type LoopRoleDraft = {
  role_name: string;
  loaded_hourly_rate: string;
  active_minutes: string;
  notes: string;
};

export type LoopFormInitialValues = {
  client_id?: string | null;
  name?: string;
  process_domain?: string;
  description?: string | null;
  trigger_type?: string;
  frequency_type?: string;
  frequency_per_year?: number | string;
  status?: string;
  control_maturity_stage?: number | string;
  automation_readiness_score?: number | string;
  avg_wait_time_minutes?: number | string;
  rework_rate_percent?: number | string;
  roles?: Array<{
    role_name?: string;
    loaded_hourly_rate?: number | string;
    active_minutes?: number | string;
    notes?: string | null;
  }>;
};

export type LoopFormSubmitPayload = {
  client_id?: string;
  name: string;
  process_domain: string;
  description?: string;
  trigger_type: string;
  frequency_type: string;
  frequency_per_year: number;
  status: string;
  control_maturity_stage: number;
  automation_readiness_score: number;
  avg_wait_time_minutes: number;
  rework_rate_percent: number;
  roles: Array<{
    role_name: string;
    loaded_hourly_rate: number;
    active_minutes: number;
    notes?: string;
  }>;
};

type LoopFormProps = {
  clients: Client[];
  initialValues?: LoopFormInitialValues;
  onSubmit: (payload: LoopFormSubmitPayload) => Promise<void>;
  submitLabel?: string;
};

type LoopFormState = {
  client_id: string;
  name: string;
  process_domain: string;
  description: string;
  trigger_type: string;
  frequency_type: string;
  frequency_per_year: string;
  status: string;
  control_maturity_stage: string;
  automation_readiness_score: string;
  avg_wait_time_minutes: string;
  rework_rate_percent: string;
  roles: LoopRoleDraft[];
};

const DEFAULT_ROLE = (): LoopRoleDraft => ({
  role_name: "",
  loaded_hourly_rate: "",
  active_minutes: "",
  notes: "",
});

function toText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function buildInitialState(initialValues?: LoopFormInitialValues): LoopFormState {
  const roleDrafts = initialValues?.roles?.length
    ? initialValues.roles.map((role) => ({
        role_name: role.role_name ?? "",
        loaded_hourly_rate: toText(role.loaded_hourly_rate),
        active_minutes: toText(role.active_minutes),
        notes: role.notes ?? "",
      }))
    : [DEFAULT_ROLE()];

  return {
    client_id: initialValues?.client_id ?? "",
    name: initialValues?.name ?? "",
    process_domain: initialValues?.process_domain ?? "",
    description: initialValues?.description ?? "",
    trigger_type: initialValues?.trigger_type ?? "scheduled",
    frequency_type: initialValues?.frequency_type ?? "monthly",
    frequency_per_year: toText(initialValues?.frequency_per_year ?? "12"),
    status: initialValues?.status ?? "observed",
    control_maturity_stage: toText(initialValues?.control_maturity_stage ?? "2"),
    automation_readiness_score: toText(initialValues?.automation_readiness_score ?? "50"),
    avg_wait_time_minutes: toText(initialValues?.avg_wait_time_minutes ?? "0"),
    rework_rate_percent: toText(initialValues?.rework_rate_percent ?? "0"),
    roles: roleDrafts,
  };
}

function parseNonNegativeNumber(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return value;
}

export default function LoopForm({
  clients,
  initialValues,
  onSubmit,
  submitLabel = "Save Loop",
}: LoopFormProps) {
  const [form, setForm] = useState<LoopFormState>(buildInitialState(initialValues));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateField<K extends keyof Omit<LoopFormState, "roles">>(key: K, value: LoopFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateRole(index: number, key: keyof LoopRoleDraft, value: string) {
    setForm((current) => ({
      ...current,
      roles: current.roles.map((role, roleIndex) =>
        roleIndex === index ? { ...role, [key]: value } : role,
      ),
    }));
  }

  function addRole() {
    setForm((current) => ({ ...current, roles: [...current.roles, DEFAULT_ROLE()] }));
  }

  function removeRole(index: number) {
    setForm((current) => {
      if (current.roles.length === 1) {
        return current;
      }
      return {
        ...current,
        roles: current.roles.filter((_, roleIndex) => roleIndex !== index),
      };
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      if (!form.name.trim()) {
        throw new Error("Loop name is required.");
      }
      if (!form.process_domain.trim()) {
        throw new Error("Process domain is required.");
      }

      const roles = form.roles.map((role, index) => {
        if (!role.role_name.trim()) {
          throw new Error(`Role ${index + 1} name is required.`);
        }
        return {
          role_name: role.role_name.trim(),
          loaded_hourly_rate: parseNonNegativeNumber(role.loaded_hourly_rate, `Role ${index + 1} hourly rate`),
          active_minutes: parseNonNegativeNumber(role.active_minutes, `Role ${index + 1} active minutes`),
          notes: role.notes.trim() || undefined,
        };
      });

      const payload: LoopFormSubmitPayload = {
        client_id: form.client_id || undefined,
        name: form.name.trim(),
        process_domain: form.process_domain.trim(),
        description: form.description.trim() || undefined,
        trigger_type: form.trigger_type,
        frequency_type: form.frequency_type,
        frequency_per_year: parseNonNegativeNumber(form.frequency_per_year, "Frequency per year"),
        status: form.status,
        control_maturity_stage: parseNonNegativeNumber(form.control_maturity_stage, "Control maturity stage"),
        automation_readiness_score: parseNonNegativeNumber(form.automation_readiness_score, "Automation readiness score"),
        avg_wait_time_minutes: parseNonNegativeNumber(form.avg_wait_time_minutes, "Average wait time"),
        rework_rate_percent: parseNonNegativeNumber(form.rework_rate_percent, "Rework rate"),
        roles,
      };

      if (payload.control_maturity_stage < 1 || payload.control_maturity_stage > 5) {
        throw new Error("Control maturity stage must be between 1 and 5.");
      }
      if (payload.automation_readiness_score > 100) {
        throw new Error("Automation readiness score must be between 0 and 100.");
      }
      if (payload.rework_rate_percent > 100) {
        throw new Error("Rework rate must be between 0 and 100.");
      }

      setSubmitting(true);
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save loop.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <form className="space-y-6" onSubmit={handleSubmit} data-testid="loop-form">
          <div className="space-y-2">
            <CardTitle>Loop Definition</CardTitle>
            <p className="text-sm text-bm-muted">
              Capture the recurring workflow, role effort, and current maturity state.
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Name</span>
              <input
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Name"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Client</span>
              <select
                value={form.client_id}
                onChange={(event) => updateField("client_id", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Client"
              >
                <option value="">Internal / none</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-bm-muted2">Description</span>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                className="min-h-24 w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Description"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Process Domain</span>
              <input
                value={form.process_domain}
                onChange={(event) => updateField("process_domain", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Process Domain"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Trigger Type</span>
              <select
                value={form.trigger_type}
                onChange={(event) => updateField("trigger_type", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Trigger Type"
              >
                <option value="scheduled">Scheduled</option>
                <option value="event">Event</option>
                <option value="manual">Manual</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Frequency Type</span>
              <select
                value={form.frequency_type}
                onChange={(event) => updateField("frequency_type", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Frequency Type"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="ad_hoc">Ad Hoc</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Frequency Per Year</span>
              <input
                value={form.frequency_per_year}
                onChange={(event) => updateField("frequency_per_year", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Frequency Per Year"
                inputMode="decimal"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Status</span>
              <select
                value={form.status}
                onChange={(event) => updateField("status", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Status"
              >
                <option value="observed">Observed</option>
                <option value="simplifying">Simplifying</option>
                <option value="automating">Automating</option>
                <option value="stabilized">Stabilized</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Control Maturity Stage</span>
              <select
                value={form.control_maturity_stage}
                onChange={(event) => updateField("control_maturity_stage", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
                aria-label="Control Maturity Stage"
              >
                <option value="1">1 - Manual</option>
                <option value="2">2 - Documented</option>
                <option value="3">3 - Assisted</option>
                <option value="4">4 - Semi-Automated</option>
                <option value="5">5 - Governed Automated</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Automation Readiness Score</span>
              <input
                value={form.automation_readiness_score}
                onChange={(event) => updateField("automation_readiness_score", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Automation Readiness Score"
                inputMode="decimal"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Average Wait Time (Minutes)</span>
              <input
                value={form.avg_wait_time_minutes}
                onChange={(event) => updateField("avg_wait_time_minutes", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Average Wait Time (Minutes)"
                inputMode="decimal"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-bm-muted2">Rework Rate (%)</span>
              <input
                value={form.rework_rate_percent}
                onChange={(event) => updateField("rework_rate_percent", event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                aria-label="Rework Rate (%)"
                inputMode="decimal"
              />
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Roles</h3>
                <p className="text-xs text-bm-muted2">Add each role that actively handles the loop.</p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={addRole}>
                Add Role
              </Button>
            </div>

            {form.roles.map((role, index) => (
              <div key={`role-${index}`} className="rounded-lg border border-bm-border/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Role {index + 1}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeRole(index)}
                    disabled={form.roles.length === 1}
                  >
                    Remove
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="text-bm-muted2">Role Name</span>
                    <input
                      value={role.role_name}
                      onChange={(event) => updateRole(index, "role_name", event.target.value)}
                      className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                      aria-label={`Role ${index + 1} Name`}
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-bm-muted2">Loaded Hourly Rate</span>
                    <input
                      value={role.loaded_hourly_rate}
                      onChange={(event) => updateRole(index, "loaded_hourly_rate", event.target.value)}
                      className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                      aria-label={`Role ${index + 1} Loaded Hourly Rate`}
                      inputMode="decimal"
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-bm-muted2">Active Minutes</span>
                    <input
                      value={role.active_minutes}
                      onChange={(event) => updateRole(index, "active_minutes", event.target.value)}
                      className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                      aria-label={`Role ${index + 1} Active Minutes`}
                      inputMode="decimal"
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="text-bm-muted2">Notes</span>
                    <input
                      value={role.notes}
                      onChange={(event) => updateRole(index, "notes", event.target.value)}
                      className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                      aria-label={`Role ${index + 1} Notes`}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
