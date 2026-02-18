"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  createCrmAccount,
  createCrmOpportunity,
  listCrmAccounts,
  listCrmOpportunities,
  listCrmPipelineStages,
  type CrmAccount,
  type CrmOpportunity,
  type CrmPipelineStage,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

export default function CrmPage() {
  const { businessId } = useBusinessContext();
  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [stages, setStages] = useState<CrmPipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<CrmOpportunity[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [accountName, setAccountName] = useState("GreenRock Property Group (Test)");
  const [opportunityName, setOpportunityName] = useState("Dallas Multifamily Rollup (Test)");
  const [opportunityAmount, setOpportunityAmount] = useState("25000000");
  const [accountId, setAccountId] = useState("");
  const [stageId, setStageId] = useState("");

  async function refresh() {
    if (!businessId) return;
    const [accountRows, stageRows, oppRows] = await Promise.all([
      listCrmAccounts(businessId),
      listCrmPipelineStages(businessId),
      listCrmOpportunities(businessId),
    ]);
    setAccounts(accountRows);
    setStages(stageRows);
    setOpportunities(oppRows);
    if (!accountId && accountRows[0]) setAccountId(accountRows[0].crm_account_id);
    if (!stageId && stageRows[0]) setStageId(stageRows[0].crm_pipeline_stage_id);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : "Failed to load CRM"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  async function onCreateAccount(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Creating CRM account...");
    try {
      await createCrmAccount({ business_id: businessId, name: accountName, account_type: "customer" });
      await refresh();
      setStatus("CRM account created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create CRM account");
      setStatus("");
    }
  }

  async function onCreateOpportunity(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Creating opportunity...");
    try {
      await createCrmOpportunity({
        business_id: businessId,
        name: opportunityName,
        amount: opportunityAmount,
        crm_account_id: accountId || undefined,
        crm_pipeline_stage_id: stageId || undefined,
      });
      await refresh();
      setStatus("Opportunity created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create opportunity");
      setStatus("");
    }
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">CRM</p>
        <h1 className="text-2xl font-bold">Native CRM (Canonical)</h1>
      </div>

      {error && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm">{error}</div>}
      {status && <div className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-3 text-sm">{status}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={onCreateAccount} className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-lg">Create Account</h2>
          <input
            className="w-full rounded border border-bm-border bg-bm-surface px-3 py-2"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          <button className="rounded bg-bm-accent px-3 py-2 text-sm font-semibold text-white" type="submit">
            Save Account
          </button>
        </form>

        <form onSubmit={onCreateOpportunity} className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-lg">Create Opportunity</h2>
          <input
            className="w-full rounded border border-bm-border bg-bm-surface px-3 py-2"
            value={opportunityName}
            onChange={(e) => setOpportunityName(e.target.value)}
          />
          <input
            className="w-full rounded border border-bm-border bg-bm-surface px-3 py-2"
            value={opportunityAmount}
            onChange={(e) => setOpportunityAmount(e.target.value)}
          />
          <select
            className="w-full rounded border border-bm-border bg-bm-surface px-3 py-2"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">No account</option>
            {accounts.map((a) => (
              <option key={a.crm_account_id} value={a.crm_account_id}>{a.name}</option>
            ))}
          </select>
          <select
            className="w-full rounded border border-bm-border bg-bm-surface px-3 py-2"
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
          >
            <option value="">Default stage</option>
            {stages.map((s) => (
              <option key={s.crm_pipeline_stage_id} value={s.crm_pipeline_stage_id}>{s.label}</option>
            ))}
          </select>
          <button className="rounded bg-bm-accent px-3 py-2 text-sm font-semibold text-white" type="submit">
            Save Opportunity
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-lg">Accounts</h2>
          {accounts.map((a) => (
            <div key={a.crm_account_id} className="rounded border border-bm-border px-3 py-2">
              <p className="font-medium">{a.name}</p>
              <p className="text-xs text-bm-muted2">{a.account_type}</p>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-sm text-bm-muted2">No accounts yet.</p>}
        </div>

        <div className="bm-glass rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-lg">Opportunities</h2>
          {opportunities.map((o) => (
            <div key={o.crm_opportunity_id} className="rounded border border-bm-border px-3 py-2">
              <p className="font-medium">{o.name}</p>
              <p className="text-xs text-bm-muted2">
                {Number(o.amount).toLocaleString()} {o.currency_code} • {o.stage_label || o.status}
              </p>
            </div>
          ))}
          {opportunities.length === 0 && <p className="text-sm text-bm-muted2">No opportunities yet.</p>}
        </div>
      </div>
    </div>
  );
}
