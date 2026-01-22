"use client";

import { useState } from "react";
import { useEnv } from "@/components/EnvProvider";
import { apiFetch } from "@/lib/api";

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
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h1 className="text-xl font-semibold">Client Environments</h1>
        <p className="text-sm text-slate-400 mt-2">
          Select or review configured environments.
        </p>
        <div className="mt-6 space-y-3">
          {environments.map((env) => (
            <button
              key={env.env_id}
              onClick={() => selectEnv(env.env_id)}
              className="w-full text-left border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{env.client_name}</p>
                  <p className="text-xs text-slate-500">{env.industry}</p>
                </div>
                <span className="text-xs text-slate-400">{env.schema_name}</span>
              </div>
            </button>
          ))}
          {environments.length === 0 ? (
            <p className="text-sm text-slate-500">No environments yet.</p>
          ) : null}
        </div>
      </section>
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Create Environment</h2>
        <p className="text-sm text-slate-400 mt-2">
          Spin up a new client schema with seeded data.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs text-slate-400">Client name</label>
            <input
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Acme Health"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-400">Industry</label>
            <select
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
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
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400">Notes</label>
            <textarea
              className="mt-2 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes"
              rows={3}
            />
          </div>
          {status ? <p className="text-sm text-emerald-300">{status}</p> : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-sky-500 text-slate-950 font-semibold py-2"
          >
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
