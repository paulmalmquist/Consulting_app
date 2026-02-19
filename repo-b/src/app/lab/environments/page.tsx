"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Trash2Icon } from "@/components/lab/LabIcons";

const industries = ["healthcare", "legal", "construction", "real_estate", "website"] as const;

export default function EnvironmentsPage() {
  const router = useRouter();
  const { environments, refresh, selectEnv } = useEnv();
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState<(typeof industries)[number]>("healthcare");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [rowIndustryDraft, setRowIndustryDraft] = useState<Record<string, (typeof industries)[number]>>({});

  const openEnvironment = (envId: string) => {
    selectEnv(envId);
    router.push(`/lab/env/${envId}`);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    try {
      const payload = await apiFetch<{ env_id: string }>("/v1/environments", {
        method: "POST",
        body: JSON.stringify({
          client_name: clientName,
          industry,
          industry_type: industry,
          notes
        })
      });
      await refresh();
      setClientName("");
      setNotes("");
      setStatus("Environment created.");
      sessionStorage.setItem(
        "bm_env_flash",
        JSON.stringify({
          envId: payload.env_id,
          kind: "created",
          message: `Created environment "${clientName}".`,
        })
      );
      openEnvironment(payload.env_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed";
      setStatus(message);
    }
  };

  const updateIndustry = async (envId: string) => {
    const nextIndustry = rowIndustryDraft[envId];
    if (!nextIndustry) return;
    setStatus(null);
    try {
      await apiFetch(`/v1/environments/${envId}`, {
        method: "PATCH",
        body: JSON.stringify({
          industry: nextIndustry,
          industry_type: nextIndustry,
        }),
      });
      await refresh();
      setStatus(`Environment updated to ${nextIndustry}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      setStatus(message);
    }
  };

  const deleteEnvironment = async (envId: string) => {
    setStatus(null);
    try {
      await apiFetch(`/v1/environments/${envId}`, { method: "DELETE" });
      await refresh();
      setStatus("Environment deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed";
      setStatus(message);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr,2fr] gap-6">
      <Card>
        <CardContent>
          <CardTitle>Create Environment</CardTitle>
          <CardDescription>Spin up a new client schema with seeded data.</CardDescription>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="text-xs text-bm-muted2">Client name</label>
              <Input
                className="mt-2"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                placeholder="Acme Health"
                required
              />
            </div>
            <div>
              <label className="text-xs text-bm-muted2">Industry</label>
              <Select
                className="mt-2"
                value={industry}
                onChange={(event) =>
                  setIndustry(event.target.value as (typeof industries)[number])
                }
              >
                {industries.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-bm-muted2">Notes</label>
              <Textarea
                className="mt-2"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes"
                rows={3}
              />
            </div>
            {status ? <p className="text-sm text-bm-success">{status}</p> : null}
            <Button type="submit" className="w-full">
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle className="text-xl">Client Environments</CardTitle>
          <CardDescription>Select or review configured environments.</CardDescription>
          <div className="mt-6 space-y-3">
            {environments.map((env) => (
              <div key={env.env_id} className="w-full bm-glass-interactive rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => openEnvironment(env.env_id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div>
                      <p className="font-semibold">{env.client_name}</p>
                      <p className="text-xs text-bm-muted2">
                        {env.industry_type || env.industry}
                      </p>
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteEnvironment(env.env_id)}
                    className="h-8 w-8 p-0 text-bm-muted hover:text-red-400"
                    aria-label={`Delete ${env.client_name}`}
                    data-testid={`env-delete-${env.env_id}`}
                  >
                    <Trash2Icon size={16} />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={rowIndustryDraft[env.env_id] || (env.industry_type || env.industry)}
                    onChange={(event) =>
                      setRowIndustryDraft((prev) => ({
                        ...prev,
                        [env.env_id]: event.target.value as (typeof industries)[number],
                      }))
                    }
                    data-testid={`env-industry-${env.env_id}`}
                  >
                    {industries.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    onClick={() => updateIndustry(env.env_id)}
                    data-testid={`env-save-industry-${env.env_id}`}
                  >
                    Save Industry
                  </Button>
                </div>
              </div>
            ))}
            {environments.length === 0 ? (
              <p className="text-sm text-bm-muted2">No environments yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
