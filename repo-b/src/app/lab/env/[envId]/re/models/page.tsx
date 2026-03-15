"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createCrossFundModel,
  listAllModels,
  listReV1Funds,
  ReV2Model,
  RepeFund,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { useRepeBasePath } from "@/lib/repe-context";
import { PlusCircle, Archive, CheckCircle2, FileEdit, Copy, MoreVertical } from "lucide-react";
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

type ReModel = ReV2Model & {
  fund_id?: string | null;
  fund_name?: string;
};

/* ── API helpers ─────────────────────────────────────────────────── */

const MODEL_TYPE_OPTIONS = [
  { value: "scenario", label: "Scenario" },
  { value: "forecast", label: "Forecast" },
  { value: "downside", label: "Downside" },
  { value: "upside", label: "Upside" },
  { value: "underwriting_io", label: "Underwriting IO" },
] as const;

const STRATEGY_OPTIONS = [
  { value: "equity", label: "Equity" },
  { value: "credit", label: "Credit" },
  { value: "cmbs", label: "CMBS" },
  { value: "mixed", label: "Mixed" },
] as const;

const VALID_MODEL_TYPES = new Set<string>(MODEL_TYPE_OPTIONS.map((option) => option.value));
const VALID_STRATEGIES = new Set<string>(STRATEGY_OPTIONS.map((option) => option.value));

function getModelFundId(model: ReModel): string {
  return model.primary_fund_id ?? model.fund_id ?? "";
}

function enrichModels(models: ReV2Model[], funds: RepeFund[]): ReModel[] {
  const fundNameById = new Map(funds.map((fund) => [fund.fund_id, fund.name]));
  return models.map((model) => ({
    ...model,
    fund_id: model.primary_fund_id ?? null,
    fund_name: model.primary_fund_id ? fundNameById.get(model.primary_fund_id) : undefined,
  }));
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
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [models, setModels] = useState<ReModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newModelType, setNewModelType] = useState<string>("scenario");
  const [newStrategy, setNewStrategy] = useState<string>("equity");
  const [newFundId, setNewFundId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadModels = useCallback(async (fundRows: RepeFund[]) => {
    if (!envId) {
      setModels([]);
      return;
    }
    const modelRows = await listAllModels(envId);
    setModels(enrichModels(modelRows, fundRows));
  }, [envId]);

  const loadPageData = useCallback(async () => {
    if (!businessId && !envId) return;
    setLoading(true);
    try {
      const fundRows = await listReV1Funds({ env_id: envId, business_id: businessId || undefined });
      setFunds(fundRows);
      setNewFundId((currentFundId) => {
        if (currentFundId && fundRows.some((fund) => fund.fund_id === currentFundId)) {
          return currentFundId;
        }
        return fundRows[0]?.fund_id ?? "";
      });
      await loadModels(fundRows);
    } catch (err) {
      setFunds([]);
      setModels([]);
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, [businessId, envId, loadModels]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  useEffect(() => {
    if (!success) return;
    const timeoutId = window.setTimeout(() => setSuccess(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [success]);

  const selectedFund = useMemo(
    () => funds.find((fund) => fund.fund_id === newFundId) ?? null,
    [funds, newFundId],
  );

  const duplicateMessage = useMemo(() => {
    const trimmedName = newName.trim().toLowerCase();
    if (!newFundId || !trimmedName) return null;
    const duplicate = models.find(
      (model) => getModelFundId(model) === newFundId && model.name.toLowerCase().trim() === trimmedName,
    );
    return duplicate
      ? `A model named "${newName.trim()}" already exists in that fund. Choose a different name.`
      : null;
  }, [models, newFundId, newName]);

  const noFundsAvailable = funds.length === 0;

  const validateCreate = () => {
    if (!newName.trim()) return "Model name is required.";
    if (noFundsAvailable) return "No funds are available in this environment. Create a fund before creating a model.";
    if (!newFundId) return "Select a fund before creating a model.";
    if (!selectedFund) return "Select a valid fund before creating a model.";
    if (!VALID_MODEL_TYPES.has(newModelType)) return "Select a valid model type.";
    if (!VALID_STRATEGIES.has(newStrategy)) return "Select a valid strategy.";
    return duplicateMessage;
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;

    const validationError = validateCreate();
    if (validationError) {
      setSuccess(null);
      setError(validationError);
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    const payload = {
      env_id: envId || undefined,
      primary_fund_id: newFundId,
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      model_type: newModelType,
      strategy_type: newStrategy,
    } as const;

    try {
      await createCrossFundModel(payload);
      await loadModels(funds);
      setNewName("");
      setNewDesc("");
      setNewModelType("scenario");
      setNewStrategy("equity");
      setNewFundId(selectedFund?.fund_id ?? funds[0]?.fund_id ?? "");
      setSuccess(`Created "${payload.name}" and refreshed the models list.`);
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
      window.location.assign(`${basePath}/models/${cloned.model_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clone model");
    } finally {
      setCloningId(null);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-bm-muted2">Loading models...</div>;
  }

  return (
    <RepeIndexScaffold
      title="Models"
      subtitle="Create and manage cross-fund scenario models for PE and real estate analysis"
      className="w-full"
    >
      <section className="space-y-6" data-testid="re-models-page">
        {models.length === 0 ? (
          <div className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-6 text-sm text-bm-muted2">
            No models yet. Create one below.
          </div>
        ) : (
          <div className={reIndexTableShellClass}>
            <table className={`${reIndexTableClass} min-w-[760px]`}>
              <thead>
                <tr className={reIndexTableHeadRowClass}>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Fund</th>
                  <th className="px-4 py-3 font-medium">Type</th>
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
                        href={`${basePath}/models/${m.model_id}`}
                        className={`${reIndexPrimaryCellClass} cursor-pointer`}
                      >
                        {m.name}
                      </a>
                      {m.description ? (
                        <p className="mt-1 text-[12px] text-bm-muted2">{m.description}</p>
                      ) : null}
                    </td>
                    <td className={`px-4 py-4 align-middle ${reIndexSecondaryCellClass}`}>
                      {m.fund_name || "—"}
                    </td>
                    <td className="px-4 py-4 align-middle">
                      <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                        {(m.model_type || "scenario").replaceAll("_", " ")}
                      </span>
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
        )}

        <form
          className="space-y-3 rounded-xl border border-bm-border/70 bg-bm-surface/10 p-4"
          onSubmit={handleCreate}
        >
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-bm-muted2">Create Model</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            <label className={reIndexControlLabelClass}>
              Model name
              <input
                className={reIndexInputClass}
                placeholder="Model name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="model-name-input"
              />
            </label>
            <label className={reIndexControlLabelClass}>
              Description
              <input
                className={reIndexInputClass}
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                data-testid="model-desc-input"
              />
            </label>
            <label className={reIndexControlLabelClass}>
              Model type
              <select
                className={reIndexInputClass}
                value={newModelType}
                onChange={(e) => setNewModelType(e.target.value)}
                data-testid="model-type-select"
              >
                {MODEL_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={reIndexControlLabelClass}>
              Strategy
              <select
                className={reIndexInputClass}
                value={newStrategy}
                onChange={(e) => setNewStrategy(e.target.value)}
                data-testid="model-strategy-select"
              >
                {STRATEGY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={reIndexControlLabelClass}>
              Fund
              <select
                className={reIndexInputClass}
                value={newFundId}
                onChange={(e) => setNewFundId(e.target.value)}
                data-testid="model-fund-select"
              >
                <option value="">Select fund</option>
                {funds.map((fund) => (
                  <option key={fund.fund_id} value={fund.fund_id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={creating || noFundsAvailable}
              className={reIndexActionClass}
              data-testid="create-model-btn"
            >
              <PlusCircle size={14} />
              {creating ? "Creating..." : "Create Model"}
            </button>
          </div>
          {noFundsAvailable ? (
            <p className="text-xs text-amber-400">
              No funds are available in this environment. Create a fund before creating a model.
            </p>
          ) : null}
          {duplicateMessage ? (
            <p className="text-xs text-amber-400">{duplicateMessage}</p>
          ) : null}
          {success ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
              {success}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </form>
      </section>
    </RepeIndexScaffold>
  );
}
