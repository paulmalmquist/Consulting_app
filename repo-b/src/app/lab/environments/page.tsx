"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import LabThemeToggle from "@/components/lab/LabThemeToggle";
import { apiFetch } from "@/lib/api";
import {
  LAB_INDUSTRIES,
  type LabIndustryKey,
  getLabIndustryMeta,
} from "@/lib/lab-industries";
import { cn } from "@/lib/cn";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toLocaleDateString();
}

function statusForEnvironment(env: { status?: string; is_active?: boolean }) {
  if (env.status) return env.status;
  if (typeof env.is_active === "boolean") return env.is_active ? "active" : "paused";
  return null;
}

export default function EnvironmentsPage() {
  const router = useRouter();
  const { environments, selectedEnv, refresh, selectEnv, loading } = useEnv();

  const [industry, setIndustry] = useState<LabIndustryKey | null>(null);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resettingEnvId, setResettingEnvId] = useState<string | null>(null);

  const handleCreateEnvironment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!industry || submitting) return;

    setSubmitting(true);
    setStatus(null);

    // API currently requires client_name. For now we derive a neutral label from industry.
    // Server-side metadata can replace this once explicit environment metadata exists.
    const industryLabel = getLabIndustryMeta(industry)?.label || "General";
    const clientName = industryLabel.replace(/\s*\/\s*/g, " ").slice(0, 72);

    try {
      const payload = await apiFetch<{ env_id: string }>("/v1/environments", {
        method: "POST",
        body: JSON.stringify({
          client_name: clientName,
          industry,
          notes,
        }),
      });

      await refresh();
      selectEnv(payload.env_id);
      setNotes("");
      setStatus("Environment created and selected.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed";
      setStatus(message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEnvironment = (envId: string) => {
    selectEnv(envId);
    router.push("/lab");
  };

  const resetEnvironment = async (envId: string) => {
    setResettingEnvId(envId);
    setStatus(null);
    try {
      await apiFetch(`/v1/environments/${envId}/reset`, { method: "POST" });
      await refresh();
      selectEnv(envId);
      setStatus("Environment reset and reseeded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed";
      setStatus(message);
    } finally {
      setResettingEnvId(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-semibold text-bm-text">
            Lab Environments
          </h1>
          <p className="text-sm md:text-base text-bm-muted">
            Create or open an environment to test workflows and data models.
          </p>
        </div>
        <LabThemeToggle />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.65fr,1fr]">
        <Card>
          <CardContent>
            <CardTitle className="text-xl font-semibold">Client Environments</CardTitle>
            <CardDescription className="text-sm">
              Select an environment and open it in the dashboard.
            </CardDescription>

            <div className="mt-5 space-y-3">
              {loading ? (
                <>
                  <div className="h-20 rounded-xl bg-bm-surface/45 border border-bm-border/60 animate-pulse" />
                  <div className="h-20 rounded-xl bg-bm-surface/45 border border-bm-border/60 animate-pulse" />
                </>
              ) : null}

              {!loading &&
                environments.map((env) => {
                  const industryMeta = getLabIndustryMeta(env.industry);
                  const industryLabel = industryMeta?.label || "General";
                  const statusLabel = statusForEnvironment(env);
                  const createdAt = formatDate(env.created_at);
                  const isSelected = selectedEnv?.env_id === env.env_id;

                  return (
                    <div
                      key={env.env_id}
                      className={cn(
                        "rounded-xl border p-4 bg-bm-surface/35 transition",
                        isSelected
                          ? "border-bm-accent/35 bg-bm-accent/10 shadow-bm-glow"
                          : "border-bm-border/70"
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="accent">{industryLabel}</Badge>
                            {statusLabel ? (
                              <Badge
                                variant={
                                  statusLabel === "active"
                                    ? "success"
                                    : statusLabel === "paused"
                                      ? "warning"
                                      : "default"
                                }
                              >
                                {statusLabel}
                              </Badge>
                            ) : null}
                            {isSelected ? <Badge variant="default">Selected</Badge> : null}
                          </div>

                          <div className="text-xs text-bm-muted2">
                            Environment ID: {env.env_id.slice(0, 8)}
                          </div>

                          {createdAt ? (
                            <div className="text-xs text-bm-muted2">Created {createdAt}</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openEnvironment(env.env_id)}
                          >
                            Open
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => resetEnvironment(env.env_id)}
                            disabled={resettingEnvId === env.env_id}
                          >
                            {resettingEnvId === env.env_id ? "Resetting..." : "Reset"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {!loading && environments.length === 0 ? (
                <p className="text-sm text-bm-muted2">No environments yet.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <CardTitle className="text-xl font-semibold">Create Environment</CardTitle>
            <CardDescription className="text-sm">
              Step 1: choose an industry template. Step 2: create environment.
            </CardDescription>

            <form onSubmit={handleCreateEnvironment} className="mt-4 space-y-4">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Step 1</p>
                <p className="text-sm text-bm-muted">Choose an industry template</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
                {LAB_INDUSTRIES.map((option) => {
                  const selected = option.key === industry;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setIndustry(option.key)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        selected
                          ? "border-bm-accent/40 bg-bm-accent/12 shadow-bm-glow"
                          : "border-bm-border/65 bg-bm-surface/30 hover:bg-bm-surface/45"
                      )}
                    >
                      <p className="text-sm font-semibold">{option.label}</p>
                      <p className="text-xs text-bm-muted mt-1 leading-relaxed">
                        {option.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {option.recommendedDepartments.map((dept) => (
                          <span
                            key={dept}
                            className="inline-flex items-center rounded-full border border-bm-border/70 bg-bm-surface2/55 px-2 py-0.5 text-[10px] text-bm-muted"
                          >
                            {dept}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Step 2</p>
                <label className="text-sm text-bm-muted">Purpose (optional)</label>
                <Textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="What scenario are you testing?"
                  rows={3}
                />
              </div>

              {status ? <p className="text-sm text-bm-success">{status}</p> : null}

              <Button type="submit" className="w-full" disabled={!industry || submitting}>
                {submitting ? "Creating..." : "Create Environment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

