"use client";

import type { ReconciliationException } from "@/lib/vultr-contracts";

interface Props {
  exceptions: ReconciliationException[];
  open: boolean;
  onClose: () => void;
}

const SEVERITY_COLOR = {
  info: "border-sky-500/40 bg-sky-950/30 text-sky-200",
  warning: "border-yellow-500/40 bg-yellow-950/30 text-yellow-200",
  critical: "border-rose-500/40 bg-rose-950/30 text-rose-200",
} as const;

const TYPE_LABEL: Record<string, string> = {
  usage_not_invoiced: "Usage not invoiced",
  invoice_no_usage: "Invoice with no usage",
  contract_mismatch: "Contract mismatch",
  discount_mismatch: "Discount mismatch",
  recognition_lag: "Recognition lag",
  cash_not_collected: "Cash not collected",
};

export function GpuCapacityExceptionDrawer({ exceptions, open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l border-bm-divider/40 bg-bm-bg-0 shadow-2xl">
      <div className="flex items-center justify-between border-b border-bm-divider/30 px-4 py-3">
        <h2 className="text-sm font-semibold">Reconciliation Exceptions</h2>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-xs text-bm-muted2 hover:text-bm-fg transition-colors"
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {exceptions.length === 0 ? (
          <p className="text-xs text-bm-muted2">No exceptions in this period.</p>
        ) : (
          <ul className="space-y-3">
            {exceptions.map((exc) => (
              <li
                key={exc.exception_id}
                className={`rounded border px-3 py-2.5 text-xs ${
                  SEVERITY_COLOR[exc.severity]
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {TYPE_LABEL[exc.exception_type] ?? exc.exception_type}
                  </span>
                  <span className="font-mono shrink-0">
                    ${exc.amount_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="mt-1 text-[10px] opacity-70">
                  {exc.customer_name ?? exc.customer_id}
                  {" · "}
                  {exc.period_start} → {exc.period_end}
                </div>
                {exc.notes && (
                  <div className="mt-1 text-[10px] opacity-60">{exc.notes}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
