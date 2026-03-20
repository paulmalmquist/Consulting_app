"use client";

import { cn } from "@/components/ui/cn";
import type { CpInvoiceLineItem, CpDrawLineItem } from "@/types/capital-projects";

function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (confidence >= 0.6) return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-rose-500/40 bg-rose-500/10 text-rose-300";
}

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}

interface InvoiceMatchReviewProps {
  invoiceLines: CpInvoiceLineItem[];
  drawLines: CpDrawLineItem[];
  onOverride?: (invoiceLineId: string, drawLineItemId: string) => void;
  onConfirmAll?: () => void;
}

export function InvoiceMatchReview({ invoiceLines, drawLines, onOverride, onConfirmAll }: InvoiceMatchReviewProps) {
  if (!invoiceLines || invoiceLines.length === 0) {
    return <p className="text-sm text-bm-muted2">No invoice line items to review.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-bm-text">{invoiceLines.length} line items</p>
        {onConfirmAll && (
          <button
            onClick={onConfirmAll}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20"
          >
            Confirm All Matches
          </button>
        )}
      </div>

      <div className="space-y-2">
        {invoiceLines.map(line => {
          const conf = Number(line.match_confidence);
          const matched = drawLines.find(dl => dl.line_item_id === line.matched_draw_line_id);

          return (
            <div key={line.invoice_line_id} className="rounded-lg border border-bm-border/30 bg-bm-surface/20 p-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-bm-muted2">#{line.line_number}</span>
                    <span className="text-sm text-bm-text">{line.description || "No description"}</span>
                  </div>
                  {line.cost_code && (
                    <span className="mt-1 inline-block font-mono text-[10px] text-bm-muted2">Code: {line.cost_code}</span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-sm text-bm-text">{formatMoney(line.amount)}</span>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <span className={cn("rounded-md border px-2 py-0.5 text-xs", confidenceColor(conf))}>
                  {(conf * 100).toFixed(0)}% {line.match_strategy?.replace(/_/g, " ") || "unmatched"}
                </span>

                {matched ? (
                  <span className="text-xs text-bm-muted2">
                    → <span className="font-mono text-bm-accent">{matched.cost_code}</span> {matched.description}
                  </span>
                ) : (
                  <span className="text-xs text-bm-muted2">No match found</span>
                )}

                {onOverride && conf < 0.85 && (
                  <select
                    className="ml-auto rounded-md border border-bm-border/70 bg-bm-surface/85 px-2 py-1 text-xs text-bm-text"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) onOverride(line.invoice_line_id, e.target.value);
                    }}
                  >
                    <option value="">Override match...</option>
                    {drawLines.map(dl => (
                      <option key={dl.line_item_id} value={dl.line_item_id}>
                        {dl.cost_code} — {dl.description}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
