"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  createRepeDeal,
  listReV1Funds,
  listRepeDeals,
  RepeDeal,
  RepeFund,
} from "@/lib/bos-api";
import { useRepeContext, useRepeBasePath } from "@/lib/repe-context";

const STAGE_OPTIONS: Array<RepeDeal["stage"]> = [
  "sourcing",
  "underwriting",
  "ic",
  "closing",
  "operating",
  "exited",
];

const STAGE_LABELS: Record<RepeDeal["stage"], string> = {
  sourcing: "Sourced",
  underwriting: "Underwriting",
  ic: "IC",
  closing: "Closed",
  operating: "Asset Mgmt",
  exited: "Exited",
};

type InvestmentRow = RepeDeal & { fund_name: string };

export default function RepeInvestmentsPage() {
  const { businessId, environmentId, loading, contextError, initializeWorkspace } = useRepeContext();
  const basePath = useRepeBasePath();
  const searchParams = useSearchParams();
  const [funds, setFunds] = useState<RepeFund[]>([]);
  const [rows, setRows] = useState<InvestmentRow[]>([]);
  const [selectedFundId, setSelectedFundId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const [form, setForm] = useState({
    name: "",
    deal_type: "equity" as "equity" | "debt",
    stage: "sourcing" as RepeDeal["stage"],
    sponsor: "",
  });

  async function refreshInvestments(
    currentBusinessId: string | null,
    currentEnvId: string | null,
    preferredFundId?: string
  ) {
    const fundRows = await listReV1Funds({
      env_id: currentEnvId || undefined,
      business_id: currentBusinessId || undefined,
    });
    setFunds(fundRows);

    const candidate = preferredFundId || searchParams.get("fund") || "";
    const validPreferred = fundRows.some((fund) => fund.fund_id === candidate)
      ? candidate
      : fundRows[0]?.fund_id || "";
    setSelectedFundId(validPreferred);

    const grouped = await Promise.all(
      fundRows.map(async (fund) => {
        const deals = await listRepeDeals(fund.fund_id).catch(() => []);
        return deals.map((deal) => ({ ...deal, fund_name: fund.name }));
      })
    );
    setRows(grouped.flat());
  }

  useEffect(() => {
    if (!businessId && !environmentId) return;
    refreshInvestments(businessId, environmentId).catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load investments");
    });
  }, [businessId, environmentId, searchParams]);

  const selectedFund = useMemo(
    () => funds.find((fund) => fund.fund_id === selectedFundId) || null,
    [funds, selectedFundId]
  );

  async function onCreateInvestment(event: FormEvent) {
    event.preventDefault();
    if (!selectedFundId || (!businessId && !environmentId)) return;
    setError(null);
    setStatus("Creating investment...");
    try {
      const created = await createRepeDeal(selectedFundId, form);
      await refreshInvestments(businessId, environmentId, selectedFundId);
      setStatus(`Created investment: ${created.name}`);
      setForm((prev) => ({ ...prev, name: "", sponsor: "" }));
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : "Failed to create investment");
    }
  }

  if (!businessId) {
    return (
      <div className="rounded-xl border border-bm-border/70 p-4 text-sm space-y-2">
        <p className="text-bm-muted2">{loading ? "Initializing RE workspace..." : "RE workspace not initialized."}</p>
        {contextError ? <p className="text-red-400">{contextError}</p> : null}
        {!loading ? (
          <button
            type="button"
            className="rounded-lg border border-bm-border px-3 py-2 hover:bg-bm-surface/40"
            onClick={() => void initializeWorkspace()}
          >
            Retry Context Setup
          </button>
        ) : null}
      </div>
    );
  }

  if (funds.length === 0) {
    return (
      <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-2" data-testid="re-investments-empty-funds">
        <h2 className="text-lg font-semibold">Investments</h2>
        <p className="text-sm text-bm-muted2">You need a fund before creating investments.</p>
        <Link href={`${basePath}/funds/new`} className="inline-flex rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40">
          Create Fund
        </Link>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-bm-border/70 bg-bm-surface/25 p-4 space-y-4" data-testid="re-investments-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Investments</h2>
          <p className="text-sm text-bm-muted2">Investments are implemented on the current deal model.</p>
        </div>
        <Link
          href={`${basePath}/funds/new`}
          className="rounded-lg border border-bm-border px-3 py-2 text-sm hover:bg-bm-surface/40"
        >
          + New Fund
        </Link>
      </div>

      <form onSubmit={onCreateInvestment} className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-bm-border/70 p-3">
        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Fund
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={selectedFundId}
            onChange={(e) => setSelectedFundId(e.target.value)}
            required
          >
            {funds.map((fund) => (
              <option key={fund.fund_id} value={fund.fund_id}>{fund.name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Investment Name
          <input
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={form.name}
            onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
            placeholder="Downtown JV"
            required
          />
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Sponsor / Counterparty
          <input
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={form.sponsor}
            onChange={(e) => setForm((v) => ({ ...v, sponsor: e.target.value }))}
            placeholder="ABC Sponsor"
          />
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Type
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={form.deal_type}
            onChange={(e) => setForm((v) => ({ ...v, deal_type: e.target.value as "equity" | "debt" }))}
          >
            <option value="equity">Equity</option>
            <option value="debt">Debt</option>
          </select>
        </label>

        <label className="text-xs uppercase tracking-[0.1em] text-bm-muted2">
          Stage
          <select
            className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
            value={form.stage}
            onChange={(e) => setForm((v) => ({ ...v, stage: e.target.value as RepeDeal["stage"] }))}
          >
            {STAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{STAGE_LABELS[option]}</option>
            ))}
          </select>
        </label>

        <div className="self-end">
          <button type="submit" className="w-full rounded-lg bg-bm-accent px-4 py-2 text-sm text-white">
            Create Investment
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-bm-border/70 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/70 bg-bm-surface/20">
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Name</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Fund</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Type</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Stage</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2">Sponsor</th>
              <th className="px-4 py-2.5 text-left text-xs uppercase tracking-[0.1em] text-bm-muted2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-bm-muted2">No investments yet.</td>
              </tr>
            ) : (
              rows.map((deal) => (
                <tr key={deal.deal_id} className="hover:bg-bm-surface/20">
                  <td className="px-4 py-3 font-medium">{deal.name}</td>
                  <td className="px-4 py-3 text-bm-muted2">{deal.fund_name}</td>
                  <td className="px-4 py-3 text-bm-muted2 capitalize">{deal.deal_type}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-bm-border/70 px-2 py-0.5 text-xs">
                      {STAGE_LABELS[deal.stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-bm-muted2">{deal.sponsor || "—"}</td>
                  <td className="px-4 py-3">
                    <Link href={`${basePath}/deals/${deal.deal_id}`} className="text-xs text-bm-accent hover:underline">Open →</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedFund ? (
        <p className="text-xs text-bm-muted2">Creating new investments in: {selectedFund.name}</p>
      ) : null}
      {status ? <p className="text-sm text-bm-muted2">{status}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
