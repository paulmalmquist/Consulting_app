"use client";

import type { ReviewItem } from "@/lib/accounting-api";

export type NeedsAttentionTableProps = {
  items: ReviewItem[];
  selectedId: string | null;
  onSelect: (intakeId: string) => void;
};

const REASON_META: Record<string, { glyph: string; label: string; accent: string }> = {
  apple_ambiguous:     { glyph: "◉", label: "APPLE AMBIGUOUS",  accent: "text-cyan-300" },
  low_confidence:      { glyph: "⊕", label: "LOW CONFIDENCE",   accent: "text-amber-300" },
  uncategorized:       { glyph: "⇋", label: "UNCATEGORIZED",    accent: "text-violet-300" },
  unmatched:           { glyph: "⇋", label: "UNMATCHED",        accent: "text-amber-300" },
  missing_transaction: { glyph: "!", label: "MISSING TXN",      accent: "text-rose-400" },
  possibly_personal:   { glyph: "◐", label: "PERSONAL?",        accent: "text-violet-300" },
  suspected_duplicate: { glyph: "⇋", label: "DUPLICATE?",       accent: "text-amber-300" },
  price_increased:     { glyph: "!", label: "PRICE CHANGED",    accent: "text-rose-400" },
  cadence_changed:     { glyph: "!", label: "CADENCE CHANGED",  accent: "text-rose-400" },
};

function fmtAmount(total: string | number | null | undefined, currency: string | null | undefined): string {
  if (total === null || total === undefined || total === "") return "—";
  const n = Number(total);
  if (Number.isNaN(n)) return String(total);
  return n.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
}

export default function NeedsAttentionTable({ items, selectedId, onSelect }: NeedsAttentionTableProps) {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center font-mono text-xs text-slate-500">
        <div>no open review items.</div>
        <div className="mt-2">the queue is clean — upload more receipts or come back later.</div>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse font-mono text-[12px]" data-testid="needs-attention-table">
      <thead>
        <tr className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-widest text-slate-500">
          <th className="w-[24px] px-2 py-2" />
          <th className="w-[160px] px-3 py-2 text-left">Type</th>
          <th className="w-[110px] px-3 py-2 text-left">Date</th>
          <th className="w-[110px] px-3 py-2 text-right">Amount</th>
          <th className="px-3 py-2 text-left">Vendor / Service</th>
          <th className="px-3 py-2 text-left">Next Action</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const meta = REASON_META[item.reason] || {
            glyph: "⊕",
            label: item.reason.toUpperCase(),
            accent: "text-slate-300",
          };
          const active = item.intake_id === selectedId;
          return (
            <tr
              key={item.id}
              onClick={() => item.intake_id && onSelect(item.intake_id)}
              className={`cursor-pointer border-b border-slate-800 transition ${
                active
                  ? "border-l-2 border-l-cyan-400 bg-slate-800/60"
                  : "hover:bg-slate-900"
              }`}
              data-testid={`needs-row-${item.id}`}
            >
              <td className={`px-2 py-2 text-center text-lg ${meta.accent}`}>{meta.glyph}</td>
              <td className={`px-3 py-2 ${meta.accent}`}>{meta.label}</td>
              <td className="px-3 py-2 text-slate-400">
                {item.transaction_date || new Date(item.created_at).toISOString().slice(0, 10)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                {fmtAmount(item.total, item.currency)}
              </td>
              <td className="px-3 py-2 text-slate-200">
                {item.service_name_guess || item.vendor_normalized || item.merchant_raw || "—"}
                {item.billing_platform?.toLowerCase() === "apple" ? (
                  <span className="ml-2 rounded bg-amber-400/10 px-1 text-[9px] uppercase tracking-widest text-amber-300">
                    via apple
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-slate-300">{item.next_action}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
