"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";
import { SlideOver } from "@/components/ui/SlideOver";
import { Button } from "@/components/ui/Button";
import {
  setScenarioOverride,
  deleteScenarioOverride,
} from "@/lib/bos-api";
import type { ScenarioAsset, ScenarioOverride } from "@/lib/bos-api";
import { useAssetPreview } from "./useAssetPreview";
import { AssetPreviewPanel } from "./AssetPreviewPanel";

/* ── Override key catalog ── */

type OverrideField = {
  key: string;
  label: string;
  unit: string;
  step: number;
  placeholder?: string;
};

const OPERATING_FIELDS: OverrideField[] = [
  { key: "rent_growth_pct", label: "Rent Growth", unit: "%", step: 0.5, placeholder: "3.0" },
  { key: "occupancy_pct", label: "Occupancy", unit: "%", step: 1, placeholder: "93" },
  { key: "vacancy_pct", label: "Vacancy", unit: "%", step: 0.5, placeholder: "5" },
  { key: "lease_up_months", label: "Lease-Up Pace", unit: "mo", step: 1, placeholder: "12" },
  { key: "market_rent_growth_pct", label: "Market Rent Growth", unit: "%", step: 0.5, placeholder: "2.5" },
  { key: "concessions_pct", label: "Concessions", unit: "%", step: 0.5, placeholder: "0" },
  { key: "bad_debt_pct", label: "Bad Debt / Credit Loss", unit: "%", step: 0.25, placeholder: "1.5" },
  { key: "other_income_growth_pct", label: "Other Income Growth", unit: "%", step: 0.5, placeholder: "2.0" },
  { key: "revenue_delta_pct", label: "Revenue Override (delta)", unit: "%", step: 1, placeholder: "0" },
];

const EXPENSE_FIELDS: OverrideField[] = [
  { key: "payroll_growth_pct", label: "Payroll Growth", unit: "%", step: 0.5, placeholder: "3.0" },
  { key: "rm_growth_pct", label: "R&M Growth", unit: "%", step: 0.5, placeholder: "2.5" },
  { key: "utilities_growth_pct", label: "Utilities Growth", unit: "%", step: 0.5, placeholder: "3.0" },
  { key: "insurance_growth_pct", label: "Insurance Growth", unit: "%", step: 1, placeholder: "5.0" },
  { key: "tax_growth_pct", label: "Taxes Growth", unit: "%", step: 0.5, placeholder: "2.0" },
  { key: "mgmt_fee_pct", label: "Management Fee", unit: "%", step: 0.25, placeholder: "3.0" },
  { key: "expense_delta_pct", label: "Expense Override (delta)", unit: "%", step: 1, placeholder: "0" },
];

const CAPITAL_FIELDS: OverrideField[] = [
  { key: "recurring_capex", label: "Recurring Capex", unit: "$", step: 10000, placeholder: "0" },
  { key: "onetime_capex", label: "One-Time Capex", unit: "$", step: 50000, placeholder: "0" },
  { key: "capex_override", label: "Capex Override (total)", unit: "$", step: 10000, placeholder: "0" },
  { key: "replacement_reserves", label: "Replacement Reserves", unit: "$/unit", step: 50, placeholder: "250" },
  { key: "ti_budget", label: "TI Budget", unit: "$/sf", step: 1, placeholder: "0" },
  { key: "lc_budget", label: "Leasing Commissions", unit: "$/sf", step: 0.5, placeholder: "0" },
];

const DEBT_FIELDS: OverrideField[] = [
  { key: "loan_balance", label: "Loan Balance", unit: "$", step: 100000 },
  { key: "interest_rate_pct", label: "Interest Rate", unit: "%", step: 0.125, placeholder: "5.25" },
  { key: "spread_bps", label: "Spread", unit: "bps", step: 25, placeholder: "225" },
  { key: "sofr_pct", label: "SOFR / Reference Rate", unit: "%", step: 0.125, placeholder: "4.33" },
  { key: "io_period_months", label: "IO Period", unit: "mo", step: 6, placeholder: "24" },
  { key: "amort_years", label: "Amortization", unit: "yrs", step: 1, placeholder: "30" },
  { key: "maturity_date", label: "Maturity Date", unit: "date", step: 1 },
  { key: "refi_date", label: "Refi Date", unit: "date", step: 1 },
  { key: "refi_proceeds", label: "Refi Proceeds", unit: "$", step: 100000 },
  { key: "amort_delta_pct", label: "Amort Override (delta)", unit: "%", step: 1, placeholder: "0" },
];

const EXIT_FIELDS: OverrideField[] = [
  { key: "sale_date", label: "Sale Date", unit: "date", step: 1 },
  { key: "exit_cap_rate_pct", label: "Exit Cap Rate", unit: "%", step: 0.25, placeholder: "5.50" },
  { key: "exit_noi_basis", label: "Exit NOI Basis", unit: "$", step: 10000 },
  { key: "disposition_cost_pct", label: "Disposition Costs", unit: "%", step: 0.25, placeholder: "2.0" },
  { key: "broker_fee_pct", label: "Broker Fee", unit: "%", step: 0.25, placeholder: "1.0" },
  { key: "net_proceeds_haircut_pct", label: "Net Proceeds Haircut", unit: "%", step: 0.5, placeholder: "0" },
];

const OVERRIDE_FIELDS: OverrideField[] = [
  { key: "noi_override", label: "NOI Override (hard)", unit: "$", step: 10000 },
  { key: "revenue_override_q", label: "Revenue Override (quarterly)", unit: "$", step: 10000 },
  { key: "capex_override_q", label: "Capex Override (quarterly)", unit: "$", step: 10000 },
];

const TABS = [
  { key: "operating", label: "Operating", fields: OPERATING_FIELDS },
  { key: "expense", label: "Expenses", fields: EXPENSE_FIELDS },
  { key: "capital", label: "Capital", fields: CAPITAL_FIELDS },
  { key: "debt", label: "Debt", fields: DEBT_FIELDS },
  { key: "exit", label: "Exit", fields: EXIT_FIELDS },
  { key: "overrides", label: "Overrides", fields: OVERRIDE_FIELDS },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* ── Component ── */

interface AssetModelingDrawerProps {
  open: boolean;
  onClose: () => void;
  scenarioId: string;
  asset: ScenarioAsset | null;
  overrides: ScenarioOverride[];
  onOverridesChange: (overrides: ScenarioOverride[]) => void;
  readOnly?: boolean;
}

export function AssetModelingDrawer({
  open,
  onClose,
  scenarioId,
  asset,
  overrides,
  onOverridesChange,
  readOnly,
}: AssetModelingDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("operating");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset drafts when asset changes
  useEffect(() => {
    setDrafts({});
    setActiveTab("operating");
    setError(null);
  }, [asset?.asset_id]);

  const assetOverrides = useMemo(() => {
    if (!asset) return new Map<string, ScenarioOverride>();
    const map = new Map<string, ScenarioOverride>();
    for (const ov of overrides) {
      if (ov.scope_type === "asset" && ov.scope_id === asset.asset_id) {
        map.set(ov.key, ov);
      }
    }
    return map;
  }, [asset, overrides]);

  // Live preview hook
  const { preview, loading: previewLoading, error: previewError } = useAssetPreview(
    open ? scenarioId : null,
    asset?.asset_id ?? null,
    drafts,
    assetOverrides.size,
  );

  const getValue = (key: string): string => {
    if (drafts[key] !== undefined) return drafts[key];
    const ov = assetOverrides.get(key);
    if (!ov) return "";
    const val = ov.value_json;
    return typeof val === "number" ? String(val) : typeof val === "string" ? val : "";
  };

  const setDraft = (key: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const hasDrafts = Object.keys(drafts).length > 0;

  const handleSave = useCallback(async () => {
    if (!asset || !hasDrafts) return;
    setSaving(true);
    setError(null);
    try {
      const newOverrides = [...overrides];
      for (const [key, rawValue] of Object.entries(drafts)) {
        const numValue = rawValue === "" ? null : parseFloat(rawValue);
        if (numValue === null || isNaN(numValue)) {
          // Remove override
          const existing = assetOverrides.get(key);
          if (existing) {
            await deleteScenarioOverride(existing.id);
            const idx = newOverrides.findIndex((o) => o.id === existing.id);
            if (idx >= 0) newOverrides.splice(idx, 1);
          }
        } else {
          const saved = await setScenarioOverride(scenarioId, {
            scope_type: "asset",
            scope_id: asset.asset_id,
            key,
            value_json: numValue,
          });
          const idx = newOverrides.findIndex(
            (o) => o.scope_type === "asset" && o.scope_id === asset.asset_id && o.key === key,
          );
          if (idx >= 0) newOverrides[idx] = saved;
          else newOverrides.push(saved);
        }
      }
      onOverridesChange(newOverrides);
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [asset, drafts, overrides, assetOverrides, scenarioId, onOverridesChange, hasDrafts]);

  const handleReset = useCallback(async () => {
    if (!asset) return;
    setSaving(true);
    setError(null);
    try {
      const assetOvs = overrides.filter(
        (o) => o.scope_type === "asset" && o.scope_id === asset.asset_id,
      );
      for (const ov of assetOvs) {
        await deleteScenarioOverride(ov.id);
      }
      onOverridesChange(
        overrides.filter((o) => !(o.scope_type === "asset" && o.scope_id === asset.asset_id)),
      );
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setSaving(false);
    }
  }, [asset, overrides, onOverridesChange]);

  const activeFields = TABS.find((t) => t.key === activeTab)?.fields ?? [];
  const overrideCount = assetOverrides.size;

  if (!asset) return null;

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={asset.asset_name || asset.asset_id.slice(0, 8)}
      subtitle={[asset.asset_type, asset.fund_name].filter(Boolean).join(" · ")}
      width="max-w-6xl"
      footer={
        !readOnly ? (
          <>
            {overrideCount > 0 && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={saving}>
                <RotateCcw size={13} className="mr-1" />
                Reset All ({overrideCount})
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasDrafts}
            >
              <Save size={13} className="mr-1" />
              {saving ? "Saving..." : "Save Assumptions"}
            </Button>
          </>
        ) : undefined
      }
    >
      {/* Two-column layout: Assumptions (left) + Live Preview (right) */}
      <div className="flex gap-5">
        {/* Left: Assumptions Form */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-bm-border/50 bg-bm-surface/10 p-0.5">
            {TABS.map((tab) => {
              const tabOverrides = [...assetOverrides.entries()].filter(
                ([k]) => tab.fields.some((f) => f.key === k),
              ).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`relative whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeTab === tab.key
                      ? "bg-bm-surface/50 text-bm-text"
                      : "text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text"
                  }`}
                >
                  {tab.label}
                  {tabOverrides > 0 && (
                    <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-[9px] text-amber-300">
                      {tabOverrides}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* Fields grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {activeFields.map((field) => {
              const hasOverride = assetOverrides.has(field.key);
              const currentValue = getValue(field.key);
              const isDraft = drafts[field.key] !== undefined;

              return (
                <label key={field.key} className="space-y-1">
                  <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-bm-muted2">
                    {field.label}
                    <span className="text-[10px] font-normal normal-case tracking-normal text-bm-muted">
                      ({field.unit})
                    </span>
                    {hasOverride && !isDraft && (
                      <span className="rounded-full bg-amber-500/20 px-1 text-[9px] text-amber-300">
                        set
                      </span>
                    )}
                    {isDraft && (
                      <span className="rounded-full bg-bm-accent/20 px-1 text-[9px] text-bm-accent">
                        edited
                      </span>
                    )}
                  </span>
                  <input
                    type={field.unit === "date" ? "date" : "number"}
                    step={field.step}
                    className={`w-full rounded-md border px-3 py-1.5 text-sm tabular-nums outline-none transition-colors disabled:opacity-40 ${
                      hasOverride || isDraft
                        ? "border-amber-500/40 bg-amber-500/5 focus:border-amber-500/60"
                        : "border-bm-border/70 bg-bm-surface/18 focus:border-bm-border-strong/70"
                    }`}
                    placeholder={field.placeholder || "—"}
                    value={currentValue}
                    onChange={(e) => setDraft(field.key, e.target.value)}
                    disabled={readOnly}
                  />
                </label>
              );
            })}
          </div>

          {activeFields.length === 0 && (
            <p className="py-8 text-center text-sm text-bm-muted2">
              No fields available for this tab.
            </p>
          )}
        </div>

        {/* Right: Live Preview Panel */}
        <div className="w-80 flex-shrink-0 border-l border-bm-border/30 pl-5">
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            Live Projections
          </h3>
          <AssetPreviewPanel
            preview={preview}
            loading={previewLoading}
            error={previewError}
          />
        </div>
      </div>
    </SlideOver>
  );
}
