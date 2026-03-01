"use client";

import { useEffect, useState } from "react";
import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
  ReV2EntityLineageResponse,
  ReV2TrialBalanceRow,
  ReV2PnlRow,
  ReV2TransactionRow,
} from "@/lib/bos-api";
import {
  getReV2AssetTrialBalance,
  getReV2AssetPnl,
  getReV2AssetTransactions,
} from "@/lib/bos-api";
import { WaterfallChart } from "@/components/charts";
import type { WaterfallItem } from "@/components/charts/WaterfallChart";
import { EntityLineagePanel } from "@/components/repe/EntityLineagePanel";
import RepeEntityDocuments from "@/components/repe/RepeEntityDocuments";

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n) || !n) return "—";
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

interface Props {
  assetId: string;
  quarter: string;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  lineage: ReV2EntityLineageResponse | null;
  businessId?: string;
  environmentId?: string;
  assetCreatedAt?: string;
}

export default function OpsAuditSection({
  assetId,
  quarter,
  financialState,
  periods,
  lineage,
  businessId,
  environmentId,
  assetCreatedAt,
}: Props) {
  const [lineageOpen, setLineageOpen] = useState(false);

  // Lazy-loaded accounting data
  const [trialBalance, setTrialBalance] = useState<ReV2TrialBalanceRow[]>([]);
  const [pnl, setPnl] = useState<ReV2PnlRow[]>([]);
  const [transactions, setTransactions] = useState<ReV2TransactionRow[]>([]);
  const [acctLoading, setAcctLoading] = useState(false);
  const [acctExpanded, setAcctExpanded] = useState(false);

  useEffect(() => {
    if (!acctExpanded) return;
    let cancelled = false;
    setAcctLoading(true);
    (async () => {
      const [tb, pl, tx] = await Promise.allSettled([
        getReV2AssetTrialBalance(assetId, quarter),
        getReV2AssetPnl(assetId, quarter),
        getReV2AssetTransactions(assetId, quarter),
      ]);
      if (cancelled) return;
      setTrialBalance(tb.status === "fulfilled" ? tb.value : []);
      setPnl(pl.status === "fulfilled" ? pl.value : []);
      setTransactions(tx.status === "fulfilled" ? tx.value : []);
      setAcctLoading(false);
    })();
    return () => { cancelled = true; };
  }, [acctExpanded, assetId, quarter]);

  // Build NOI waterfall
  const waterfallItems: WaterfallItem[] = [];
  if (financialState) {
    const revenue = Number(financialState.revenue ?? 0);
    const opex = Number(financialState.opex ?? 0);
    const noi = Number(financialState.noi ?? 0);
    if (revenue > 0) {
      waterfallItems.push({ name: "Revenue", value: revenue });
      waterfallItems.push({ name: "OpEx", value: -opex });
      waterfallItems.push({ name: "NOI", value: noi, isTotal: true });
    }
  }

  return (
    <div className="space-y-4" data-testid="asset-ops-audit-section">
      {/* NOI Bridge Waterfall */}
      {waterfallItems.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            NOI Bridge · {quarter}
          </h3>
          <WaterfallChart items={waterfallItems} height={260} />
        </div>
      )}

      {/* Documents */}
      {businessId && environmentId && (
        <RepeEntityDocuments
          businessId={businessId}
          envId={environmentId}
          entityType="asset"
          entityId={assetId}
        />
      )}

      {/* Run History + Audit */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2">
            Runs & Audit Trail
          </h3>
          <button
            type="button"
            onClick={() => setLineageOpen(true)}
            className="rounded-lg border border-bm-border px-3 py-1.5 text-xs hover:bg-bm-surface/40"
          >
            View Lineage
          </button>
        </div>
        <div className="space-y-3">
          <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
            <p className="font-medium">Asset Created</p>
            <p className="text-xs text-bm-muted2">
              {assetCreatedAt?.slice(0, 19).replace("T", " ") || "—"}
            </p>
          </div>
          {financialState && (
            <>
              <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
                <p className="font-medium">Latest Quarter State</p>
                <p className="text-xs text-bm-muted2">
                  Quarter: {financialState.quarter} · Run:{" "}
                  {financialState.run_id?.slice(0, 8) || "—"}
                </p>
                <p className="text-xs text-bm-muted2">
                  Inputs Hash: {financialState.inputs_hash || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-bm-border/60 p-3 text-sm">
                <p className="font-medium">Quarter State Count</p>
                <p className="text-xs text-bm-muted2">
                  {periods.length} quarters with data
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Accounting (collapsible) */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <button
          type="button"
          onClick={() => setAcctExpanded(!acctExpanded)}
          className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2"
        >
          <span>Accounting · {quarter}</span>
          <span className="text-xs">{acctExpanded ? "▲" : "▼"}</span>
        </button>
        {acctExpanded && (
          <div className="mt-4 space-y-4">
            {acctLoading ? (
              <p className="text-sm text-bm-muted2">Loading accounting data...</p>
            ) : (
              <>
                {/* Trial Balance */}
                <div>
                  <h4 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">
                    Trial Balance
                  </h4>
                  {trialBalance.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No trial balance data.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                            <th className="px-3 py-2 text-left font-medium">Account</th>
                            <th className="px-3 py-2 text-left font-medium">Name</th>
                            <th className="px-3 py-2 text-left font-medium">Category</th>
                            <th className="px-3 py-2 text-right font-medium">Balance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bm-border/40">
                          {trialBalance.map((row, i) => (
                            <tr key={i} className="hover:bg-bm-surface/20">
                              <td className="px-3 py-2 font-mono text-xs">{row.account_code}</td>
                              <td className="px-3 py-2">{row.account_name}</td>
                              <td className="px-3 py-2 text-bm-muted2">{row.category}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmtMoney(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* P&L */}
                <div>
                  <h4 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">
                    P&L by Category
                  </h4>
                  {pnl.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No P&L data.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                            <th className="px-3 py-2 text-left font-medium">Line Code</th>
                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bm-border/40">
                          {pnl.map((row, i) => (
                            <tr key={i} className="hover:bg-bm-surface/20">
                              <td className="px-3 py-2">{row.line_code}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmtMoney(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Transactions */}
                <div>
                  <h4 className="text-xs uppercase tracking-[0.1em] text-bm-muted2 mb-2">
                    Transactions
                  </h4>
                  {transactions.length === 0 ? (
                    <p className="text-sm text-bm-muted2">No transactions.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                            <th className="px-3 py-2 text-left font-medium">Period</th>
                            <th className="px-3 py-2 text-left font-medium">Account</th>
                            <th className="px-3 py-2 text-left font-medium">Name</th>
                            <th className="px-3 py-2 text-left font-medium">Category</th>
                            <th className="px-3 py-2 text-right font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-bm-border/40">
                          {transactions.map((tx, i) => (
                            <tr key={i} className="hover:bg-bm-surface/20">
                              <td className="px-3 py-2 text-bm-muted2">{String(tx.period_month).slice(0, 10)}</td>
                              <td className="px-3 py-2 font-mono text-xs">{tx.gl_account}</td>
                              <td className="px-3 py-2">{tx.name}</td>
                              <td className="px-3 py-2 text-bm-muted2">{tx.category}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmtMoney(tx.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <EntityLineagePanel
        open={lineageOpen}
        onOpenChange={setLineageOpen}
        title={`Asset Lineage · ${quarter}`}
        lineage={lineage}
      />
    </div>
  );
}
