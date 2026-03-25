"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Loader2 } from "lucide-react";
import type { AssetPreview } from "@/lib/bos-api";

interface ValuationTabProps {
  preview: AssetPreview | null;
  loading: boolean;
}

function fmtCcy(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return `${(value * 100).toFixed(2)}%`;
}

export function ValuationTab({ preview, loading }: ValuationTabProps) {
  const exitData = preview?.exit;
  const metrics = preview?.metrics;
  const cashflows = preview?.cashflows;

  const totalNoi = useMemo(() => {
    if (!cashflows?.length) return 0;
    return cashflows.reduce((s, cf) => s + cf.noi, 0);
  }, [cashflows]);

  const forwardNoi = useMemo(() => {
    if (!cashflows?.length) return 0;
    // Last 4 quarters as forward 12-month NOI
    const last4 = cashflows.slice(-4);
    return last4.reduce((s, cf) => s + cf.noi, 0);
  }, [cashflows]);

  // Valuation bridge waterfall data
  const bridgeData = useMemo(() => {
    if (!exitData) return [];
    const grossPrice = exitData.gross_sale_price;
    const dispCosts = grossPrice - exitData.net_sale_proceeds;
    const debtPayoff = exitData.net_sale_proceeds - exitData.equity_proceeds;

    return [
      { label: "Gross Sale Price", value: grossPrice, color: "#38bdf8" },
      { label: "Disposition Costs", value: -dispCosts, color: "#f87171" },
      { label: "Debt Payoff", value: -debtPayoff, color: "#f87171" },
      { label: "Net Equity Proceeds", value: exitData.equity_proceeds, color: "#10b981" },
    ];
  }, [exitData]);

  if (loading && !preview) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={18} className="animate-spin text-bm-muted" />
        <span className="ml-2 text-xs text-bm-muted">Loading valuation...</span>
      </div>
    );
  }

  if (!preview || !exitData) {
    return (
      <div className="py-12 text-center">
        <p className="text-xs text-bm-muted2">No valuation data available.</p>
        <p className="mt-1 text-[10px] text-bm-muted">Configure exit assumptions to see valuation metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Projected NOI (Fwd 12mo)" value={fmtCcy(forwardNoi)} />
        <MetricTile
          label="Exit Cap Rate"
          value={
            // Derive from gross_sale_price / forwardNoi
            forwardNoi > 0 ? fmtPct(forwardNoi / exitData.gross_sale_price) : "\u2014"
          }
        />
        <MetricTile label="Estimated Sale Price" value={fmtCcy(exitData.gross_sale_price)} accent />
        <MetricTile label="Net Sale Proceeds" value={fmtCcy(exitData.net_sale_proceeds)} />
        <MetricTile label="Net Equity Proceeds" value={fmtCcy(exitData.equity_proceeds)} accent />
        {metrics?.ending_nav != null && (
          <MetricTile label="Ending NAV" value={fmtCcy(metrics.ending_nav)} />
        )}
      </div>

      {/* ── Valuation Bridge ── */}
      {bridgeData.length > 0 && (
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-4">
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
            Valuation Bridge
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bridgeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                tickFormatter={(v) => fmtCcy(Math.abs(v))}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
                width={130}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v: number) => [fmtCcy(Math.abs(v)), v < 0 ? "Deduction" : "Proceeds"]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {bridgeData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Sale Details ── */}
      {exitData.sale_date && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/10 px-4 py-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-bm-muted">Projected Sale Date</span>
            <span className="text-bm-text font-medium">{exitData.sale_date}</span>
          </div>
        </div>
      )}

      {/* ── Total Hold NOI ── */}
      <div className="rounded-lg border border-bm-border/30 bg-bm-surface/10 px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-bm-muted">Total Hold Period NOI</span>
          <span className="text-bm-text font-medium tabular-nums">{fmtCcy(totalNoi)}</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-bm-muted">Hold Period</span>
          <span className="text-bm-text font-medium tabular-nums">{cashflows?.length || 0} quarters</span>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-bm-border/30 bg-bm-surface/10 px-3 py-2.5">
      <div className="text-[9px] uppercase tracking-[0.1em] text-bm-muted">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${accent ? "text-bm-accent" : "text-bm-text"}`}>
        {value}
      </div>
    </div>
  );
}
