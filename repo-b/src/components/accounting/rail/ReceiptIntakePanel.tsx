"use client";

import type { ReceiptIntakeRow } from "@/lib/accounting-api";

export type ReceiptIntakePanelProps = {
  rows: ReceiptIntakeRow[];
  onSelect: (id: string) => void;
};

function sourceTag(source: string): string {
  switch (source) {
    case "email": return "EML";
    case "apple_export": return "APL";
    case "recurring_inferred": return "REC";
    case "transaction_only": return "TXN";
    case "bulk_upload": return "BLK";
    default: return "UPL";
  }
}

function fmtAmount(total: string | number | null, currency: string | null): string {
  if (total === null || total === undefined || total === "") return "—";
  const n = Number(total);
  return n.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
}

export default function ReceiptIntakePanel({ rows, onSelect }: ReceiptIntakePanelProps) {
  return (
    <section
      className="rounded border border-slate-800 bg-slate-900/60"
      data-testid="rail-receipt-intake"
    >
      <header className="flex items-center justify-between border-b border-slate-800 bg-gradient-to-r from-cyan-500/15 via-transparent to-transparent px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-300">
          Receipt Intake
        </span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          live
        </span>
      </header>
      <div>
        {rows.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[11px] text-slate-500">
            waiting for first upload…
          </div>
        ) : (
          rows.map((r) => {
            const conf = Number(r.confidence_overall ?? 0);
            const lowConf = conf < 0.8;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                className={`flex w-full items-start gap-2 border-b border-slate-800 px-3 py-2 text-left text-xs transition ${
                  lowConf ? "bg-amber-400/5" : "hover:bg-slate-800/50"
                }`}
              >
                <span className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded border border-slate-700 bg-slate-900 font-mono text-[9px] uppercase tracking-widest text-cyan-300">
                  {sourceTag(r.source_type)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-100">
                      {r.service_name_guess || r.vendor_normalized || r.merchant_raw || "unknown"}
                    </span>
                    <span className="font-mono tabular-nums text-slate-200">
                      {fmtAmount(r.total, r.currency)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-slate-500">
                    <span>{new Date(r.created_at).toISOString().slice(0, 10)}</span>
                    {r.billing_platform?.toLowerCase() === "apple" ? (
                      <span className="text-amber-300">via Apple</span>
                    ) : null}
                    <span className={lowConf ? "text-amber-300" : "text-emerald-400"}>
                      {(conf * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
