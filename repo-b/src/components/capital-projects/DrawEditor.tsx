"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { CpDrawLineItem } from "@/types/capital-projects";

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

interface DrawEditorProps {
  lineItems: CpDrawLineItem[];
  editable: boolean;
  onSave?: (items: Array<{ line_item_id: string; current_draw: string; materials_stored: string }>) => Promise<void>;
}

export function DrawEditor({ lineItems, editable, onSave }: DrawEditorProps) {
  const [edited, setEdited] = useState<Record<string, { current_draw: string; materials_stored: string }>>({});
  const [saving, setSaving] = useState(false);

  const handleChange = (lineId: string, field: "current_draw" | "materials_stored", value: string) => {
    setEdited(prev => ({
      ...prev,
      [lineId]: {
        current_draw: prev[lineId]?.current_draw ?? "0",
        materials_stored: prev[lineId]?.materials_stored ?? "0",
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const items = Object.entries(edited).map(([line_item_id, vals]) => ({
        line_item_id,
        current_draw: vals.current_draw,
        materials_stored: vals.materials_stored,
      }));
      await onSave(items);
      setEdited({});
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(edited).length > 0;

  return (
    <div className="space-y-3">
      {editable && hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-bm-border/40">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-bm-border/40 bg-bm-surface/40">
              {["Code", "Description", "Scheduled", "Previous", "This Period", "Materials", "Total", "% Comp", "Retainage", "Balance", ""].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineItems.map(line => {
              const edits = edited[line.line_item_id];
              return (
                <tr key={line.line_item_id} className={cn("border-b border-bm-border/20", line.variance_flag && "bg-amber-500/5")}>
                  <td className="px-3 py-2 font-mono text-xs text-bm-accent">{line.cost_code}</td>
                  <td className="px-3 py-2 text-bm-text max-w-[160px] truncate">{line.description}</td>
                  <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.scheduled_value)}</td>
                  <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.previous_draws)}</td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        className="w-24 rounded-md border border-bm-border/70 bg-bm-surface/85 px-2 py-1 text-right text-sm text-bm-text focus:border-bm-accent focus:outline-none"
                        value={edits?.current_draw ?? String(Number(line.current_draw))}
                        onChange={e => handleChange(line.line_item_id, "current_draw", e.target.value)}
                      />
                    ) : (
                      <span className="font-mono text-bm-text">{formatMoney(line.current_draw)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        className="w-24 rounded-md border border-bm-border/70 bg-bm-surface/85 px-2 py-1 text-right text-sm text-bm-text focus:border-bm-accent focus:outline-none"
                        value={edits?.materials_stored ?? String(Number(line.materials_stored))}
                        onChange={e => handleChange(line.line_item_id, "materials_stored", e.target.value)}
                      />
                    ) : (
                      <span className="font-mono text-bm-muted2">{formatMoney(line.materials_stored)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-medium text-bm-text">{formatMoney(line.total_completed)}</td>
                  <td className="px-3 py-2 text-right font-mono text-bm-muted2">{Number(line.percent_complete).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.retainage_amount)}</td>
                  <td className="px-3 py-2 text-right font-mono text-bm-muted2">{formatMoney(line.balance_to_finish)}</td>
                  <td className="px-3 py-2 text-center">
                    {line.variance_flag && (
                      <span className="inline-block cursor-help text-amber-400" title={line.variance_reason || "Variance detected"}>&#9888;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
v>
  );
}
