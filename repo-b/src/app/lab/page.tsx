"use client";

import { useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";

export default function LabDashboard() {
  const { environments, selectedEnv, selectEnv, refresh, loading } = useEnv();
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleReset = async () => {
    if (!selectedEnv) return;
    setActionMessage(null);
    try {
      await apiFetch(`/v1/environments/${selectedEnv.env_id}/reset`, {
        method: "POST"
      });
      setActionMessage("Environment reset and reseeded.");
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reset failed";
      setActionMessage(message);
    }
  };

  const handleCreate = async () => {
    setActionMessage(null);
    try {
      const payload = await apiFetch<{ env_id: string }>("/v1/environments", {
        method: "POST",
        body: JSON.stringify({
          client_name: "New Demo Client",
          industry: "healthcare",
          notes: "Auto-created from dashboard"
        })
      });
      await refresh();
      selectEnv(payload.env_id);
      setActionMessage("Environment created.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Create failed";
      setActionMessage(message);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <CardTitle className="text-xl">Client Environment Dashboard</CardTitle>
          <CardDescription>
            Manage the active demo environment, industry template, and reset state.
          </CardDescription>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={handleCreate}>Create Environment</Button>
            <Button variant="secondary" onClick={handleReset}>
              Reset Environment
            </Button>
            <div className="min-w-[260px]">
              <Select
                value={selectedEnv?.env_id || ""}
                onChange={(event) => selectEnv(event.target.value)}
              >
                <option value="" disabled>
                  Select environment…
                </option>
                {environments.map((env) => (
                  <option key={env.env_id} value={env.env_id}>
                    {env.client_name} · {env.industry}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {actionMessage ? (
            <p className="mt-3 text-sm text-bm-success">{actionMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CardTitle>Environment Snapshot</CardTitle>
          <CardDescription>
            {loading
              ? "Loading environments..."
              : selectedEnv
                ? `Schema ${selectedEnv.schema_name} is active for ${selectedEnv.client_name}.`
                : "No environment created yet."}
          </CardDescription>
          <div className="mt-4 flex items-center gap-3 text-xs">
            <Badge>Synthetic + uploaded data</Badge>
            <Badge>HITL enabled</Badge>
            <Badge>Audit-ready</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
