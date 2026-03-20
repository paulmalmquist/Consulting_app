"use client";

import type { CpDrawRequest } from "@/types/capital-projects";

function fmt(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(amount);
}

interface G702PreviewProps {
  draw: CpDrawRequest;
  originalContractSum?: number;
  netChangeOrders?: number;
  onGeneratePdf?: () => void;
  generating?: boolean;
}

export function G702Preview({ draw, originalContractSum = 0, netChangeOrders = 0, onGeneratePdf, generating }: G702PreviewProps) {
  const contractToDate = originalContractSum + netChangeOrders;
  const totalPrevious = Number(draw.total_previous_draws ?? 0);
  const totalCurrent = Number(draw.total_current_draw ?? 0);
  const totalMaterials = Number(draw.total_materials_stored ?? 0);
  const totalCompleted = totalPrevious + totalCurrent + totalMaterials;
  const retainage = Number(draw.total_retainage_held ?? 0);
  const earnedLessRetainage = totalCompleted - retainage;
  const previousCerts = totalPrevious;
  const currentDue = Number(draw.total_amount_due ?? 0);
  const balancePlusRetainage = contractToDate - earnedLessRetainage;

  const rows = [
    { num: 1, label: "Original Contract Sum", value: fmt(originalContractSum) },
    { num: 2, label: "Net Change by Change Orders", value: fmt(netChangeOrders) },
    { num: 3, label: "Contract Sum to Date (Line 1 + 2)", value: fmt(contractToDate) },
    { num: 4, label: "Total Completed & Stored to Date", value: fmt(totalCompleted) },
    { num: 5, label: "Retainage", value: fmt(retainage) },
    { num: 6, label: "Total Earned Less Retainage (4 - 5)", value: fmt(earnedLessRetainage) },
    { num: 7, label: "Less Previous Certificates for Payment", value: fmt(previousCerts) },
    { num: 8, label: "Current Payment Due (6 - 7)", value: fmt(currentDue), highlight: true },
    { num: 9, label: "Balance to Finish Plus Retainage (3 - 6)", value: fmt(balancePlusRetainage) },
  ];

  return (
    <div className="rounded-xl border border-bm-border/40 bg-bm-surface/20">
      <div className="border-b border-bm-border/30 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-bm-text">AIA Document G702</h3>
            <p className="text-[10px] text-bm-muted2">Application and Certificate for Payment — Draw #{draw.draw_number}</p>
          </div>
          {onGeneratePdf && (
            <button
              onClick={onGeneratePdf}
              disabled={generating}
              className="rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-3 py-1.5 text-xs font-medium text-bm-accent hover:bg-bm-accent/20 disabled:opacity-50"
            >
              {generating ? "Generating..." : "Generate PDF"}
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-bm-border/20">
        {rows.map(row => (
          <div key={row.num} className={`flex items-center justify-between px-4 py-2.5 ${row.highlight ? "bg-bm-accent/5" : ""}`}>
            <span className="text-xs text-bm-text">
              <span className="mr-2 font-mono text-bm-muted2">{row.num}.</span>
              {row.label}
            </span>
            <span className={`font-mono text-sm ${row.highlight ? "font-bold text-bm-accent" : "text-bm-text"}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
