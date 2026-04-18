"use client";

import { X } from "lucide-react";
import { resolveReviewItem, type IntakeDetail } from "@/lib/accounting-api";

export type DetailDrawerProps = {
  detail: IntakeDetail | null;
  envId: string;
  businessId?: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
};

function fmtAmount(total: string | number | null | undefined, currency: string | null | undefined): string {
  if (total === null || total === undefined || total === "") return "—";
  const n = Number(total);
  if (Number.isNaN(n)) return String(total);
  return n.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
}

function Row({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</span>
      <span className={`text-right text-sm text-slate-100 ${mono ? "font-mono" : ""}`}>
        {value ?? <span className="text-slate-600">—</span>}
      </span>
    </div>
  );
}

export default function DetailDrawer({ detail, envId, businessId, onClose, onRefresh }: DetailDrawerProps) {
  if (!detail) return null;
  const parse = detail.parse;
  const intake = detail.intake;

  const handleResolve = async (itemId: string) => {
    await resolveReviewItem({ envId, businessId, itemId });
    await onRefresh();
  };

  return (
    <div
      className="absolute inset-y-0 right-0 z-20 flex w-[380px] max-w-full flex-col border-l border-slate-800 bg-slate-950 shadow-[-12px_0_32px_rgba(0,0,0,0.55)]"
      data-testid="detail-drawer"
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">
            Receipt Detail
          </div>
          <div className="text-sm text-slate-100">
            {parse?.service_name_guess || parse?.vendor_normalized || parse?.merchant_raw || intake.original_filename || "Receipt"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:text-slate-100"
          aria-label="Close detail drawer"
          data-testid="detail-drawer-close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Total</div>
          <div className="mt-1 font-mono text-[28px] leading-none tabular-nums text-slate-50">
            {fmtAmount(parse?.total ?? null, parse?.currency ?? null)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {parse?.transaction_date || "—"}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Platform vs Vendor
          </div>
          <Row
            label="Billing platform"
            value={
              parse?.billing_platform ? (
                <span className={parse.billing_platform.toLowerCase() === "apple" ? "text-amber-300" : ""}>
                  {parse.billing_platform}
                </span>
              ) : (
                <span className="text-slate-400">direct</span>
              )
            }
          />
          <Row label="Service name" value={parse?.service_name_guess || null} />
          <Row label="Underlying vendor" value={parse?.vendor_normalized || null} />
          <Row
            label="Confidence (vendor)"
            value={
              parse?.confidence_vendor != null
                ? `${(Number(parse.confidence_vendor) * 100).toFixed(0)}%`
                : null
            }
          />
        </div>

        <div className="mt-4">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            Source & Period
          </div>
          <Row label="Filename" value={intake.original_filename || null} mono={false} />
          <Row label="Source type" value={intake.source_type} />
          <Row
            label="Billing period"
            value={
              parse?.billing_period_start && parse?.billing_period_end
                ? `${parse.billing_period_start} → ${parse.billing_period_end}`
                : null
            }
          />
          <Row label="Apple doc ref" value={parse?.apple_document_ref || null} />
          <Row label="Renewal" value={parse?.renewal_language || null} mono={false} />
        </div>

        {detail.match_candidates.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Match candidates
            </div>
            {detail.match_candidates.map((c) => (
              <div
                key={c.id}
                className={`rounded border px-3 py-2 text-xs ${
                  c.match_status === "unmatched"
                    ? "border-amber-400/30 bg-amber-400/5 text-amber-200"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                <div className="flex justify-between">
                  <span>
                    {c.match_status === "unmatched" ? "No transactions imported yet" : `txn ${c.transaction_id?.slice(0, 8)}`}
                  </span>
                  <span className="tabular-nums text-slate-400">
                    score {(Number(c.match_score) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {detail.review_items.length > 0 ? (
          <div className="mt-4">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Open review items
            </div>
            {detail.review_items
              .filter((ri) => ri.status === "open")
              .map((ri) => (
                <div
                  key={ri.id}
                  className="mb-2 rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200"
                >
                  <div className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
                    {ri.reason.replace(/_/g, " ")}
                  </div>
                  <div className="mt-1">{ri.next_action}</div>
                  <button
                    type="button"
                    onClick={() => void handleResolve(ri.id)}
                    className="mt-2 rounded border border-emerald-500/40 bg-slate-950 px-2 py-0.5 text-[10px] uppercase tracking-widest text-emerald-300 hover:border-emerald-400 hover:text-emerald-200"
                    data-testid={`resolve-review-${ri.id}`}
                  >
                    Mark resolved
                  </button>
                </div>
              ))}
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-t border-slate-800 px-4 py-3">
        <button
          type="button"
          className="flex-1 rounded border border-cyan-400/50 bg-slate-900 py-1.5 text-[12px] text-cyan-300 hover:border-cyan-300 hover:text-cyan-200"
          data-testid="drawer-confirm"
          onClick={onClose}
        >
          Confirm
        </button>
        <button
          type="button"
          className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-[12px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
          onClick={onClose}
        >
          Defer
        </button>
      </div>
    </div>
  );
}
