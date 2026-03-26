"use client";

import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import { FundMetricsBand } from "./FundMetricsBand";
import { WaterfallSummaryBand } from "./WaterfallSummaryBand";
import { AssetContributionTable } from "./AssetContributionTable";
import { JvOwnershipSummaryStrip } from "./JvOwnershipSummaryStrip";
import { QuarterlySparklines } from "./QuarterlySparklines";
import type { FundBaseScenario, FundScenarioTab } from "./types";
import type { QuarterlySparklineData } from "./QuarterlySparklines";

function ValueBridgeChart({ result }: { result: FundBaseScenario }) {
  const bridge = result.bridge;
  if (!bridge || bridge.length === 0) return null;

  const maxAbs = Math.max(...bridge.map((r) => Math.abs(r.amount)), 1);

  return (
    <div className="rounded-lg border border-bm-border/50 bg-bm-surface/10 p-4">
      <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-bm-muted mb-3">
        Value Bridge
      </h3>
      <div className="space-y-1.5">
        {bridge.map((row, i) => {
          const pct = (Math.abs(row.amount) / maxAbs) * 100;
          const barColor =
            row.kind === "total"
              ? "bg-blue-500"
              : row.kind === "positive"
                ? "bg-green-500"
                : row.kind === "negative"
                  ? "bg-red-500"
                  : "bg-zinc-500";

          return (
            <div key={`${row.label}-${i}`} className="flex items-center gap-3 text-xs">
              <div className="w-40 shrink-0 text-right text-bm-muted2 truncate">{row.label}</div>
              <div className="flex-1 flex items-center">
                <div
                  className={`h-4 rounded-sm ${barColor}`}
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <div className={`w-20 text-right font-medium ${
                row.kind === "negative" ? "text-red-400" : "text-bm-text"
              }`}>
                {fmtMoney(row.amount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FundSummaryStrip({ result }: { result: FundBaseScenario }) {
  const s = result.summary;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Paid-In Capital</div>
        <div className="font-medium text-bm-text">{fmtMoney(s.paid_in_capital)}</div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Distributed</div>
        <div className="font-medium text-bm-text">{fmtMoney(s.distributed_capital)}</div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Committed</div>
        <div className="font-medium text-bm-text">{fmtMoney(s.total_committed)}</div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Unrealized G/L</div>
        <div className={`font-medium ${s.unrealized_gain_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
          {fmtMoney(s.unrealized_gain_loss)}
        </div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Realized G/L</div>
        <div className={`font-medium ${s.realized_gain_loss >= 0 ? "text-green-400" : "text-red-400"}`}>
          {fmtMoney(s.realized_gain_loss)}
        </div>
      </div>
      <div className="text-xs">
        <div className="text-[10px] uppercase text-bm-muted">Mgmt Fees + Expenses</div>
        <div className="font-medium text-bm-text">
          {fmtMoney(s.management_fees + s.fund_expenses)}
        </div>
      </div>
    </div>
  );
}

export function OverviewTab({
  result,
  baseResult,
  onAssetClick,
  onTabChange,
  sparklineData,
}: {
  result: FundBaseScenario;
  baseResult?: FundBaseScenario | null;
  onAssetClick?: (assetId: string) => void;
  onTabChange?: (tab: FundScenarioTab) => void;
  sparklineData?: QuarterlySparklineData | null;
}) {
  return (
    <div className="space-y-6">
      {/* Band 1: Fund-level return metrics */}
      <FundMetricsBand result={result} baseResult={baseResult} />

      {/* Secondary metrics strip */}
      <FundSummaryStrip result={result} />

      {/* Quarterly trend sparklines */}
      <QuarterlySparklines
        data={sparklineData}
        onViewDetail={onTabChange ? () => onTabChange("cash-flows") : undefined}
      />

      {/* JV / Ownership summary */}
      <JvOwnershipSummaryStrip
        result={result}
        onViewDetail={onTabChange ? () => onTabChange("jv-ownership") : undefined}
      />

      {/* Band 2: Waterfall / LP/GP summary */}
      <WaterfallSummaryBand result={result} />

      {/* Value Bridge */}
      <ValueBridgeChart result={result} />

      {/* Band 3: Asset contribution table */}
      <AssetContributionTable
        assets={result.assets}
        onAssetClick={onAssetClick}
      />
    </div>
  );
}
