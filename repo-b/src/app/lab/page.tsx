"use client";

import { useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";

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
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-xl font-semibold">Client Environment Dashboard</h1>
        <p className="text-sm text-slate-400 mt-2">
          Manage the active demo environment, industry template, and reset state.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold"
          >
            Create Environment
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200"
          >
            Reset Environment
          </button>
          <select
            className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm"
            value={selectedEnv?.env_id || ""}
            onChange={(event) => selectEnv(event.target.value)}
          >
            {environments.map((env) => (
              <option key={env.env_id} value={env.env_id}>
                {env.client_name} · {env.industry}
              </option>
            ))}
          </select>
        </div>
        {actionMessage ? (
          <p className="mt-3 text-sm text-emerald-300">{actionMessage}</p>
        ) : null}
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Environment Snapshot</h2>
        <p className="text-sm text-slate-400 mt-2">
          {loading
            ? "Loading environments..."
            : selectedEnv
              ? `Schema ${selectedEnv.schema_name} is active for ${selectedEnv.client_name}.`
              : "No environment created yet."}
        </p>
        <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
          <span className="px-2 py-1 rounded-full bg-slate-800">
            Synthetic + uploaded data
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-800">
            HITL enabled
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-800">
            Audit-ready
          </span>
        </div>
      </section>
    </div>
  );
}
