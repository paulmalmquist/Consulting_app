"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  FinAssetInvestment,
  FinCapitalCall,
  FinCommitment,
  FinDistributionEvent,
  FinDistributionPayout,
  FinFund,
  FinParticipant,
  FinPartition,
  createFinAsset,
  createFinCapitalCall,
  createFinCommitment,
  createFinDistributionEvent,
  createFinFund,
  createFinParticipant,
  listFinAssets,
  listFinCapitalCalls,
  listFinCommitments,
  listFinDistributionEvents,
  listFinDistributionPayouts,
  listFinFunds,
  listFinParticipants,
  listFinPartitions,
  listFinWaterfallAllocations,
  runFinWaterfall,
} from "@/lib/bos-api";
import { useBusinessContext } from "@/lib/business-context";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function RepeFinancePage() {
  const { businessId } = useBusinessContext();
  const [partitions, setPartitions] = useState<FinPartition[]>([]);
  const [partitionId, setPartitionId] = useState("");
  const [funds, setFunds] = useState<FinFund[]>([]);
  const [activeFundId, setActiveFundId] = useState("");
  const [participants, setParticipants] = useState<FinParticipant[]>([]);
  const [commitments, setCommitments] = useState<FinCommitment[]>([]);
  const [capitalCalls, setCapitalCalls] = useState<FinCapitalCall[]>([]);
  const [assets, setAssets] = useState<FinAssetInvestment[]>([]);
  const [distributionEvents, setDistributionEvents] = useState<FinDistributionEvent[]>([]);
  const [payouts, setPayouts] = useState<FinDistributionPayout[]>([]);
  const [selectedDistributionEventId, setSelectedDistributionEventId] = useState("");
  const [waterfallRunId, setWaterfallRunId] = useState("");
  const [allocations, setAllocations] = useState<Array<Record<string, unknown>>>([]);
  const [sameKeyRunId, setSameKeyRunId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [fundForm, setFundForm] = useState({
    fund_code: "VAMF1",
    name: "Value-Add Multifamily Fund I (Test)",
    strategy: "Value-Add",
    vintage_date: "2025-01-15",
    pref_rate: "0.08",
    carry_rate: "0.20",
    waterfall_style: "american" as "american" | "european",
  });
  const [participantForm, setParticipantForm] = useState({
    name: "Sunshine Pension LP (Test)",
    participant_type: "lp" as FinParticipant["participant_type"],
  });
  const [commitmentForm, setCommitmentForm] = useState({
    fin_participant_id: "",
    commitment_role: "lp" as "lp" | "gp" | "co_invest",
    commitment_date: "2025-01-15",
    committed_amount: "50000000",
  });
  const [capitalCallForm, setCapitalCallForm] = useState({
    call_date: "2025-02-01",
    amount_requested: "10000000",
    purpose: "Initial acquisition capital",
  });
  const [assetForm, setAssetForm] = useState({
    asset_name: "Palm Ridge Apartments (Test)",
    acquisition_date: "2025-02-15",
    cost_basis: "8000000",
    current_valuation: "12000000",
  });
  const [distributionForm, setDistributionForm] = useState({
    event_date: "2026-01-20",
    gross_proceeds: "12000000",
    net_distributable: "12000000",
    event_type: "sale" as "sale" | "partial_sale" | "refinance" | "operating_distribution" | "other",
    fin_asset_investment_id: "",
  });

  const activeFund = useMemo(
    () => funds.find((f) => f.fin_fund_id === activeFundId) || null,
    [funds, activeFundId]
  );
  const selectedEvent = useMemo(
    () => distributionEvents.find((e) => e.fin_distribution_event_id === selectedDistributionEventId) || null,
    [distributionEvents, selectedDistributionEventId]
  );
  const payoutTotal = useMemo(
    () => payouts.reduce((sum, row) => sum + toMoney(row.amount), 0),
    [payouts]
  );

  async function refreshFundData(fundId: string) {
    const [cRows, callRows, aRows, dRows] = await Promise.all([
      listFinCommitments(fundId),
      listFinCapitalCalls(fundId),
      listFinAssets(fundId),
      listFinDistributionEvents(fundId),
    ]);
    setCommitments(cRows);
    setCapitalCalls(callRows);
    setAssets(aRows);
    setDistributionEvents(dRows);
    if (dRows.length > 0) {
      const firstEventId = dRows[0].fin_distribution_event_id;
      setSelectedDistributionEventId(firstEventId);
      const pRows = await listFinDistributionPayouts(fundId, firstEventId);
      setPayouts(pRows);
    } else {
      setSelectedDistributionEventId("");
      setPayouts([]);
    }
  }

  async function refreshFunds() {
    if (!businessId || !partitionId) return;
    const fRows = await listFinFunds(businessId, partitionId);
    setFunds(fRows);
    if (fRows.length > 0) {
      const targetFundId = fRows.some((f) => f.fin_fund_id === activeFundId)
        ? activeFundId
        : fRows[0].fin_fund_id;
      setActiveFundId(targetFundId);
      await refreshFundData(targetFundId);
    }
  }

  useEffect(() => {
    if (!businessId) return;
    listFinPartitions(businessId)
      .then((rows) => {
        setPartitions(rows);
        const live = rows.find((row) => row.partition_type === "live");
        setPartitionId(live?.partition_id || rows[0]?.partition_id || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load partitions"));
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !partitionId) return;
    Promise.all([listFinParticipants(businessId), listFinFunds(businessId, partitionId)])
      .then(async ([pRows, fRows]) => {
        setParticipants(pRows);
        setFunds(fRows);
        if (fRows.length > 0) {
          const fundId = fRows[0].fin_fund_id;
          setActiveFundId(fundId);
          await refreshFundData(fundId);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load workspace"));
  }, [businessId, partitionId]);

  async function onCreateFund(e?: FormEvent) {
    e?.preventDefault();
    if (!businessId) {
      setError("Business context is missing.");
      return;
    }
    const resolvedPartitionId =
      partitionId ||
      partitions.find((row) => row.partition_type === "live")?.partition_id ||
      partitions[0]?.partition_id ||
      "";
    if (!resolvedPartitionId) {
      setError("No finance partition available for this business.");
      return;
    }
    if (!partitionId) {
      setPartitionId(resolvedPartitionId);
    }
    setError(null);
    setStatus("Creating fund...");
    try {
      const created = await createFinFund({
        business_id: businessId,
        partition_id: resolvedPartitionId,
        fund_code: fundForm.fund_code,
        name: fundForm.name,
        strategy: fundForm.strategy,
        vintage_date: fundForm.vintage_date,
        pref_rate: fundForm.pref_rate,
        carry_rate: fundForm.carry_rate,
        waterfall_style: fundForm.waterfall_style,
      });
      setActiveFundId(created.fin_fund_id);
      await refreshFunds();
      setStatus(`Fund created: ${created.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create fund");
      setStatus("");
    }
  }

  async function onCreateParticipant(e: FormEvent) {
    e.preventDefault();
    if (!businessId) return;
    setError(null);
    setStatus("Creating participant...");
    try {
      await createFinParticipant({
        business_id: businessId,
        name: participantForm.name,
        participant_type: participantForm.participant_type as "lp" | "gp" | "investor" | "provider" | "subcontractor" | "referral_source" | "other",
      });
      const rows = await listFinParticipants(businessId);
      setParticipants(rows);
      setStatus(`Participant created: ${participantForm.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create participant");
      setStatus("");
    }
  }

  async function onCreateCommitment(e: FormEvent) {
    e.preventDefault();
    if (!activeFundId) return;
    setError(null);
    setStatus("Saving commitment...");
    try {
      await createFinCommitment(activeFundId, commitmentForm);
      const rows = await listFinCommitments(activeFundId);
      setCommitments(rows);
      setStatus("Commitment saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create commitment");
      setStatus("");
    }
  }

  async function onCreateCapitalCall(e: FormEvent) {
    e.preventDefault();
    if (!activeFundId) return;
    setError(null);
    setStatus("Saving capital call...");
    try {
      await createFinCapitalCall(activeFundId, capitalCallForm);
      const rows = await listFinCapitalCalls(activeFundId);
      setCapitalCalls(rows);
      setStatus("Capital call saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create capital call");
      setStatus("");
    }
  }

  async function onCreateAsset(e: FormEvent) {
    e.preventDefault();
    if (!activeFundId) return;
    setError(null);
    setStatus("Saving asset...");
    try {
      await createFinAsset(activeFundId, assetForm);
      const rows = await listFinAssets(activeFundId);
      setAssets(rows);
      setDistributionForm((prev) => ({
        ...prev,
        fin_asset_investment_id: rows[0]?.fin_asset_investment_id || prev.fin_asset_investment_id,
      }));
      setStatus("Asset saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create asset");
      setStatus("");
    }
  }

  async function onCreateDistribution(e: FormEvent) {
    e.preventDefault();
    if (!activeFundId) return;
    setError(null);
    setStatus("Saving distribution event...");
    try {
      const created = await createFinDistributionEvent(activeFundId, distributionForm);
      const rows = await listFinDistributionEvents(activeFundId);
      setDistributionEvents(rows);
      setSelectedDistributionEventId(created.fin_distribution_event_id);
      setStatus("Distribution event saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create distribution event");
      setStatus("");
    }
  }

  async function onRunWaterfall(eventId: string, idemKey: string) {
    if (!activeFundId || !businessId || !partitionId) return;
    setError(null);
    setStatus("Running waterfall...");
    try {
      const out = await runFinWaterfall(activeFundId, {
        business_id: businessId,
        partition_id: partitionId,
        as_of_date: todayIso(),
        idempotency_key: idemKey,
        distribution_event_id: eventId,
      });
      setWaterfallRunId(out.run.fin_run_id);
      const [allocRows, payoutRows] = await Promise.all([
        listFinWaterfallAllocations(activeFundId, out.run.fin_run_id),
        listFinDistributionPayouts(activeFundId, eventId),
      ]);
      setAllocations(allocRows as Array<Record<string, unknown>>);
      setPayouts(payoutRows);
      setStatus(`Waterfall completed: ${out.run.fin_run_id.slice(0, 8)} (${out.run.status})`);
      return out.run.fin_run_id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run waterfall");
      setStatus("");
      return "";
    }
  }

  async function onRunDeterminismCheck() {
    if (!selectedDistributionEventId) return;
    const key = `wf_${selectedDistributionEventId}_${todayIso()}`;
    const firstRunId = await onRunWaterfall(selectedDistributionEventId, key);
    const secondRunId = await onRunWaterfall(selectedDistributionEventId, key);
    setSameKeyRunId(secondRunId || "");
    if (firstRunId && secondRunId && firstRunId === secondRunId) {
      setStatus(`Determinism check passed (idempotent run ${firstRunId.slice(0, 8)}).`);
    }
  }

  async function onSelectFund(fundId: string) {
    setActiveFundId(fundId);
    setAllocations([]);
    setWaterfallRunId("");
    setSameKeyRunId("");
    await refreshFundData(fundId);
  }

  async function onSelectDistributionEvent(eventId: string) {
    if (!activeFundId) return;
    setSelectedDistributionEventId(eventId);
    const pRows = await listFinDistributionPayouts(activeFundId, eventId);
    setPayouts(pRows);
  }

  if (!businessId) {
    return <p className="text-sm text-bm-muted">Select or create a business to access Finance.</p>;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.14em] text-bm-muted2">REPE Workspace</p>
        <h1 className="text-2xl font-bold">Private Equity Waterfall Operations</h1>
      </div>

      <section className="bm-glass rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Partition</h2>
        <select
          className="w-full md:w-96 rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm"
          value={partitionId}
          onChange={(e) => setPartitionId(e.target.value)}
          data-testid="repe-partition-select"
        >
          {partitions.map((p) => (
            <option key={p.partition_id} value={p.partition_id}>
              {p.key} ({p.partition_type})
            </option>
          ))}
        </select>
      </section>

      <section className="bm-glass rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">Create Fund</h2>
        <form onSubmit={onCreateFund} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input data-testid="fund-name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.name} onChange={(e) => setFundForm((f) => ({ ...f, name: e.target.value }))} required />
          <input data-testid="fund-code" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.fund_code} onChange={(e) => setFundForm((f) => ({ ...f, fund_code: e.target.value }))} required />
          <input data-testid="fund-strategy" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.strategy} onChange={(e) => setFundForm((f) => ({ ...f, strategy: e.target.value }))} required />
          <input data-testid="fund-vintage" type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.vintage_date} onChange={(e) => setFundForm((f) => ({ ...f, vintage_date: e.target.value }))} required />
          <input data-testid="fund-pref" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.pref_rate} onChange={(e) => setFundForm((f) => ({ ...f, pref_rate: e.target.value }))} required />
          <input data-testid="fund-carry" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.carry_rate} onChange={(e) => setFundForm((f) => ({ ...f, carry_rate: e.target.value }))} required />
          <select data-testid="fund-style" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={fundForm.waterfall_style} onChange={(e) => setFundForm((f) => ({ ...f, waterfall_style: e.target.value as "american" | "european" }))}>
            <option value="american">American</option>
            <option value="european">European</option>
          </select>
          <div>
            <button
              data-testid="create-fund"
              type="button"
              onClick={() => void onCreateFund()}
              className="rounded-lg bg-bm-accent px-4 py-2 text-sm text-white"
            >
              Create Fund
            </button>
          </div>
        </form>

        <div className="space-y-2">
          {funds.map((fund) => (
            <button
              key={fund.fin_fund_id}
              data-testid={`fund-row-${fund.fin_fund_id}`}
              onClick={() => void onSelectFund(fund.fin_fund_id)}
              className={`w-full text-left rounded-lg border px-3 py-2 text-sm ${activeFundId === fund.fin_fund_id ? "border-bm-accent" : "border-bm-border/70"}`}
            >
              {fund.name}
            </button>
          ))}
        </div>
      </section>

      {activeFund ? (
        <>
          <section className="bm-glass rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Participants & Commitments</h2>
            <form onSubmit={onCreateParticipant} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input data-testid="participant-name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={participantForm.name} onChange={(e) => setParticipantForm((f) => ({ ...f, name: e.target.value }))} required />
              <select data-testid="participant-type" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={participantForm.participant_type} onChange={(e) => setParticipantForm((f) => ({ ...f, participant_type: e.target.value as FinParticipant["participant_type"] }))}>
                <option value="lp">lp</option>
                <option value="gp">gp</option>
                <option value="investor">investor</option>
              </select>
              <button data-testid="create-participant" type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm">Add Participant</button>
            </form>

            <form onSubmit={onCreateCommitment} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select data-testid="commitment-participant" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={commitmentForm.fin_participant_id} onChange={(e) => setCommitmentForm((f) => ({ ...f, fin_participant_id: e.target.value }))} required>
                <option value="">Select participant</option>
                {participants.map((p) => (
                  <option key={p.fin_participant_id} value={p.fin_participant_id}>{p.name}</option>
                ))}
              </select>
              <select data-testid="commitment-role" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={commitmentForm.commitment_role} onChange={(e) => setCommitmentForm((f) => ({ ...f, commitment_role: e.target.value as "lp" | "gp" | "co_invest" }))}>
                <option value="lp">lp</option>
                <option value="gp">gp</option>
                <option value="co_invest">co_invest</option>
              </select>
              <input data-testid="commitment-date" type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={commitmentForm.commitment_date} onChange={(e) => setCommitmentForm((f) => ({ ...f, commitment_date: e.target.value }))} required />
              <input data-testid="commitment-amount" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={commitmentForm.committed_amount} onChange={(e) => setCommitmentForm((f) => ({ ...f, committed_amount: e.target.value }))} required />
              <button data-testid="create-commitment" type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm md:col-span-1">Save Commitment</button>
            </form>

            <div className="space-y-1">
              {commitments.map((row) => (
                <div key={row.fin_commitment_id} className="text-xs text-bm-muted2" data-testid="commitment-row">
                  {row.participant_name || row.fin_participant_id} · {row.commitment_role} · {row.committed_amount}
                </div>
              ))}
            </div>
          </section>

          <section className="bm-glass rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Capital Calls</h2>
            <form onSubmit={onCreateCapitalCall} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input data-testid="capital-call-date" type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={capitalCallForm.call_date} onChange={(e) => setCapitalCallForm((f) => ({ ...f, call_date: e.target.value }))} required />
              <input data-testid="capital-call-amount" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={capitalCallForm.amount_requested} onChange={(e) => setCapitalCallForm((f) => ({ ...f, amount_requested: e.target.value }))} required />
              <input className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={capitalCallForm.purpose} onChange={(e) => setCapitalCallForm((f) => ({ ...f, purpose: e.target.value }))} />
              <button data-testid="create-capital-call" type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm">Save Capital Call</button>
            </form>
            <div className="space-y-1">
              {capitalCalls.map((row) => (
                <div key={row.fin_capital_call_id} className="text-xs text-bm-muted2" data-testid="capital-call-row">
                  Call {row.call_number} · {row.call_date} · {row.amount_requested}
                </div>
              ))}
            </div>
          </section>

          <section className="bm-glass rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Assets</h2>
            <form onSubmit={onCreateAsset} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input data-testid="asset-name" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={assetForm.asset_name} onChange={(e) => setAssetForm((f) => ({ ...f, asset_name: e.target.value }))} required />
              <input data-testid="asset-date" type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={assetForm.acquisition_date} onChange={(e) => setAssetForm((f) => ({ ...f, acquisition_date: e.target.value }))} required />
              <input data-testid="asset-cost" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={assetForm.cost_basis} onChange={(e) => setAssetForm((f) => ({ ...f, cost_basis: e.target.value }))} required />
              <button data-testid="create-asset" type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm">Save Asset</button>
            </form>
            <div className="space-y-1">
              {assets.map((row) => (
                <div key={row.fin_asset_investment_id} className="text-xs text-bm-muted2" data-testid="asset-row">
                  {row.asset_name} · {row.acquisition_date} · {row.cost_basis}
                </div>
              ))}
            </div>
          </section>

          <section className="bm-glass rounded-xl p-4 space-y-3">
            <h2 className="font-semibold">Distributions & Ledger</h2>
            <form onSubmit={onCreateDistribution} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <input data-testid="distribution-date" type="date" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={distributionForm.event_date} onChange={(e) => setDistributionForm((f) => ({ ...f, event_date: e.target.value }))} required />
              <input data-testid="distribution-amount" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={distributionForm.gross_proceeds} onChange={(e) => setDistributionForm((f) => ({ ...f, gross_proceeds: e.target.value, net_distributable: e.target.value }))} required />
              <select data-testid="distribution-asset" className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={distributionForm.fin_asset_investment_id} onChange={(e) => setDistributionForm((f) => ({ ...f, fin_asset_investment_id: e.target.value }))}>
                <option value="">No asset link</option>
                {assets.map((a) => (
                  <option key={a.fin_asset_investment_id} value={a.fin_asset_investment_id}>{a.asset_name}</option>
                ))}
              </select>
              <select className="rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm" value={distributionForm.event_type} onChange={(e) => setDistributionForm((f) => ({ ...f, event_type: e.target.value as typeof distributionForm.event_type }))}>
                <option value="sale">sale</option>
                <option value="partial_sale">partial_sale</option>
                <option value="refinance">refinance</option>
                <option value="operating_distribution">operating_distribution</option>
                <option value="other">other</option>
              </select>
              <button data-testid="create-distribution" type="submit" className="rounded-lg border border-bm-border px-3 py-2 text-sm">Save Distribution</button>
            </form>

            <div className="space-y-2">
              {distributionEvents.map((row) => (
                <div key={row.fin_distribution_event_id} className="rounded border border-bm-border/60 p-2 text-xs text-bm-muted2">
                  <div className="flex items-center justify-between gap-2">
                    <span data-testid="distribution-row">{row.event_date} · {row.net_distributable} · {row.asset_name || row.event_type}</span>
                    <div className="flex gap-2">
                      <button
                        data-testid={`select-distribution-${row.fin_distribution_event_id}`}
                        onClick={() => void onSelectDistributionEvent(row.fin_distribution_event_id)}
                        className="rounded border border-bm-border px-2 py-1"
                      >
                        Select
                      </button>
                      <button
                        data-testid={`run-waterfall-${row.fin_distribution_event_id}`}
                        onClick={() => void onRunWaterfall(row.fin_distribution_event_id, `wf_${row.fin_distribution_event_id}_${todayIso()}`)}
                        className="rounded border border-bm-border px-2 py-1"
                      >
                        Run
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                data-testid="run-determinism-check"
                onClick={() => void onRunDeterminismCheck()}
                className="rounded-lg border border-bm-border px-3 py-2 text-xs"
                disabled={!selectedDistributionEventId}
              >
                Re-run Same Idempotency Key
              </button>
            </div>

            <div className="rounded border border-bm-border/60 p-3">
              <p className="text-xs text-bm-muted2">
                Selected event: {selectedDistributionEventId || "none"} · run: {waterfallRunId || "none"} · repeat run: {sameKeyRunId || "none"}
              </p>
              <div className="hidden">
                <span data-testid="run-id">{waterfallRunId}</span>
                <span data-testid="repeat-run-id">{sameKeyRunId}</span>
              </div>
              <table className="mt-2 w-full text-xs" data-testid="ledger-table">
                <thead>
                  <tr className="text-left text-bm-muted2">
                    <th>Participant</th>
                    <th>Type</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((row) => (
                    <tr key={row.fin_distribution_payout_id} data-testid="ledger-row">
                      <td>{row.participant_name || row.fin_participant_id}</td>
                      <td>{row.payout_type}</td>
                      <td>{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-bm-muted2" data-testid="ledger-total">
                Ledger total: {payoutTotal.toFixed(2)} · Distribution: {toMoney(selectedEvent?.net_distributable).toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-bm-muted2" data-testid="allocation-count">
                Allocation rows: {allocations.length}
              </p>
            </div>
          </section>
        </>
      ) : null}

      {(status || error) && (
        <div className="space-y-1">
          {status && <p className="text-sm text-bm-muted">{status}</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}
