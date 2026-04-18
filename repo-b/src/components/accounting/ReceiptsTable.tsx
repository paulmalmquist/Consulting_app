"use client";

import type { ReceiptIntakeRow } from "@/lib/accounting-api";

export type ReceiptsTableProps = {
  rows: ReceiptIntakeRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function confColor(conf: number): string {
  if (conf >= 0.95) return "text-emerald-400";
  if (conf >= 0.8) return "text-cyan-300";
  return "text-amber-300";
}

function fmtAmount(total: string | number | null, currency: string | null): string {
  if (total === null || total === undefined || total === "") return "—";
  const n = Number(total);
  if (Number.isNaN(n)) return String(total);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: currency || "USD",
  });
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export default function ReceiptsTable({ rows, selectedId, onSelect }: ReceiptsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="p-8 text-center font-mono text-xs text-slate-500">
        <div>no receipts yet.</div>
        <div className="mt-2">upload a pdf, png, or jpg via the top-bar button.</div>
      </div>
    );
  }

  return (
    <table
      className="w-full border-collapse font-mono text-[12px]"
      data-testid="receipts-table"
    >
      <thead>
        <tr className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-widest text-slate-500">
          <th className="w-[90px] px-3 py-2 text-left">ID</th>
          <th className="w-[140px] px-3 py-2 text-left">Received</th>
          <th className="px-3 py-2 text-left">Vendor / Service</th>
          <th className="w-[100px] px-3 py-2 text-left">Platform</th>
          <th className="w-[120px] px-3 py-2 text-right">Total</th>
          <th className="w-[80px] px-3 py-2 text-left">Source</th>
          <th className="w-[70px] px-3 py-2 text-right">Conf</th>
          <th className="w-[120px] px-3 py-2 text-left">State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const active = r.id === selectedId;
          const conf = Number(r.confidence_overall ?? 0);
          return (
            <tr
              key={r.id}
              onClick={() => onSelect(r.id)}
              className={`cursor-pointer border-b border-slate-800 transition ${
                active
                  ? "border-l-2 border-l-cyan-400 bg-slate-800/60"
                  : "hover:bg-slate-900"
              }`}
              data-testid={`receipt-row-${r.id}`}
            >
              <td className="px-3 py-2 text-slate-500">{shortId(r.id)}</td>
              <td className="px-3 py-2 text-slate-300">
                {r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : "—"}
              </td>
              <td className="px-3 py-2">
                <div className="text-slate-100">
                  {r.service_name_guess || r.vendor_normalized || r.merchant_raw || "unknown"}
                </div>
                {r.vendor_normalized && r.service_name_guess && r.vendor_normalized !== r.service_name_guess ? (
                  <div className="text-[10px] text-slate-500">
                    vendor: {r.vendor_normalized}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2">
                {r.billing_platform?.toLowerCase() === "apple" ? (
                  <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-amber-300">
                    Apple
                  </span>
                ) : r.billing_platform ? (
                  <span className="text-[10px] uppercase tracking-widest text-slate-400">
                    {r.billing_platform}
                  </span>
                ) : (
                  <span className="text-slate-600">direct</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                {fmtAmount(r.total, r.currency)}
              </td>
              <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500">
                {r.source_type === "upload" ? "UPL" : r.source_type === "email" ? "EML" : r.source_type.slice(0, 3).toUpperCase()}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${confColor(conf)}`}>
                {(conf * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2 text-[10px] uppercase tracking-widest">
                {r.ingest_status === "parsed" ? (
                  <span className="text-emerald-400">parsed</span>
                ) : r.ingest_status === "duplicate" ? (
                  <span className="text-amber-300">duplicate</span>
                ) : r.ingest_status === "failed" ? (
                  <span className="text-rose-400">failed</span>
                ) : (
                  <span className="text-slate-400">pending</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
