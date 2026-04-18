"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listSubscriptions,
  markSubscriptionNonBusiness,
  type SpendType,
  type SubscriptionRow,
} from "@/lib/accounting-api";

export type SubscriptionsTableProps = {
  envId: string;
  businessId?: string;
  onToast?: (msg: string) => void;
};

type SpendFilter = "all" | SpendType;

const SPEND_TYPE_LABEL: Record<SpendType, string> = {
  subscription_fixed: "Subscription",
  api_usage: "API usage",
  one_off: "One-off",
  reimbursable_client: "Client reimbursable",
  ambiguous: "Ambiguous",
};

const SPEND_TYPE_ACCENT: Record<SpendType, string> = {
  subscription_fixed: "bg-violet-400/15 text-violet-200 border-violet-400/30",
  api_usage: "bg-cyan-400/15 text-cyan-200 border-cyan-400/30",
  one_off: "bg-emerald-400/15 text-emerald-200 border-emerald-400/30",
  reimbursable_client: "bg-amber-400/15 text-amber-200 border-amber-400/30",
  ambiguous: "bg-rose-400/15 text-rose-200 border-rose-400/30",
};

function usd(n: string | number | null | undefined, currency: string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (Number.isNaN(v)) return String(n);
  return v.toLocaleString("en-US", { style: "currency", currency: currency || "USD" });
}

export default function SubscriptionsTable({ envId, businessId, onToast }: SubscriptionsTableProps) {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [filter, setFilter] = useState<SpendFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listSubscriptions({
        envId,
        businessId,
        activeOnly: filter !== "ambiguous",
        spendType: filter === "all" ? undefined : filter,
      });
      setRows(res.rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [envId, businessId, filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = useMemo(() => {
    const c: Record<SpendFilter, number> = {
      all: rows.length,
      subscription_fixed: 0,
      api_usage: 0,
      one_off: 0,
      reimbursable_client: 0,
      ambiguous: 0,
    };
    rows.forEach((r) => {
      if (r.spend_type) c[r.spend_type] += 1;
    });
    return c;
  }, [rows]);

  const onMarkNonBusiness = useCallback(
    async (id: string) => {
      onToast?.("Marking non-business…");
      try {
        await markSubscriptionNonBusiness({ envId, businessId, subscriptionId: id });
        onToast?.("Subscription marked non-business");
        await refresh();
      } catch (err) {
        onToast?.(`Mark failed: ${(err as Error).message}`);
      }
    },
    [envId, businessId, refresh, onToast],
  );

  return (
    <div className="flex h-full flex-col" data-testid="subscriptions-tab">
      <div className="flex flex-none items-center gap-2 border-b border-slate-800 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Spend type
        </span>
        {(Object.keys(counts) as SpendFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
              filter === key
                ? "border-violet-400 bg-violet-400/15 text-violet-200"
                : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
            data-testid={`subs-filter-${key}`}
          >
            {key === "all" ? "All" : SPEND_TYPE_LABEL[key]}
            <span className="ml-1 text-[10px] text-slate-500">({counts[key]})</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="p-6 text-sm text-rose-300">Error: {error}</div>
        ) : loading && rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">Loading subscriptions…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center font-mono text-xs text-slate-500">
            <div>no subscriptions in this view.</div>
            <div className="mt-2">upload a few monthly receipts and run &quot;Detect recurring&quot; in the top bar.</div>
          </div>
        ) : (
          <table
            className="w-full border-collapse font-mono text-[12px]"
            data-testid="subscriptions-table"
          >
            <thead>
              <tr className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-widest text-slate-500">
                <th className="px-3 py-2 text-left">Service</th>
                <th className="w-[90px] px-3 py-2 text-left">Platform</th>
                <th className="w-[130px] px-3 py-2 text-left">Spend type</th>
                <th className="w-[90px] px-3 py-2 text-left">Cadence</th>
                <th className="w-[110px] px-3 py-2 text-right">Expected</th>
                <th className="w-[80px] px-3 py-2 text-right">Occurs</th>
                <th className="w-[110px] px-3 py-2 text-left">Last seen</th>
                <th className="w-[110px] px-3 py-2 text-left">Next expected</th>
                <th className="w-[90px] px-3 py-2 text-left">Docs</th>
                <th className="w-[110px] px-3 py-2 text-left">Change</th>
                <th className="w-[60px] px-3 py-2 text-right">…</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = r.spend_type;
                const delta = r.last_price_delta_pct;
                const priceBadge =
                  delta !== null && delta !== undefined && Math.abs(delta) > 0.02
                    ? `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`
                    : null;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-slate-800 hover:bg-slate-900"
                    data-testid={`subscription-row-${r.id}`}
                  >
                    <td className="px-3 py-2">
                      <div className="text-slate-100">{r.service_name}</div>
                      {r.vendor_normalized && r.vendor_normalized !== r.service_name ? (
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
                    <td className="px-3 py-2">
                      {st ? (
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-widest ${SPEND_TYPE_ACCENT[st]}`}
                        >
                          {SPEND_TYPE_LABEL[st]}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{r.cadence}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                      {usd(r.expected_amount, r.currency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {r.occurrence_count ?? 0}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{r.last_seen_date ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-400">{r.next_expected_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.documentation_complete ? (
                        <span className="text-emerald-400">✓ complete</span>
                      ) : (
                        <span className="text-amber-300">missing</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {priceBadge ? (
                        <span className="rounded bg-rose-400/10 px-1.5 py-0.5 text-[10px] text-rose-300">
                          {priceBadge}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="relative px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setMenuOpenFor((cur) => (cur === r.id ? null : r.id))}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[12px] text-slate-300 hover:border-slate-500 hover:text-slate-100"
                        aria-label={`Actions for ${r.service_name}`}
                        data-testid={`subs-actions-toggle-${r.id}`}
                      >
                        ⋯
                      </button>
                      {menuOpenFor === r.id ? (
                        <div
                          className="absolute right-3 top-full z-30 mt-1 w-56 rounded border border-slate-700 bg-slate-900 shadow-lg"
                          data-testid={`subs-actions-menu-${r.id}`}
                        >
                          <MenuItem
                            label="Mark non-business"
                            onClick={() => {
                              setMenuOpenFor(null);
                              void onMarkNonBusiness(r.id);
                            }}
                            testId={`subs-action-non-business-${r.id}`}
                          />
                          <MenuItem
                            label="View occurrences"
                            onClick={() => setMenuOpenFor(null)}
                            testId={`subs-action-occurrences-${r.id}`}
                          />
                          <MenuItem
                            label="Mark mixed (needs split)"
                            onClick={() => setMenuOpenFor(null)}
                            testId={`subs-action-mixed-${r.id}`}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  testId,
}: {
  label: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-[12px] text-slate-200 hover:bg-slate-800"
      data-testid={testId}
    >
      {label}
    </button>
  );
}
