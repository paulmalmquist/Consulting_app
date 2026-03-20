"use client";

import { useCallback, useEffect, useState } from "react";
import { useRepeContext } from "@/lib/repe-context";
import { listCpInvoices, uploadCpInvoice } from "@/lib/bos-api";
import type { CpInvoice } from "@/types/capital-projects";
import { cn } from "@/components/ui/cn";

function formatMoney(value?: string | number | null): string {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function matchBadge(status: string) {
  switch (status) {
    case "auto_matched": return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "manually_matched": return "border-blue-500/40 bg-blue-500/10 text-blue-300";
    case "disputed": return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    default: return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
}

function ocrBadge(status: string) {
  switch (status) {
    case "completed": return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
    case "failed": return "border-rose-500/40 bg-rose-500/10 text-rose-300";
    case "processing": return "border-blue-500/40 bg-blue-500/10 text-blue-300";
    default: return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  }
}

export default function InvoiceListPage({ params }: { params: { projectId: string } }) {
  const { envId, businessId } = useRepeContext();
  const [invoices, setInvoices] = useState<CpInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!envId || !businessId) return;
    setLoading(true);
    listCpInvoices(params.projectId, envId, businessId)
      .then(setInvoices)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [envId, businessId, params.projectId]);

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || !envId || !businessId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadCpInvoice(params.projectId, file, undefined, envId, businessId);
        if (result.invoice) {
          setInvoices(prev => [result.invoice, ...prev]);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [envId, businessId, params.projectId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  }, [handleUpload]);

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-lg border border-bm-border/60 bg-bm-surface/60 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight text-bm-text">Invoices</h1>
          <p className="mt-1 text-xs text-bm-muted2">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {error && <div className="rounded-lg border border-bm-danger/40 bg-bm-danger/10 px-4 py-3 text-sm text-bm-danger">{error}</div>}

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragOver ? "border-bm-accent bg-bm-accent/5" : "border-bm-border/40 bg-bm-surface/20",
          uploading && "opacity-50 pointer-events-none",
        )}
      >
        <p className="text-sm text-bm-muted2">
          {uploading ? "Uploading..." : "Drag & drop invoice PDFs here, or"}
        </p>
        <label className="mt-2 inline-block cursor-pointer rounded-lg border border-bm-accent/40 bg-bm-accent/10 px-4 py-2 text-sm font-medium text-bm-accent hover:bg-bm-accent/20">
          Browse Files
          <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
        </label>
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-bm-border/40 bg-bm-surface/30 p-8 text-center">
          <p className="text-sm text-bm-muted2">No invoices uploaded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-bm-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-bm-border/40 bg-bm-surface/40">
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Invoice #</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">File</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Date</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">OCR</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Match</th>
                <th className="px-4 py-3 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Amount</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.invoice_id} className="border-b border-bm-border/20 hover:bg-bm-surface/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-bm-accent">{inv.invoice_number || "—"}</td>
                  <td className="px-4 py-3 text-bm-text text-xs max-w-[200px] truncate">{inv.file_name || "—"}</td>
                  <td className="px-4 py-3 text-bm-muted2 text-xs">{formatDate(inv.invoice_date)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs", ocrBadge(inv.ocr_status))}>
                      {inv.ocr_status} ({(Number(inv.ocr_confidence) * 100).toFixed(0)}%)
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs", matchBadge(inv.match_status))}>
                      {inv.match_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-bm-text">{formatMoney(inv.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-bm-muted2 capitalize">{inv.status}</span>
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
