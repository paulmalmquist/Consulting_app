"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { SlideOver } from "@/components/ui/SlideOver";
import {
  Layers,
  TrendingUp,
  Landmark,
  DoorOpen,
  Activity,
} from "lucide-react";
import {
  computeFullValuation,
  type ValuationInputs,
  type ValuationResult,
} from "@/lib/re-valuation-math";
import type { Asset, ReModelOverride, AssetPeriod } from "./types";
import { apiFetch } from "./types";

/* ── Formatters ─────────────────────────────────────────── */

function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

/* ── LeverInput (from ValuationLeverPanel pattern) ─────── */

function LeverInput({
  label,
  value,
  onChange,
  step = 0.005,
  min = 0,
  max = 1,
  format = "pct",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: "pct" | "number" | "money";
}) {
  const displayValue =
    format === "pct"
      ? (value * 100).toFixed(2)
      : format === "money"
        ? value.toFixed(0)
        : value.toFixed(2);
  return (
    <label className="block text-xs">
      <span className="text-bm-muted2 uppercase tracking-[0.08em]">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-bm-accent"
        />
        <input
          type="number"
          value={displayValue}
          onChange={(e) => {
            const raw = Number(e.target.value);
            onChange(format === "pct" ? raw / 100 : raw);
          }}
          step={format === "pct" ? 0.1 : step}
          className="w-20 rounded border border-bm-border bg-bm-surface px-2 py-1 text-right text-sm"
        />
        {format === "pct" ? <span className="text-bm-muted2 text-xs">%</span> : null}
      </div>
    </label>
  );
}

/* ── Surgery Inner Tabs ───────────────────────────────── */

const INNER_TABS = [
  { key: "overview", label: "Overview", icon: Layers },
  { key: "cashflow", label: "Cash Flow", icon: TrendingUp },
  { key: "debt", label: "Debt", icon: Landmark },
  { key: "exit", label: "Exit", icon: DoorOpen },
  { key: "sensitivity", label: "Sensitivity", icon: Activity },
] as const;

type InnerTabKey = (typeof INNER_TABS)[number]["key"];

/* ── Helper: parse surgery overrides ──────────────────── */

interface SurgeryState {
  rent_growth: number;
  expense_growth: number;
  vacancy: number;
  forward_noi: number;
  sale_year: number;
  exit_cap_rate: number;
  disposition_pct: number;
  notes: string;
}

const DEFAULT_SURGERY: SurgeryState = {
  rent_growth: 0.025,
  expense_growth: 0.02,
  vacancy: 0.05,
  forward_noi: 0,
  sale_year: 5,
  exit_cap_rate: 0.06,
  disposition_pct: 0.02,
  notes: "",
};

function parseSurgeryFromOverrides(
  overrides: ReModelOverride[],
  assetId: string,
): SurgeryState {
  const state = { ...DEFAULT_SURGERY };
  for (const o of overrides) {
    if (o.scope_node_id !== assetId || !o.key.startsWith("surgery:")) continue;
    const field = o.key.replace("surgery:cf:", "").replace("surgery:exit:", "");
    switch (field) {
      case "rent_growth":
        state.rent_growth = o.value_decimal ?? DEFAULT_SURGERY.rent_growth;
        break;
      case "expense_growth":
        state.expense_growth = o.value_decimal ?? DEFAULT_SURGERY.expense_growth;
        break;
      case "vacancy":
        state.vacancy = o.value_decimal ?? DEFAULT_SURGERY.vacancy;
        break;
      case "forward_noi":
        state.forward_noi = o.value_decimal ?? 0;
        break;
      case "sale_year":
        state.sale_year = o.value_int ?? DEFAULT_SURGERY.sale_year;
        break;
      case "cap_rate":
        state.exit_cap_rate = o.value_decimal ?? DEFAULT_SURGERY.exit_cap_rate;
        break;
      case "disposition_pct":
        state.disposition_pct = o.value_decimal ?? DEFAULT_SURGERY.disposition_pct;
        break;
      case "notes":
        state.notes = o.value_text ?? "";
        break;
    }
  }
  return state;
}

/* ── Main Component ───────────────────────────────────── */

export function AssetSurgeryDrawer({
  open,
  onClose,
  modelId,
  asset,
  overrides,
  onOverrideChange,
}: {
  open: boolean;
  onClose: () => void;
  modelId: string;
  asset: Asset | null;
  overrides: ReModelOverride[];
  onOverrideChange: (overrides: ReModelOverride[]) => void;
}) {
  const [innerTab, setInnerTab] = useState<InnerTabKey>("overview");
  const [periods, setPeriods] = useState<AssetPeriod[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [surgery, setSurgery] = useState<SurgeryState>(DEFAULT_SURGERY);
  const [saving, setSaving] = useState(false);
  const [valuation, setValuation] = useState<ValuationResult | null>(null);

  // Load historical periods when asset changes
  useEffect(() => {
    if (!asset || !open) return;
    setLoadingPeriods(true);
    fetch(`/api/re/v2/assets/${asset.asset_id}/periods`)
      .then((r) => r.json())
      .then((data) => setPeriods(Array.isArray(data) ? data : []))
      .catch(() => setPeriods([]))
      .finally(() => setLoadingPeriods(false));
  }, [asset?.asset_id, open]);

  // Parse surgery state from overrides when asset changes
  useEffect(() => {
    if (!asset) return;
    setSurgery(parseSurgeryFromOverrides(overrides, asset.asset_id));
  }, [asset?.asset_id, overrides]);

  // Compute valuation whenever surgery changes
  useEffect(() => {
    if (!asset) return;
    try {
      const currentNoi = asset.latest_noi ?? 0;
      const inputs: ValuationInputs = {
        cap_rate: 0.055,
        exit_cap_rate: surgery.exit_cap_rate,
        rent_growth: surgery.rent_growth,
        expense_growth: surgery.expense_growth,
        vacancy: surgery.vacancy,
        hold_years: surgery.sale_year,
        forward_noi_override: surgery.forward_noi || undefined,
      };
      const result = computeFullValuation(inputs, currentNoi, 0, 0);
      setValuation(result);
    } catch {
      setValuation(null);
    }
  }, [surgery, asset]);

  const handleSave = useCallback(async () => {
    if (!asset) return;
    setSaving(true);
    try {
      const entries: { key: string; value_type: string; value_decimal?: number; value_int?: number; value_text?: string }[] = [
        { key: "surgery:cf:rent_growth", value_type: "decimal", value_decimal: surgery.rent_growth },
        { key: "surgery:cf:expense_growth", value_type: "decimal", value_decimal: surgery.expense_growth },
        { key: "surgery:cf:vacancy", value_type: "decimal", value_decimal: surgery.vacancy },
        { key: "surgery:exit:sale_year", value_type: "int", value_int: surgery.sale_year },
        { key: "surgery:exit:cap_rate", value_type: "decimal", value_decimal: surgery.exit_cap_rate },
        { key: "surgery:exit:disposition_pct", value_type: "decimal", value_decimal: surgery.disposition_pct },
      ];
      if (surgery.forward_noi > 0) {
        entries.push({ key: "surgery:cf:forward_noi", value_type: "decimal", value_decimal: surgery.forward_noi });
      }
      if (surgery.notes) {
        entries.push({ key: "surgery:exit:notes", value_type: "string", value_text: surgery.notes });
      }

      const results: ReModelOverride[] = [];
      for (const entry of entries) {
        const result = await apiFetch<ReModelOverride>(`/api/re/v2/models/${modelId}/overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope_node_type: "asset",
            scope_node_id: asset.asset_id,
            ...entry,
          }),
        });
        results.push(result);
      }

      // Replace surgery overrides for this asset in the overrides array
      const nonSurgery = overrides.filter(
        (o) => !(o.scope_node_id === asset.asset_id && o.key.startsWith("surgery:")),
      );
      onOverrideChange([...nonSurgery, ...results]);
    } catch (err) {
      console.error("Failed to save surgery:", err);
    } finally {
      setSaving(false);
    }
  }, [asset, surgery, modelId, overrides, onOverrideChange]);

  if (!asset) return null;

  const subtitle = [asset.sector, asset.city && asset.state ? `${asset.city}, ${asset.state}` : null]
    .filter(Boolean)
    .join(" \u00B7 ");

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={`Asset Surgery \u2014 ${asset.name}`}
      subtitle={subtitle}
      width="max-w-4xl"
      footer={
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-bm-accent px-4 py-2 text-sm font-medium text-white hover:bg-bm-accent/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Assumptions"}
        </button>
      }
    >
      <div className="flex gap-6">
        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Inner tab bar */}
          <div className="flex gap-1 mb-4 border-b border-bm-border/50 pb-2">
            {INNER_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setInnerTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition ${
                    innerTab === tab.key
                      ? "bg-bm-surface/50 text-bm-text font-medium"
                      : "text-bm-muted hover:text-bm-text hover:bg-bm-surface/30"
                  }`}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Inner tab content */}
          {innerTab === "overview" && (
            <OverviewInner asset={asset} periods={periods} surgery={surgery} />
          )}
          {innerTab === "cashflow" && (
            <CashFlowInner
              asset={asset}
              periods={periods}
              loadingPeriods={loadingPeriods}
              surgery={surgery}
              onSurgeryChange={setSurgery}
            />
          )}
          {innerTab === "debt" && (
            <DebtInner periods={periods} />
          )}
          {innerTab === "exit" && (
            <ExitInner
              surgery={surgery}
              onSurgeryChange={setSurgery}
              valuation={valuation}
            />
          )}
          {innerTab === "sensitivity" && (
            <SensitivityInner asset={asset} surgery={surgery} />
          )}
        </div>

        {/* Live Impact Sidebar */}
        <div className="w-56 shrink-0 space-y-3 sticky top-0">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Live Impact</h3>
          <ImpactCard label="Implied Value" value={fmtMoney(valuation?.value_blended)} />
          <ImpactCard label="Equity Value" value={fmtMoney(valuation?.equity_value)} />
          <ImpactCard label="Forward NOI" value={fmtMoney(valuation?.forward_noi)} />
          <ImpactCard label="LTV" value={fmtPct(valuation?.ltv)} />
          <ImpactCard label="DSCR" value={valuation?.dscr != null ? `${valuation.dscr.toFixed(2)}x` : "—"} />
        </div>
      </div>
    </SlideOver>
  );
}

/* ── Impact Card ──────────────────────────────────────── */

function ImpactCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bm-border/60 bg-bm-surface/20 p-3">
      <p className="text-xs uppercase tracking-[0.1em] text-bm-muted2">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

/* ── Overview Inner Tab ───────────────────────────────── */

function OverviewInner({
  asset,
  periods,
  surgery,
}: {
  asset: Asset;
  periods: AssetPeriod[];
  surgery: SurgeryState;
}) {
  const latestPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
  const overrideCount = Object.entries(surgery).filter(
    ([k, v]) => v !== DEFAULT_SURGERY[k as keyof SurgeryState],
  ).length;

  return (
    <div className="space-y-4">
      {/* Asset metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <MetaCard label="Fund" value={asset.fund_name || "—"} />
        <MetaCard label="Investment" value={asset.investment_name || "—"} />
        <MetaCard label="Sector" value={asset.sector || "—"} />
        <MetaCard label="Units / SF" value={asset.units ? `${asset.units} units` : asset.square_feet ? `${asset.square_feet.toLocaleString()} SF` : "—"} />
        <MetaCard label="Status" value={asset.status || "—"} />
        <MetaCard label="Overrides Modified" value={`${overrideCount}`} />
      </div>

      {/* Latest quarter KPIs */}
      {latestPeriod && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Latest Quarter: {latestPeriod.quarter}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetaCard label="NOI" value={fmtMoney(latestPeriod.noi)} />
            <MetaCard label="Revenue" value={fmtMoney(latestPeriod.revenue)} />
            <MetaCard label="Occupancy" value={fmtPct(latestPeriod.occupancy)} />
            <MetaCard label="Cap Rate" value={fmtPct(latestPeriod.cap_rate)} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-3">
      <p className="text-xs text-bm-muted2 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold mt-1">{value}</p>
    </div>
  );
}

/* ── Cash Flow Inner Tab ──────────────────────────────── */

function CashFlowInner({
  asset,
  periods,
  loadingPeriods,
  surgery,
  onSurgeryChange,
}: {
  asset: Asset;
  periods: AssetPeriod[];
  loadingPeriods: boolean;
  surgery: SurgeryState;
  onSurgeryChange: (s: SurgeryState) => void;
}) {
  // Compute projected cash flows from surgery assumptions
  const projected = useMemo(() => {
    const baseNoi = asset.latest_noi ?? 0;
    if (baseNoi === 0) return [];
    const years: { year: number; revenue: number; opex: number; noi: number }[] = [];
    let noi = surgery.forward_noi > 0 ? surgery.forward_noi : baseNoi * 4; // annualize
    for (let y = 1; y <= surgery.sale_year; y++) {
      noi *= 1 + surgery.rent_growth - surgery.expense_growth;
      years.push({
        year: new Date().getFullYear() + y,
        revenue: noi / (1 - surgery.vacancy),
        opex: (noi / (1 - surgery.vacancy)) * surgery.vacancy + noi * (surgery.expense_growth / (1 + surgery.expense_growth)),
        noi,
      });
    }
    return years;
  }, [asset, surgery]);

  return (
    <div className="space-y-4">
      {/* Historical */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Historical Cash Flow</h3>
        {loadingPeriods ? (
          <p className="text-sm text-bm-muted2">Loading...</p>
        ) : periods.length === 0 ? (
          <p className="text-sm text-bm-muted2">No historical data available for this asset.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-3 py-2 text-left font-medium">Quarter</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">OpEx</th>
                  <th className="px-3 py-2 text-right font-medium">NOI</th>
                  <th className="px-3 py-2 text-right font-medium">Occupancy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {periods.slice(-8).map((p) => (
                  <tr key={p.quarter} className="hover:bg-bm-surface/20">
                    <td className="px-3 py-2 font-medium">{p.quarter}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.revenue)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.opex)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.noi)}</td>
                    <td className="px-3 py-2 text-right">{fmtPct(p.occupancy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Projected */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Projected Cash Flow</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <LeverInput
            label="Rent Growth"
            value={surgery.rent_growth}
            onChange={(v) => onSurgeryChange({ ...surgery, rent_growth: v })}
            min={-0.05}
            max={0.10}
            step={0.005}
          />
          <LeverInput
            label="Expense Growth"
            value={surgery.expense_growth}
            onChange={(v) => onSurgeryChange({ ...surgery, expense_growth: v })}
            min={-0.02}
            max={0.10}
            step={0.005}
          />
          <LeverInput
            label="Vacancy"
            value={surgery.vacancy}
            onChange={(v) => onSurgeryChange({ ...surgery, vacancy: v })}
            min={0}
            max={0.30}
            step={0.01}
          />
          <LeverInput
            label="Forward NOI Override"
            value={surgery.forward_noi}
            onChange={(v) => onSurgeryChange({ ...surgery, forward_noi: v })}
            min={0}
            max={50000000}
            step={100000}
            format="money"
          />
        </div>

        {projected.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-3 py-2 text-left font-medium">Year</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">OpEx</th>
                  <th className="px-3 py-2 text-right font-medium">NOI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {projected.map((p) => (
                  <tr key={p.year} className="hover:bg-bm-surface/20">
                    <td className="px-3 py-2 font-medium">{p.year}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.revenue)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.opex)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.noi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Debt Inner Tab ───────────────────────────────────── */

function DebtInner({ periods }: { periods: AssetPeriod[] }) {
  const latest = periods.length > 0 ? periods[periods.length - 1] : null;

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Debt Summary</h3>
      {!latest || (latest.debt_balance == null && latest.debt_service == null) ? (
        <p className="text-sm text-bm-muted2">No debt data available for this asset.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <MetaCard label="Debt Balance" value={fmtMoney(latest.debt_balance)} />
          <MetaCard label="Debt Service (Qtr)" value={fmtMoney(latest.debt_service)} />
          <MetaCard
            label="DSCR"
            value={
              latest.noi != null && latest.debt_service != null && latest.debt_service > 0
                ? `${(latest.noi / latest.debt_service).toFixed(2)}x`
                : "—"
            }
          />
          <MetaCard
            label="LTV"
            value={
              latest.debt_balance != null && latest.asset_value != null && latest.asset_value > 0
                ? fmtPct(latest.debt_balance / latest.asset_value)
                : "—"
            }
          />
        </div>
      )}

      {/* Debt history table */}
      {periods.filter((p) => p.debt_balance != null).length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                <th className="px-3 py-2 text-left font-medium">Quarter</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Service</th>
                <th className="px-3 py-2 text-right font-medium">DSCR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bm-border/40">
              {periods
                .filter((p) => p.debt_balance != null)
                .slice(-8)
                .map((p) => (
                  <tr key={p.quarter} className="hover:bg-bm-surface/20">
                    <td className="px-3 py-2">{p.quarter}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.debt_balance)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.debt_service)}</td>
                    <td className="px-3 py-2 text-right">
                      {p.noi != null && p.debt_service != null && p.debt_service > 0
                        ? `${(p.noi / p.debt_service).toFixed(2)}x`
                        : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Exit Inner Tab ───────────────────────────────────── */

function ExitInner({
  surgery,
  onSurgeryChange,
  valuation,
}: {
  surgery: SurgeryState;
  onSurgeryChange: (s: SurgeryState) => void;
  valuation: ValuationResult | null;
}) {
  const impliedSalePrice = valuation ? valuation.value_blended : null;
  const netProceeds = impliedSalePrice != null ? impliedSalePrice * (1 - surgery.disposition_pct) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-4">Exit Controls</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LeverInput
            label="Sale Year (Hold Period)"
            value={surgery.sale_year}
            onChange={(v) => onSurgeryChange({ ...surgery, sale_year: Math.round(v) })}
            min={1}
            max={15}
            step={1}
            format="number"
          />
          <LeverInput
            label="Exit Cap Rate"
            value={surgery.exit_cap_rate}
            onChange={(v) => onSurgeryChange({ ...surgery, exit_cap_rate: v })}
            min={0.01}
            max={0.15}
            step={0.001}
          />
          <LeverInput
            label="Disposition Cost %"
            value={surgery.disposition_pct}
            onChange={(v) => onSurgeryChange({ ...surgery, disposition_pct: v })}
            min={0}
            max={0.10}
            step={0.005}
          />
        </div>

        <div className="mt-4">
          <label className="block text-xs">
            <span className="text-bm-muted2 uppercase tracking-[0.08em]">Notes</span>
            <textarea
              value={surgery.notes}
              onChange={(e) => onSurgeryChange({ ...surgery, notes: e.target.value })}
              className="mt-1 w-full rounded-lg border border-bm-border bg-bm-surface px-3 py-2 text-sm resize-none"
              rows={2}
              placeholder="Reason for exit assumptions..."
            />
          </label>
        </div>
      </div>

      {/* Computed exit metrics */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">Exit Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetaCard label="Implied Sale Price" value={fmtMoney(impliedSalePrice)} />
          <MetaCard label="Net Proceeds" value={fmtMoney(netProceeds)} />
          <MetaCard label="Forward NOI" value={fmtMoney(valuation?.forward_noi)} />
        </div>
      </div>
    </div>
  );
}

/* ── Sensitivity Inner Tab ────────────────────────────── */

function SensitivityInner({
  asset,
  surgery,
}: {
  asset: Asset;
  surgery: SurgeryState;
}) {
  const matrix = useMemo(() => {
    const currentNoi = asset.latest_noi ?? 0;
    if (currentNoi === 0) return null;

    const capRates = [0.04, 0.045, 0.05, 0.055, 0.06, 0.065, 0.07];
    const exitCaps = [0.045, 0.05, 0.055, 0.06, 0.065, 0.07, 0.075];

    const rows: { capRate: number; cells: { exitCap: number; value: number }[] }[] = [];
    for (const cr of capRates) {
      const cells: { exitCap: number; value: number }[] = [];
      for (const ec of exitCaps) {
        try {
          const result = computeFullValuation(
            {
              cap_rate: cr,
              exit_cap_rate: ec,
              rent_growth: surgery.rent_growth,
              expense_growth: surgery.expense_growth,
              vacancy: surgery.vacancy,
              hold_years: surgery.sale_year,
              forward_noi_override: surgery.forward_noi || undefined,
            },
            currentNoi,
            0,
            0,
          );
          cells.push({ exitCap: ec, value: result.value_blended });
        } catch {
          cells.push({ exitCap: ec, value: 0 });
        }
      }
      rows.push({ capRate: cr, cells });
    }
    return { exitCaps, rows };
  }, [asset, surgery]);

  if (!matrix) {
    return (
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4 text-center">
        <p className="text-sm text-bm-muted2">No NOI data available for sensitivity analysis.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
      <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
        Cap Rate vs Exit Cap &mdash; Implied Value
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
              <th className="px-2 py-2 text-left font-medium">Cap \\ Exit</th>
              {matrix.exitCaps.map((ec) => (
                <th key={ec} className="px-2 py-2 text-right font-medium">{fmtPct(ec)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-bm-border/40">
            {matrix.rows.map((row) => (
              <tr key={row.capRate} className="hover:bg-bm-surface/20">
                <td className="px-2 py-2 font-medium">{fmtPct(row.capRate)}</td>
                {row.cells.map((cell) => {
                  const isActive =
                    Math.abs(row.capRate - 0.055) < 0.001 &&
                    Math.abs(cell.exitCap - surgery.exit_cap_rate) < 0.001;
                  return (
                    <td
                      key={cell.exitCap}
                      className={`px-2 py-2 text-right ${isActive ? "bg-bm-accent/10 font-bold" : ""}`}
                    >
                      {fmtMoney(cell.value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
