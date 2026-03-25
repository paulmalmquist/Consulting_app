"use client";

import React from "react";
import { useEffect, useState } from "react";
import LoopForm, {
  type LoopFormInitialValues,
  type LoopFormSubmitPayload,
} from "@/components/consulting/LoopForm";
import { useConsultingEnv } from "@/components/consulting/ConsultingEnvProvider";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import {
  createLoopIntervention,
  fetchClients,
  fetchLoop,
  updateLoop,
  type Client,
  type LoopDetail,
} from "@/lib/cro-api";

function fmtCurrency(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function formatError(err: unknown): string {
  if (!(err instanceof Error)) {
    return "Loop details are currently unavailable.";
  }
  return err.message.replace(/\s*\(req:\s*[a-zA-Z0-9_-]+\)\s*$/, "") || "Loop details are currently unavailable.";
}

const STATUS_STYLES: Record<string, string> = {
  observed: "bg-bm-muted/10 text-bm-muted2",
  simplifying: "bg-bm-warning/10 text-bm-warning",
  automating: "bg-bm-accent/15 text-bm-accent",
  stabilized: "bg-bm-success/10 text-bm-success",
};

function toInitialValues(loop: LoopDetail): LoopFormInitialValues {
  return {
    client_id: loop.client_id,
    name: loop.name,
    process_domain: loop.process_domain,
    description: loop.description,
    trigger_type: loop.trigger_type,
    frequency_type: loop.frequency_type,
    frequency_per_year: loop.frequency_per_year,
    status: loop.status,
    control_maturity_stage: loop.control_maturity_stage,
    automation_readiness_score: loop.automation_readiness_score,
    avg_wait_time_minutes: loop.avg_wait_time_minutes,
    rework_rate_percent: loop.rework_rate_percent,
    roles: loop.roles.map((role) => ({
      role_name: role.role_name,
      loaded_hourly_rate: role.loaded_hourly_rate,
      active_minutes: role.active_minutes,
      notes: role.notes,
    })),
  };
}

export default function ConsultingLoopDetailPage({
  params,
}: {
  params: { envId: string; loopId: string };
}) {
  const { businessId, ready, loading: contextLoading, error: contextError } = useConsultingEnv();
  const [loop, setLoop] = useState<LoopDetail | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interventionType, setInterventionType] = useState("data_standardize");
  const [interventionNotes, setInterventionNotes] = useState("");
  const [interventionDelta, setInterventionDelta] = useState("");
  const [interventionSaving, setInterventionSaving] = useState(false);

  async function loadData() {
    if (!businessId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [loopResult, clientsResult] = await Promise.all([
        fetchLoop(params.loopId, params.envId, businessId),
        fetchClients(params.envId, businessId).catch(() => []),
      ]);
      setLoop(loopResult);
      setClients(clientsResult);
    } catch (err) {
      setLoop(null);
      setError(formatError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready) return;
    void loadData();
  }, [businessId, params.envId, params.loopId, ready]);

  async function handleUpdate(payload: LoopFormSubmitPayload) {
    if (!businessId) {
      setError("Environment is not bound to a business.");
      return;
    }
    setError(null);
    const updated = await updateLoop(params.loopId, params.envId, businessId, payload);
    setLoop(updated);
  }

  async function handleCreateIntervention(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId || !loop) {
      setError("Loop context is unavailable.");
      return;
    }

    try {
      setInterventionSaving(true);
      setError(null);
      await createLoopIntervention(loop.id, params.envId, businessId, {
        intervention_type: interventionType,
        notes: interventionNotes || undefined,
        observed_delta_percent: interventionDelta ? Number(interventionDelta) : undefined,
      });
      setInterventionNotes("");
      setInterventionDelta("");
      await loadData();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setInterventionSaving(false);
    }
  }

  const bannerMessage = contextError || error;
  const isLoading = contextLoading || (ready && loading);

  if (isLoading) {
    return <div className="h-96 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />;
  }

  if (!loop) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-bm-muted2">
          Unable to load this loop.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="loop-detail-page">
      {bannerMessage ? (
        <div className="rounded-lg border border-bm-danger/35 bg-bm-danger/10 px-4 py-3 text-sm text-bm-text">
          {bannerMessage}
        </div>
      ) : null}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{loop.name}</CardTitle>
                <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[loop.status] || ""}`}>
                  {loop.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-bm-muted">
                {loop.process_domain} · Trigger: {loop.trigger_type} · {loop.frequency_type}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-bm-border/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Cost Per Run</p>
              <p className="mt-1 text-xl font-semibold">{fmtCurrency(loop.loop_cost_per_run)}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Annual Estimated Cost</p>
              <p className="mt-1 text-xl font-semibold">{fmtCurrency(loop.annual_estimated_cost)}</p>
            </div>
            <div className="rounded-lg border border-bm-border/60 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">Role Count</p>
              <p className="mt-1 text-xl font-semibold">{loop.role_count}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <CardTitle className="text-base">Roles</CardTitle>
            <p className="text-sm text-bm-muted mt-2">Current operator effort by role.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-bm-muted2">
                <tr className="border-b border-bm-border/60">
                  <th className="pb-3 pr-4 font-medium">Role</th>
                  <th className="pb-3 pr-4 font-medium">Loaded Rate</th>
                  <th className="pb-3 pr-4 font-medium">Active Minutes</th>
                  <th className="pb-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {loop.roles.map((role) => (
                  <tr key={role.id} className="border-b border-bm-border/40 last:border-b-0">
                    <td className="py-3 pr-4 font-medium">{role.role_name}</td>
                    <td className="py-3 pr-4">{fmtCurrency(role.loaded_hourly_rate)}</td>
                    <td className="py-3 pr-4">{Number(role.active_minutes).toFixed(0)}</td>
                    <td className="py-3">{role.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <LoopForm
        key={`${loop.id}-${loop.updated_at}`}
        clients={clients}
        initialValues={toInitialValues(loop)}
        onSubmit={handleUpdate}
        submitLabel="Save Changes"
      />

      <Card>
        <CardContent className="space-y-4">
          <div>
            <CardTitle className="text-base">Interventions</CardTitle>
            <p className="text-sm text-bm-muted mt-2">
              Log simplification changes and keep immutable before-state snapshots.
            </p>
          </div>

          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCreateIntervention}>
            <label className="space-y-1 text-sm md:col-span-1">
              <span className="text-bm-muted2">Type</span>
              <select
                value={interventionType}
                onChange={(event) => setInterventionType(event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-bm-bg px-3 py-2"
              >
                <option value="remove_step">Remove Step</option>
                <option value="consolidate_role">Consolidate Role</option>
                <option value="automate_step">Automate Step</option>
                <option value="policy_rewrite">Policy Rewrite</option>
                <option value="data_standardize">Data Standardize</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-bm-muted2">Notes</span>
              <input
                value={interventionNotes}
                onChange={(event) => setInterventionNotes(event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                placeholder="What changed and why?"
              />
            </label>

            <label className="space-y-1 text-sm md:col-span-1">
              <span className="text-bm-muted2">Observed Delta %</span>
              <input
                value={interventionDelta}
                onChange={(event) => setInterventionDelta(event.target.value)}
                className="w-full rounded-lg border border-bm-border bg-transparent px-3 py-2"
                inputMode="decimal"
              />
            </label>

            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={interventionSaving}>
                {interventionSaving ? "Saving..." : "Add Intervention"}
              </Button>
            </div>
          </form>

          {loop.interventions.length === 0 ? (
            <div className="rounded-lg border border-bm-border/70 px-4 py-6 text-center text-sm text-bm-muted2">
              No interventions recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {loop.interventions.map((intervention) => (
                <div key={intervention.id} className="rounded-lg border border-bm-border/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{intervention.intervention_type}</p>
                      <p className="text-xs text-bm-muted2">
                        {new Date(intervention.created_at).toLocaleString()}
                      </p>
                    </div>
                    <p className="text-xs text-bm-muted2">
                      Delta: {intervention.observed_delta_percent ?? "—"}%
                    </p>
                  </div>

                  {intervention.notes ? (
                    <p className="text-sm text-bm-text">{intervention.notes}</p>
                  ) : null}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.1em] text-bm-muted2">Before Snapshot</p>
                      <pre className="overflow-x-auto rounded-lg border border-bm-border/60 bg-bm-bg/60 p-3 text-xs whitespace-pre-wrap">
                        {JSON.stringify(intervention.before_snapshot, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.1em] text-bm-muted2">After Snapshot</p>
                      <pre className="overflow-x-auto rounded-lg border border-bm-border/60 bg-bm-bg/60 p-3 text-xs whitespace-pre-wrap">
                        {JSON.stringify(intervention.after_snapshot, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
