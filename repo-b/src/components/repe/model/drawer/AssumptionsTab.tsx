"use client";

import { ChevronDown, ChevronRight, Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";
import type { ScenarioOverride } from "@/lib/bos-api";

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

export const SECTIONS = [
  { key: "operating", label: "Operating", fields: OPERATING_FIELDS },
  { key: "expense", label: "Expenses", fields: EXPENSE_FIELDS },
  { key: "capital", label: "Capital Plan", fields: CAPITAL_FIELDS },
  { key: "debt", label: "Debt", fields: DEBT_FIELDS },
  { key: "exit", label: "Exit", fields: EXIT_FIELDS },
  { key: "overrides", label: "Overrides", fields: OVERRIDE_FIELDS },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

interface AssumptionsTabProps {
  assetOverrides: Map<string, ScenarioOverride>;
  drafts: Record<string, string>;
  overrideCount: number;
  readOnly?: boolean;
  error: string | null;
  showModifiedOnly: boolean;
  onShowModifiedOnlyChange: (v: boolean) => void;
  onSetDraft: (key: string, value: string) => void;
  onClearFieldOverride: (key: string) => void;
  onResetSection: (fields: readonly OverrideField[]) => void;
}

export function AssumptionsTab({
  assetOverrides,
  drafts,
  overrideCount,
  readOnly,
  error,
  showModifiedOnly,
  onShowModifiedOnlyChange,
  onSetDraft,
  onClearFieldOverride,
  onResetSection,
}: AssumptionsTabProps) {
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(new Set());

  const getValue = (key: string): string => {
    if (drafts[key] !== undefined) return drafts[key];
    const ov = assetOverrides.get(key);
    if (!ov) return "";
    const val = ov.value_json;
    return typeof val === "number" ? String(val) : typeof val === "string" ? val : "";
  };

  const getBaseValue = (field: OverrideField): string => {
    return field.placeholder || "\u2014";
  };

  const isFieldModified = (key: string): boolean => {
    return assetOverrides.has(key) || drafts[key] !== undefined;
  };

  const toggleCollapse = (key: SectionKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
            Assumptions
          </span>
          {overrideCount > 0 && (
            <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-blue-400">
              {overrideCount} modified
            </span>
          )}
        </div>
        <button
          onClick={() => onShowModifiedOnlyChange(!showModifiedOnly)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-bm-muted2 transition-colors hover:bg-bm-surface/30 hover:text-bm-text"
        >
          {showModifiedOnly ? <EyeOff size={11} /> : <Eye size={11} />}
          {showModifiedOnly ? "Show All" : "Modified Only"}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Collapsible Sections */}
      <div className="space-y-1">
        {SECTIONS.map((section) => {
          const sectionModified = section.fields.filter((f) => isFieldModified(f.key)).length;
          const isCollapsed = collapsed.has(section.key);
          const visibleFields = showModifiedOnly
            ? section.fields.filter((f) => isFieldModified(f.key))
            : section.fields;

          if (showModifiedOnly && visibleFields.length === 0) return null;

          return (
            <div key={section.key} className="rounded-lg border border-bm-border/30">
              {/* Section Header */}
              <button
                onClick={() => toggleCollapse(section.key)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bm-surface/15"
              >
                {isCollapsed ? <ChevronRight size={12} className="text-bm-muted" /> : <ChevronDown size={12} className="text-bm-muted" />}
                <span className="flex-1 text-[11px] font-medium uppercase tracking-[0.1em] text-bm-muted2">
                  {section.label}
                </span>
                {sectionModified > 0 && (
                  <span className="rounded-full bg-blue-500/15 px-1.5 text-[9px] tabular-nums text-blue-400">
                    {sectionModified}
                  </span>
                )}
                {sectionModified > 0 && !readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onResetSection(section.fields); }}
                    className="rounded px-1 py-0.5 text-[9px] text-bm-muted2 transition-colors hover:bg-bm-surface/30 hover:text-bm-text"
                    title="Reset section to base"
                  >
                    Reset
                  </button>
                )}
              </button>

              {/* Section Fields */}
              {!isCollapsed && (
                <div className="border-t border-bm-border/20 px-3 pb-3 pt-2">
                  <div className="space-y-2">
                    {visibleFields.map((field) => {
                      const hasOverride = assetOverrides.has(field.key);
                      const currentValue = getValue(field.key);
                      const isDraft = drafts[field.key] !== undefined;
                      const modified = hasOverride || isDraft;
                      const baseVal = getBaseValue(field);
                      const scenarioVal = currentValue || baseVal;

                      return (
                        <div key={field.key} className="group">
                          {/* Field label row */}
                          <div className="mb-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-bm-muted2">
                              {field.label}
                            </span>
                            <span className="text-[9px] text-bm-muted">
                              {field.unit}
                            </span>
                            {modified && (
                              <span className="rounded bg-blue-500/15 px-1 text-[8px] font-medium text-blue-400">
                                MODIFIED
                              </span>
                            )}
                          </div>

                          {/* Input + base/delta row */}
                          <div className="flex items-center gap-2">
                            <input
                              type={field.unit === "date" ? "date" : "number"}
                              step={field.step}
                              className={`w-full rounded border px-2 py-1 text-xs tabular-nums outline-none transition-colors disabled:opacity-40 ${
                                modified
                                  ? "border-blue-500/40 bg-blue-500/5 text-bm-text focus:border-blue-500/60"
                                  : "border-bm-border/50 bg-bm-surface/10 text-bm-muted2 focus:border-bm-border-strong/70 focus:text-bm-text"
                              }`}
                              placeholder={baseVal}
                              value={currentValue}
                              onChange={(e) => onSetDraft(field.key, e.target.value)}
                              disabled={readOnly}
                            />

                            {/* Per-field reset */}
                            {modified && !readOnly && (
                              <button
                                onClick={() => onClearFieldOverride(field.key)}
                                className="shrink-0 rounded p-0.5 text-bm-muted2 opacity-0 transition-opacity hover:text-bm-text group-hover:opacity-100"
                                title="Reset to base"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>

                          {/* Base / Scenario / Delta strip */}
                          {modified && field.unit !== "date" && (
                            <div className="mt-0.5 flex gap-3 text-[9px] tabular-nums">
                              <span className="text-bm-muted">
                                Base: <span className="text-bm-muted2">{baseVal}{field.unit === "%" ? "%" : field.unit === "bps" ? " bps" : ""}</span>
                              </span>
                              <span className="text-bm-muted">
                                Scenario: <span className="text-blue-400">{scenarioVal}{field.unit === "%" ? "%" : field.unit === "bps" ? " bps" : ""}</span>
                              </span>
                              {currentValue && baseVal !== "\u2014" && !isNaN(parseFloat(currentValue)) && !isNaN(parseFloat(baseVal)) && (
                                <span className={`font-medium ${
                                  parseFloat(currentValue) - parseFloat(baseVal) > 0 ? "text-emerald-400" :
                                  parseFloat(currentValue) - parseFloat(baseVal) < 0 ? "text-red-400" : "text-bm-muted"
                                }`}>
                                  {(parseFloat(currentValue) - parseFloat(baseVal)) >= 0 ? "+" : ""}
                                  {(parseFloat(currentValue) - parseFloat(baseVal)).toFixed(2)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
