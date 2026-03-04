"use client";

import { useEffect, useState } from "react";
import {
  listReV1Funds,
  RepeFund,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { PlusCircle, Archive, CheckCircle2, FileEdit, Copy, MoreVertical } from "lucide-react";
import Link from "next/link";

/* ── Types ─────────────────────────────────────────────────────── */

interface ReModel {
  model_id: string;
  fund_id: string;
  name: string;
  description: string | null;
  status: string;
  strategy_type: string | null;
  created_by: string | null;
  created_at: string;
}

/* ── API helpers (inline until bos-api.ts is extended) ─────────── */

async function listModels(fundId: string): Promise<ReModel[]> {
  const res = await fetch(`/api/re/v2/funds/${fundId}/models`);
  if (!res.ok) return [];
  return res.json();
}

async function createModel(fundId: string, body: { name: string; description?: string; strategy_type?: string }): Promise<ReModel> {
  const res = await fetch(`/api/re/v2/funds/${fundId}/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function cloneModel(modelId: string): Promise<ReModel> {
  const res = await fetch(`/api/re/v2/models/${modelId}/clone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Component ─────────────────────────────────────────────────── */

export default function ReModelsPage() {
  const { envId, businessId } = useReEnv();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [models, setModels] = useState<ReModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStrategy, setNewStrategy] = useState<string>("equity");
  const [error, setError] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Load funds
  useEffect(() => {
    if (!businessId && !envId) return;
    listReV1Funds({ env_id: envId, business_id: businessId || undefined })
      .then((rows) => {
        setFunds(rows);
        if (rows[0]) setSelectedFundId(rows[0].fund_id);
      })
      .catch(() => setFunds([]))
      .finally(() => setLoading(false));
  }, [businessId, envId]);

  // Load models for selected fund
  useEffect(() => {
    if (!selectedFundId) return;
    listModels(selectedFundId)
      .then(setModels)
      .catch(() => setModels([]));
  }, [selectedFundId]);

  const handleCreate = async () => {
    if (!selectedFundId || !newName.trim()) return;

    // Check for duplicate model name
    const duplicate = models.find(
      (m) => m.name.toLowerCase().trim() === newName.toLowerCase().trim()
    );
    if (duplicate) {
      setError(`A model named "${newName}" already exists. Choose a different name.`);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const created = await createModel(selectedFundId, {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        strategy_type: newStrategy || undefined,
      });
      setModels((prev) => [created, ...prev]);
      setNewName("");
      setNewDesc("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create model");
    } finally {
      setCreating(false);
    }
  };

  const handleCloneModel = async (modelId: string) => {
    setCloningId(modelId);
    setError(null);
    try {
      const cloned = await cloneModel(modelId);
      setModels((prev) => [cloned, ...prev]);
      setOpenMenuId(null);
      // Navigate to the cloned model
      window.location.href = `${window.location.pathname}/${cloned.model_id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone model");
    } finally {
      setCloningId(null);
    }
  };

  const draftCount = models.filter((m) => m.status === "draft").length;
  const approvedCount = models.filter((m) => m.status === "approved").length;

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading models...</div>;
  }

  return (
    <section className="space-y-5" data-testid="re-models-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Models</h1>
          <p className="mt-1 text-sm text-bm-muted2">
            Create and manage cross-fund scenario models for PE and real estate analysis
          </p>
        </div>
      </div>

      {/* Fund Selector */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Fund
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            data-testid="model-fund-select"
          >
            <option value="">Select fund</option>
            {funds.map((f) => (
              <option key={f.fund_id} value={f.fund_id}>{f.name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* KPI Row */}
      {selectedFundId && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 text-center">
            <p className="text-2xl font-semibold">{models.length}</p>
            <p className="text-xs text-bm-muted2 uppercase tracking-wider">Total Models</p>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 text-center">
            <p className="text-2xl font-semibold">{draftCount}</p>
            <p className="text-xs text-bm-muted2 uppercase tracking-wider">Draft</p>
          </div>
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-3 text-center">
            <p className="text-2xl font-semibold">{approvedCount}</p>
            <p className="text-xs text-bm-muted2 uppercase tracking-wider">Approved</p>
          </div>
        </div>
      )}

      {/* Models List */}
      {selectedFundId && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Models</h2>
          {models.length === 0 ? (
            <p className="text-sm text-bm-muted2">No models for this fund. Create one below.</p>
          ) : (
            <div className="rounded-xl border border-bm-border/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-bm-border/50 bg-bm-surface/30 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Strategy</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bm-border/40">
                  {models.map((m) => (
                    <tr key={m.model_id} className="hover:bg-bm-surface/30" data-testid={`model-row-${m.model_id}`}>
                      <td className="px-4 py-2.5">
                        <a
                          href={`${window.location.pathname}/../models/${m.model_id}`}
                          className="font-medium hover:text-bm-accent transition-colors cursor-pointer"
                        >
                          {m.name}
                        </a>
                        {m.description && (
                          <p className="text-xs text-bm-muted2 mt-0.5">{m.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/70 px-2 py-0.5 text-bm-muted2">
                          {m.strategy_type || "equity"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                          m.status === "approved"
                            ? "bg-green-500/10 text-green-400 border border-green-500/30"
                            : m.status === "archived"
                              ? "bg-bm-surface/40 text-bm-muted2 border border-bm-border/50"
                              : "bg-bm-accent/10 text-bm-accent border border-bm-accent/30"
                        }`}>
                          {m.status === "approved" ? <CheckCircle2 size={10} /> : m.status === "archived" ? <Archive size={10} /> : <FileEdit size={10} />}
                          {m.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-bm-muted2">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === m.model_id ? null : m.model_id)}
                          className="p-1 hover:bg-bm-surface/40 rounded"
                          data-testid={`model-menu-${m.model_id}`}
                        >
                          <MoreVertical size={14} />
                        </button>
                        {openMenuId === m.model_id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-bm-surface border border-bm-border/70 rounded-lg shadow-lg z-10 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => handleCloneModel(m.model_id)}
                              disabled={cloningId === m.model_id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-bm-surface/50 flex items-center gap-2 disabled:opacity-50"
                              data-testid={`clone-model-${m.model_id}`}
                            >
                              <Copy size={12} /> Clone
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create Model */}
      {selectedFundId && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
          <h2 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Create Model</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              placeholder="Model name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              data-testid="model-name-input"
            />
            <input
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              data-testid="model-desc-input"
            />
            <select
              className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
              value={newStrategy}
              onChange={(e) => setNewStrategy(e.target.value)}
              data-testid="model-strategy-select"
            >
              <option value="equity">Equity</option>
              <option value="credit">Credit</option>
              <option value="cmbs">CMBS</option>
              <option value="mixed">Mixed</option>
            </select>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
              data-testid="create-model-btn"
            >
              <PlusCircle size={14} />
              {creating ? "Creating..." : "Create Model"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </section>
  );
}
