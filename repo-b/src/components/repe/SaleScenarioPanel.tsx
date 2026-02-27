"use client";

import { useState } from "react";
import {
  createSaleAssumption,
  computeScenarioMetrics,
  listSaleAssumptions,
  deleteSaleAssumption,
  type SaleAssumption,
  type ScenarioComputeResult,
  type RepeDeal,
} from "@/lib/bos-api";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { StateCard } from "@/components/ui/StateCard";

type Props = {
  fundId: string;
  scenarioId: string;
  deals: RepeDeal[];
  envId: string;
  businessId: string;
  quarter: string;
};

function fmtPct(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `${(n * 100).toFixed(2)}%`;
}

function fmtMoney(v: string | null | undefined): string {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function SaleScenarioPanel({ fundId, scenarioId, deals, envId, businessId, quarter }: Props) {
  const [selectedDealId, setSelectedDealId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [dispositionFeePct, setDispositionFeePct] = useState("0.01");
  const [buyerCosts, setBuyerCosts] = useState("0");
  const [memo, setMemo] = useState("");

  const [assumptions, setAssumptions] = useState<SaleAssumption[]>([]);
  const [result, setResult] = useState<ScenarioComputeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddSale() {
    if (!selectedDealId || !salePrice || !saleDate) return;
    setError(null);
    try {
      await createSaleAssumption(fundId, {
        scenario_id: scenarioId,
        deal_id: selectedDealId,
        sale_price: parseFloat(salePrice),
        sale_date: saleDate,
        buyer_costs: parseFloat(buyerCosts) || 0,
        disposition_fee_pct: parseFloat(dispositionFeePct) || 0,
        memo: memo || undefined,
      });
      const updated = await listSaleAssumptions(fundId, scenarioId);
      setAssumptions(updated);
      setSelectedDealId("");
      setSalePrice("");
      setSaleDate("");
      setMemo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add sale assumption");
    }
  }

  async function handleRemove(id: number) {
    try {
      await deleteSaleAssumption(id);
      setAssumptions((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  async function handleCompute() {
    setLoading(true);
    setError(null);
    try {
      const res = await computeScenarioMetrics(fundId, {
        scenario_id: scenarioId,
        quarter,
        env_id: envId,
        business_id: businessId,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compute scenario");
    } finally {
      setLoading(false);
    }
  }

  const irrDeltaDirection = result?.irr_delta
    ? parseFloat(result.irr_delta) >= 0 ? "up" as const : "down" as const
    : "flat" as const;

  const tvpiDeltaDirection = result?.tvpi_delta
    ? parseFloat(result.tvpi_delta) >= 0 ? "up" as const : "down" as const
    : "flat" as const;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-display font-semibold tracking-tight">Sale Scenario Modeling</h3>
        <p className="text-sm text-bm-muted2 mt-1">
          Model hypothetical asset exits and see the impact on fund IRR, TVPI, and waterfall allocations.
        </p>
      </div>

      {/* Add Sale Form */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">New Sale Assumption</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-bm-muted2">
            Investment
            <select
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={selectedDealId}
              onChange={(e) => setSelectedDealId(e.target.value)}
            >
              <option value="">Select investment</option>
              {deals.map((d) => (
                <option key={d.deal_id} value={d.deal_id}>{d.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-bm-muted2">
            Sale Price ($)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="45000000"
            />
          </label>

          <label className="text-xs text-bm-muted2">
            Sale Date
            <input
              type="date"
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </label>

          <label className="text-xs text-bm-muted2">
            Disposition Fee (%)
            <input
              type="number"
              step="0.001"
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={dispositionFeePct}
              onChange={(e) => setDispositionFeePct(e.target.value)}
              placeholder="0.01"
            />
          </label>

          <label className="text-xs text-bm-muted2">
            Buyer Costs ($)
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={buyerCosts}
              onChange={(e) => setBuyerCosts(e.target.value)}
              placeholder="0"
            />
          </label>

          <label className="text-xs text-bm-muted2">
            Memo
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-2.5 py-1.5 text-sm"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Optional note"
            />
          </label>
        </div>

        <Button onClick={handleAddSale} disabled={!selectedDealId || !salePrice || !saleDate}>
          Add Sale Assumption
        </Button>
      </div>

      {/* Assumptions List */}
      {assumptions.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
            Sale Assumptions ({assumptions.length})
          </p>
          <div className="space-y-2">
            {assumptions.map((a) => {
              const dealName = deals.find((d) => d.deal_id === a.deal_id)?.name || a.deal_id.slice(0, 8);
              return (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-bm-border/50 bg-bm-bg px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{dealName}</span>
                    <span className="text-bm-muted2 ml-2">@ {fmtMoney(a.sale_price)}</span>
                    <span className="text-bm-muted2 ml-2">on {a.sale_date}</span>
                  </div>
                  <button
                    className="text-xs text-bm-danger hover:underline"
                    onClick={() => handleRemove(a.id)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <Button onClick={handleCompute} disabled={loading}>
            {loading ? "Computing..." : "Compute Impact"}
          </Button>
        </div>
      )}

      {/* Error */}
      {error && <StateCard state="error" title="Scenario Error" message={error} />}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
            Scenario Impact — {result.sale_count} sale(s), {fmtMoney(result.total_sale_proceeds)} proceeds
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Base Gross IRR"
              value={fmtPct(result.base_gross_irr)}
              size="compact"
            />
            <MetricCard
              label="Scenario Gross IRR"
              value={fmtPct(result.scenario_gross_irr)}
              size="large"
              delta={result.irr_delta ? { value: fmtPct(result.irr_delta), direction: irrDeltaDirection } : undefined}
              status={irrDeltaDirection === "up" ? "success" : irrDeltaDirection === "down" ? "danger" : "neutral"}
            />
            <MetricCard
              label="Base TVPI"
              value={result.base_gross_tvpi ? `${parseFloat(result.base_gross_tvpi).toFixed(2)}x` : "—"}
              size="compact"
            />
            <MetricCard
              label="Scenario TVPI"
              value={result.scenario_gross_tvpi ? `${parseFloat(result.scenario_gross_tvpi).toFixed(2)}x` : "—"}
              size="large"
              delta={result.tvpi_delta ? { value: `${parseFloat(result.tvpi_delta).toFixed(2)}x`, direction: tvpiDeltaDirection } : undefined}
              status={tvpiDeltaDirection === "up" ? "success" : tvpiDeltaDirection === "down" ? "danger" : "neutral"}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Scenario Net IRR" value={fmtPct(result.scenario_net_irr)} size="compact" />
            <MetricCard label="Scenario Net TVPI" value={result.scenario_net_tvpi ? `${parseFloat(result.scenario_net_tvpi).toFixed(2)}x` : "—"} size="compact" />
            <MetricCard label="Scenario DPI" value={result.scenario_dpi ? `${parseFloat(result.scenario_dpi).toFixed(2)}x` : "—"} size="compact" />
            <MetricCard label="Carry Estimate" value={fmtMoney(result.carry_estimate)} size="compact" />
          </div>
        </div>
      )}
    </div>
  );
}
