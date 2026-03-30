"use client";

import { useEffect, useState } from "react";
import type {
  ReV2AssetQuarterState,
  ReV2AssetPeriod,
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
import { fmtMoney } from "./format-utils";
import TBUploadDrawer from "./TBUploadDrawer";
import StatementTable from "@/components/repe/statements/StatementTable";

interface Props {
  assetId: string;
  quarter: string;
  financialState: ReV2AssetQuarterState | null;
  periods: ReV2AssetPeriod[];
  envId?: string;
  businessId?: string;
}

export default function FinancialsSection({
  assetId,
  quarter: initialQuarter,
  financialState,
  periods,
  envId,
  businessId,
}: Props) {
  // Period selector — stateful within section
  const [selectedQuarter, setSelectedQuarter] = useState(initialQuarter);
  const quarter = selectedQuarter;

  // Upload drawer
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadRefreshKey, setUploadRefreshKey] = useState(0);

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
    <div className="space-y-4" data-testid="asset-financials-section">
      {/* Period selector + lock badge */}
      {periods.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Period</label>
          <select
            value={quarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="rounded-lg border border-bm-border bg-bm-surface px-3 py-1.5 text-sm text-bm-text focus:border-bm-accent focus:outline-none"
          >
            {periods.map((p) => (
              <option key={p.quarter} value={p.quarter}>{p.quarter}</option>
            ))}
          </select>
          {/* Lock badge — visual indicator (actual lock state comes from re_run) */}
          <span className="inline-flex items-center gap-1 rounded-full border border-bm-border/50 bg-bm-surface/20 px-2 py-0.5 text-[10px] text-bm-muted2">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            {quarter === initialQuarter ? "Current" : "Historical"}
          </span>
        </div>
      )}

      {/* NOI Bridge Waterfall */}
      {waterfallItems.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            NOI Bridge &middot; {quarter}
          </h3>
          <WaterfallChart items={waterfallItems} height={260} />
        </div>
      )}

      {/* Financial Statements (Income Statement / Cash Flow with toggles) */}
      {envId && businessId && (
        <StatementTable
          entityType="asset"
          entityId={assetId}
          envId={envId}
          businessId={businessId}
          initialQuarter={quarter}
          availablePeriods={periods.map((p) => p.quarter)}
        />
      )}

      {/* Historical P&L Summary */}
      {periods.length > 0 && (
        <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
          <h3 className="text-xs uppercase tracking-[0.12em] text-bm-muted2 mb-3">
            Quarterly History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-bm-border/50 text-xs uppercase tracking-[0.1em] text-bm-muted2">
                  <th className="px-3 py-2 text-left font-medium">Quarter</th>
                  <th className="px-3 py-2 text-right font-medium">Revenue</th>
                  <th className="px-3 py-2 text-right font-medium">OpEx</th>
                  <th className="px-3 py-2 text-right font-medium">NOI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bm-border/40">
                {periods.map((p) => (
                  <tr key={p.quarter} className="hover:bg-bm-surface/20">
                    <td className="px-3 py-2 font-medium">{p.quarter}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.revenue)}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.opex)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtMoney(p.noi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Accounting Detail (collapsible) */}
      <div className="rounded-xl border border-bm-border/70 bg-bm-surface/20 p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setAcctExpanded(!acctExpanded)}
            className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-bm-muted2"
          >
            <span>Accounting &middot; {quarter}</span>
            <span className="text-xs">{acctExpanded ? "\u25B2" : "\u25BC"}</span>
          </button>
          {envId && businessId && (
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-bm-border/50 px-3 py-1.5 text-xs font-medium text-bm-muted2 hover:bg-bm-surface/30 hover:text-bm-text transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
              Upload Trial Balance
            </button>
          )}
        </div>
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
      {/* TB Upload Drawer */}
      {envId && businessId && (
        <TBUploadDrawer
          assetId={assetId}
          envId={envId}
          businessId={businessId}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onCommitted={() => {
            setUploadRefreshKey((k) => k + 1);
            setAcctExpanded(true);
          }}
        />
      )}
    </div>
  );
}
