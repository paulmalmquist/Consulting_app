"use client";

import { useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

const industries = ["healthcare", "legal", "construction"] as const;

export default function EnvironmentsPage() {
  const { environments, refresh, selectEnv } = useEnv();
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState<(typeof industries)[number]>(
    "healthcare"
  );
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    try {
      const payload = await apiFetch<{ env_id: string }>("/v1/environments", {
        method: "POST",
        body: JSON.stringify({
          client_name: clientName,
          industry,
          notes
        })
      });
      await refresh();
      selectEnv(payload.env_id);
      setClientName("");
      setNotes("");
      setStatus("Environment created.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed";
      setStatus(message);
    }
  };

  return (
    <div className="grid lg:grid-cols-[2fr,1fr] gap-6">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Client Environments</CardTitle>
          <CardDescription>Select or review configured environments.</CardDescription>
          <div className="mt-6 space-y-3">
            {environments.map((env) => (
              <button
                key={env.env_id}
                onClick={() => selectEnv(env.env_id)}
                className="w-full text-left bm-glass-interactive rounded-xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{env.client_name}</p>
                    <p className="text-xs text-bm-muted2">{env.industry}</p>
                  </div>
                  <span className="text-xs text-bm-muted">{env.schema_name}</span>
                </div>
              </button>
            ))}
            {environments.length === 0 ? (
              <p className="text-sm text-bm-muted2">No environments yet.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
