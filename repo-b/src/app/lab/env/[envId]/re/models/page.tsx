"use client";

import { useEffect, useState } from "react";
import {
  listReV1Funds,
  RepeFund,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { PlusCircle, Archive, CheckCircle2, FileEdit, Copy, MoreVertical } from "lucide-react";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";
import {
  RepeIndexScaffold,
  reIndexActionClass,
  reIndexControlLabelClass,
  reIndexInputClass,
  reIndexPrimaryCellClass,
  reIndexSecondaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

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

  const isDuplicateName = newName.trim().length > 0 && models.some(
    (m) => m.name.toLowerCase().trim() === newName.toLowerCase().trim()
  );

  const draftCount = models.filter((m) => m.status === "draft").length;
  const approvedCount = models.filter((m) => m.status === "approved").length;

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading models...</div>;
  }

  return (
    <RepeIndexScaffold
      title="Models"
      subtitle="Create and manage cross-fund scenario models for PE and real estate analysis"
      controls={
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-bm-border/20 pb-5">
          <label className={reIndexControlLabelClass}>
            Fund
            <select
              className={`${reIndexInputClass} w-full min-w-[240px]`}
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
      }
      metrics={
        selectedFundId ? (
          <KpiStrip
            variant="band"
            kpis={[
              { label: "Total Models", value: models.length },
              { label: "Draft", value: draftCount },
              { label: "Approved", value: approvedCount },
            ]}
          />
        ) : null
      }
      className="w-full"
    >
      <section className="space-y-6" data-testid="re-models-page">
        {selectedFundId ? (
          models.length === 0 ? (
            <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-6 text-sm text-bm-muted2">
              No models for this fund. Create one below.
            </div>
          ) : (
            <div className={reIndexTableShellClass}>
              <table className={`${reIndexTableClass} min-w-[760px]`}>
                <thead>
                  <tr className={reIndexTableHeadRowClass}>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="w-10 px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody className={reIndexTableBodyClass}>
                  {models.map((m) => (
                    <tr key={m.model_id} className={reIndexTableRowClass} data-testid={`model-row-${m.model_id}`}>
                      <td className="px-4 py-4 align-middle">
                        <a
                          href={`${window.location.pathname}/../models/${m.model_id}`}
                          className={`${reIndexPrimaryCellClass} cursor-pointer`}
                        >
                          {m.name}
                        </a>
                        {m.description ? (
                          <p className="mt-1 text-[12px] text-bm-muted2">{m.description}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] text-bm-muted2">
                          {m.strategy_type || "equity"}
                        </span>
                      </td>
                      <td className="px-4 py-4 align-middle">
                        <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                          {m.status === "approved" ? <CheckCircle2 size={10} /> : m.status === "archived" ? <Archive size={10} /> : <FileEdit size={10} />}
                          {m.status}
                        </span>
                      </td>
                      <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="relative px-4 py-4 align-middle">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === m.model_id ? null : m.model_id)}
                          className="rounded p-1 transition-colors duration-100 hover:bg-bm-surface/30"
                          data-testid={`model-menu-${m.model_id}`}
                        >
                          <MoreVertical size={14} />
                        </button>
                        {openMenuId === m.model_id ? (
                          <div className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-lg border border-bm-border/70 bg-bm-surface shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleCloneModel(m.model_id)}
                              disabled={cloningId === m.model_id}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 hover:bg-bm-surface/50 disabled:opacity-50"
                              data-testid={`clone-model-${m.model_id}`}
                            >
                              <Copy size={12} /> Clone
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-6 text-sm text-bm-muted2">
            Select a fund to view its models.
          </div>
        )}

        {selectedFundId ? (
          <div className="space-y-3 rounded-xl border border-bm-border/70 bg-bm-surface/10 p-4">
            <h2 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Create Model</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                className={reIndexInputClass}
                placeholder="Model name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="model-name-input"
              />
              <input
                className={reIndexInputClass}
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                data-testid="model-desc-input"
              />
              <select
                className={reIndexInputClass}
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
                disabled={creating || !newName.trim() || isDuplicateName}
                className={reIndexActionClass}
                data-testid="create-model-btn"
              >
                <PlusCircle size={14} />
                {creating ? "Creating..." : "Create Model"}
              </button>
            </div>
            {isDuplicateName ? (
              <p className="text-xs text-amber-400">A model with this name already exists. Choose a different name.</p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </section>
    </RepeIndexScaffold>
  );
}
