"use client";

import React from "react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  createCrossFundModel,
  listAllModels,
  listReV1Funds,
  ReV2Model,
  RepeFund,
} from "@/lib/bos-api";
import { useReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { useRepeBasePath } from "@/lib/repe-context";
import { Archive, Lock, FileEdit, Copy, ExternalLink, PlusCircle } from "lucide-react";
import { CircularCreateButton } from "@/components/ui/CircularCreateButton";
import { Dialog } from "@/components/ui/Dialog";
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

/* ── Constants ─────────────────────────────────────────────────── */

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

const STATUS_STYLES: Record<string, string> = {
  draft: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
  official_base_case: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  approved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  archived: "border-zinc-600/30 bg-zinc-700/10 text-zinc-500",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  official_base_case: "Official Base Case",
  approved: "Official Base Case",
  archived: "Archived",
};

/* ── Helpers ────────────────────────────────────────────────────── */

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

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatTypeLabel(modelType?: string, strategyType?: string): string {
  const type = (modelType || "scenario").replaceAll("_", " ");
  const strategy = strategyType || "equity";
  return `${type[0].toUpperCase()}${type.slice(1)} \u00B7 ${strategy[0].toUpperCase()}${strategy.slice(1)}`;
}

/* ── CreateModelDialog ─────────────────────────────────────────── */

function CreateModelDialog({
  open,
  onOpenChange,
  envId,
  basePath,
  funds,
  existingModels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  envId: string;
  basePath: string;
  funds: RepeFund[];
  existingModels: ReModel[];
}) {
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newModelType, setNewModelType] = useState<string>("scenario");
  const [newStrategy, setNewStrategy] = useState<string>("equity");
  const [newFundId, setNewFundId] = useState(funds[0]?.fund_id ?? "");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setNewName("");
      setNewDesc("");
      setNewModelType("scenario");
      setNewStrategy("equity");
      setNewFundId(funds[0]?.fund_id ?? "");
      setCreating(false);
      setError(null);
    }
  }, [open, funds]);

  const noFundsAvailable = funds.length === 0;
  const selectedFund = funds.find((fund) => fund.fund_id === newFundId) ?? null;

  const duplicateMessage = (() => {
    const trimmedName = newName.trim().toLowerCase();
    if (!newFundId || !trimmedName) return null;
    const duplicate = existingModels.find(
      (model) => getModelFundId(model) === newFundId && model.name.toLowerCase().trim() === trimmedName,
    );
    return duplicate
      ? `A model named "${newName.trim()}" already exists in that fund.`
      : null;
  })();

  const validate = () => {
    if (!envId) return "Environment context is unavailable. Reload the page and try again.";
    if (!newName.trim()) return "Model name is required.";
    if (noFundsAvailable) return "No funds are available. Create a fund first.";
    if (!newFundId) return "Select a fund.";
    if (!selectedFund) return "Select a valid fund.";
    if (!VALID_MODEL_TYPES.has(newModelType)) return "Select a valid model type.";
    if (!VALID_STRATEGIES.has(newStrategy)) return "Select a valid strategy.";
    return duplicateMessage;
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const created = await createCrossFundModel({
        env_id: envId || undefined,
        primary_fund_id: newFundId,
        name: newName.trim(),
        description: newDesc.trim() || undefined,
        model_type: newModelType,
        strategy_type: newStrategy,
      });
      onOpenChange(false);
      window.location.assign(`${basePath}/models/${created.model_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create model");
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Model"
      description="Create a cross-fund scenario model"
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-4 py-2 text-sm text-bm-muted2 transition-colors hover:bg-bm-surface/30 hover:text-bm-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-model-form"
            disabled={creating || noFundsAvailable}
            className={reIndexActionClass}
            data-testid="create-model-btn"
          >
            <PlusCircle size={14} />
            {creating ? "Creating..." : "Create Model"}
          </button>
        </div>
      }
    >
      <form id="create-model-form" onSubmit={handleCreate} className="space-y-4">
        <label className={reIndexControlLabelClass}>
          Model name
          <input
            className={reIndexInputClass}
            placeholder="e.g., Base Case Q2"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            data-testid="model-name-input"
          />
        </label>
        <label className={reIndexControlLabelClass}>
          Description
          <input
            className={reIndexInputClass}
            placeholder="Optional"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            data-testid="model-desc-input"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
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
        {noFundsAvailable ? (
          <p className="text-xs text-amber-400">
            No funds are available in this environment. Create a fund before creating a model.
          </p>
        ) : null}
        {duplicateMessage ? (
          <p className="text-xs text-amber-400">{duplicateMessage}</p>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

/* ── Component ─────────────────────────────────────────────────── */

export default function ReModelsPage() {
  const { envId, businessId } = useReEnv();
  const basePath = useRepeBasePath();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [models, setModels] = useState<ReModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  async function loadModels(fundRows: RepeFund[]) {
    if (!envId) {
      setModels([]);
      return;
    }
    const modelRows = await listAllModels(envId);
    setModels(enrichModels(modelRows, fundRows));
  }

  useEffect(() => {
    if (!businessId && !envId) return;

    let cancelled = false;

    async function loadPageData() {
      setLoading(true);
      setError(null);
      try {
        const fundRows = await listReV1Funds({ env_id: envId, business_id: businessId || undefined });
        if (cancelled) return;
        setFunds(fundRows);
        await loadModels(fundRows);
      } catch (err) {
        if (cancelled) return;
        setFunds([]);
        setModels([]);
        setError(err instanceof Error ? err.message : "Failed to load models");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [businessId, envId]);

  const handleCloneModel = async (modelId: string) => {
    setCloningId(modelId);
    setError(null);
    try {
      const cloned = await cloneModel(modelId);
      setModels((prev) => [cloned, ...prev]);
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
      subtitle="Cross-fund scenario models"
      className="w-full"
      action={
        <CircularCreateButton
          tooltip="New Model"
          onClick={() => setDialogOpen(true)}
          data-testid="new-model-btn"
        />
      }
    >
      <section className="space-y-6" data-testid="re-models-page">
        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {models.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-bm-border/50 bg-bm-surface/[0.03] py-16 text-center">
            <div className="mb-4 rounded-full border border-bm-border/40 bg-bm-surface/20 p-4">
              <FileEdit size={24} className="text-bm-muted2" />
            </div>
            <h3 className="text-base font-semibold text-bm-text">No models yet</h3>
            <p className="mt-1 max-w-sm text-sm text-bm-muted2">
              Create a cross-fund scenario model to analyze fund impact, run Monte Carlo simulations, and compare strategies.
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={`${reIndexActionClass} mt-6`}
              data-testid="empty-create-model-btn"
            >
              <PlusCircle size={14} />
              Create Your First Model
            </button>
          </div>
        ) : (
          <div className={reIndexTableShellClass}>
            <table className={`${reIndexTableClass} min-w-[820px]`}>
              <thead>
                <tr className={reIndexTableHeadRowClass}>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Fund</th>
                  <th className="px-3 py-3 font-medium">Type</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Entities</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">Last Run</th>
                  <th className="px-3 py-3 font-medium">Created</th>
                  <th className="w-24 px-2 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className={reIndexTableBodyClass}>
                {models.map((m) => (
                  <tr key={m.model_id} className={`${reIndexTableRowClass} group`} data-testid={`model-row-${m.model_id}`}>
                    <td className="px-4 py-3 align-middle">
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
                    <td className={`px-3 py-3 align-middle ${reIndexSecondaryCellClass}`}>
                      {m.fund_name || "\u2014"}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] text-bm-muted2">
                        {formatTypeLabel(m.model_type, m.strategy_type)}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${STATUS_STYLES[m.status] || STATUS_STYLES.draft}`}>
                        {m.status === "official_base_case" || m.status === "approved" ? <Lock size={10} /> : m.status === "archived" ? <Archive size={10} /> : <FileEdit size={10} />}
                        {STATUS_LABELS[m.status] || m.status}
                      </span>
                    </td>
                    <td className={`px-3 py-3 align-middle ${reIndexSecondaryCellClass}`}>
                      {m.scope_count ? `${m.scope_count} entities` : "\u2014"}
                    </td>
                    <td className={`px-3 py-3 align-middle whitespace-nowrap ${reIndexSecondaryCellClass}`}>
                      {m.last_run_at ? (
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            m.last_run_status === "completed" ? "bg-emerald-400" :
                            m.last_run_status === "failed" ? "bg-red-400" :
                            "bg-amber-400"
                          }`} />
                          {formatRelativeDate(m.last_run_at)}
                        </span>
                      ) : "\u2014"}
                    </td>
                    <td className={`px-3 py-3 align-middle ${reIndexSecondaryCellClass}`}>
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-3 align-middle">
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <a
                          href={`${basePath}/models/${m.model_id}`}
                          className="rounded p-1.5 text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
                          title="Open"
                          data-testid={`open-model-${m.model_id}`}
                        >
                          <ExternalLink size={14} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCloneModel(m.model_id)}
                          disabled={cloningId === m.model_id}
                          className="rounded p-1.5 text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text disabled:opacity-50"
                          title="Duplicate"
                          data-testid={`clone-model-${m.model_id}`}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CreateModelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        envId={envId}
        basePath={basePath}
        funds={funds}
        existingModels={models}
      />
    </RepeIndexScaffold>
  );
}
