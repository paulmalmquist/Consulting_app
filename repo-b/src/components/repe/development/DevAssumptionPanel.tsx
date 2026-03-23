"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { reIndexInputClass } from "@/components/repe/RepeIndexScaffold";
import type { DevAssumptionSet } from "@/lib/bos-api";
import { updateDevAssumptions } from "@/lib/bos-api";

import { fmtDate, fmtMoney, fmtPct } from '@/lib/format-utils';
type FieldGroup = {
  title: string;
  fields: { key: string; label: string; format: "money" | "pct" | "date" | "int"; editable?: boolean }[];
};

const fieldGroups: FieldGroup[] = [
  {
    title: "Cost",
    fields: [
      { key: "hard_cost", label: "Hard Cost", format: "money", editable: true },
      { key: "soft_cost", label: "Soft Cost", format: "money", editable: true },
      { key: "contingency", label: "Contingency", format: "money", editable: true },
      { key: "financing_cost", label: "Financing Cost", format: "money", editable: true },
      { key: "total_development_cost", label: "Total Dev Cost", format: "money", editable: true },
    ],
  },
  {
    title: "Timeline",
    fields: [
      { key: "construction_start", label: "Construction Start", format: "date", editable: true },
      { key: "construction_end", label: "Construction End", format: "date", editable: true },
      { key: "lease_up_start", label: "Lease-Up Start", format: "date", editable: true },
      { key: "lease_up_months", label: "Lease-Up Months", format: "int", editable: true },
      { key: "stabilization_date", label: "Stabilization", format: "date", editable: true },
    ],
  },
  {
    title: "Operating",
    fields: [
      { key: "stabilized_occupancy", label: "Stabilized Occ.", format: "pct", editable: true },
      { key: "stabilized_noi", label: "Stabilized NOI", format: "money", editable: true },
      { key: "exit_cap_rate", label: "Exit Cap Rate", format: "pct", editable: true },
    ],
  },
  {
    title: "Debt",
    fields: [
      { key: "construction_loan_amt", label: "Const. Loan", format: "money", editable: true },
      { key: "construction_loan_rate", label: "Const. Rate", format: "pct", editable: true },
      { key: "perm_loan_amt", label: "Perm Loan", format: "money", editable: true },
      { key: "perm_loan_rate", label: "Perm Rate", format: "pct", editable: true },
    ],
  },
];

const outputFields = [
  { key: "yield_on_cost", label: "Yield on Cost", format: "pct" as const },
  { key: "stabilized_value", label: "Stabilized Value", format: "money" as const },
  { key: "projected_irr", label: "Projected IRR", format: "pct" as const },
  { key: "projected_moic", label: "MOIC", format: "money" as const },
];

function formatValue(val: string | null, format: string): string {
  if (format === "money") return fmtMoney(val);
  if (format === "pct") return fmtPct(val);
  if (format === "date") return fmtDate(val);
  if (format === "int") return val ?? "—";
  return val ?? "—";
}

export function DevAssumptionPanel({
  assumptions,
  linkId,
  onRefresh,
}: {
  assumptions: DevAssumptionSet[];
  linkId: string;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const current = assumptions[activeTab];

  const handleSave = useCallback(
    async (field: string, rawValue: string) => {
      if (!current) return;
      setSaving(true);
      setError(null);
      try {
        await updateDevAssumptions(linkId, current.assumption_set_id, {
          [field]: rawValue,
        } as Partial<DevAssumptionSet>);
        onRefresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
        setEditingField(null);
      }
    },
    [current, linkId, onRefresh],
  );

  if (assumptions.length === 0) {
    return (
      <div className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] px-8 py-16 text-center">
        <p className="text-sm text-bm-muted2">No assumption sets available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Scenario tabs */}
      <div className="flex gap-1 rounded-lg bg-bm-surface/10 p-1">
        {assumptions.map((a, i) => (
          <button
            key={a.assumption_set_id}
            onClick={() => setActiveTab(i)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              i === activeTab
                ? "bg-bm-surface/40 text-bm-text"
                : "text-bm-muted2 hover:text-bm-text",
            )}
          >
            {a.scenario_label === "base"
              ? "Base"
              : a.scenario_label === "cost_overrun"
                ? "Cost Overrun"
                : a.scenario_label === "strong_lease_up"
                  ? "Strong Lease-Up"
                  : a.scenario_label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 px-4 py-2 text-xs text-red-400">{error}</div>
      )}

      {/* Calculated outputs — prominent display */}
      {current && (
        <div className="grid grid-cols-2 gap-3">
          {outputFields.map((f) => {
            const val = (current as unknown as Record<string, unknown>)[f.key] as string | null;
            return (
              <div
                key={f.key}
                className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-3"
              >
                <p className="text-[10px] uppercase tracking-wider text-indigo-300/70">
                  {f.label}
                </p>
                <p className="mt-0.5 text-lg font-semibold tabular-nums text-bm-text">
                  {formatValue(val, f.format)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Field groups */}
      {current &&
        fieldGroups.map((group) => (
          <div
            key={group.title}
            className="rounded-xl border border-bm-border/40 bg-bm-surface/[0.03] p-4"
          >
            <h4 className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-bm-muted2">
              {group.title}
            </h4>
            <div className="space-y-2">
              {group.fields.map((f) => {
                const val = (current as unknown as Record<string, unknown>)[f.key] as string | null;
                const isEditing = editingField === f.key;
                return (
                  <div key={f.key} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-bm-muted2">{f.label}</span>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSave(f.key, editValue);
                            if (e.key === "Escape") setEditingField(null);
                          }}
                          className={cn(reIndexInputClass, "h-7 w-28 text-xs")}
                          autoFocus
                        />
                        <button
                          onClick={() => handleSave(f.key, editValue)}
                          disabled={saving}
                          className="rounded bg-indigo-600 px-2 py-1 text-[10px] text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {saving ? "..." : "Save"}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingField(f.key);
                          setEditValue(val ?? "");
                        }}
                        className="text-sm font-medium tabular-nums text-bm-text hover:text-indigo-400"
                      >
                        {formatValue(val, f.format)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}
