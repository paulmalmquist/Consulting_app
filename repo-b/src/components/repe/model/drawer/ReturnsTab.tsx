"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Loader2 } from "lucide-react";
import type { AssetPreview } from "@/lib/bos-api";

interface ReturnsTabProps {
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

function fmtMult(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  return `${value.toFixed(2)}x`;
}

export function ReturnsTab({ preview, loading }: ReturnsTabProps) {
  const metrics = preview?.metrics;
  const cashflows = preview?.cashflows;
  const exitData = preview?.exit;

  // Compute cumulative equity CF for J-curve
  const jCurveData = useMemo(() => {
    if (!cashflows?.length) return [];
    let cumulative = 0;
    return cashflows.map((cf) => {
      cumulative += cf.equity_cash_flow;
      const d = new Date(cf.period_date);
      const q = Math.ceil((d.getMonth() + 1) / 3);
      return {
        label: `${d.getFullYear()}Q${q}`,
        cumulative_equity_cf: cumulative,
        period_equity_cf: cf.equity_cash_flow,
      };
    });
  }, [cashflows]);

  // Compute equity invested and returned
  const equityInvested = useMemo(() => {
    if (!cashflows?.length) return 0;
    return Math.abs(
      cashflows
        .filter((cf) => cf.equity_cash_flow < 0)
        .reduce((s, cf) => s + cf.equity_cash_flow, 0),
    );
  }, [cashflows]);

  const equityReturned = useMemo(() => {
    if (!cashflows?.length) return 0;
    return cashflows
      .filter((cf) => cf.equity_cash_flow > 0)
      .reduce((s, cf) => s + cf.equity_cash_flow, 0);
  }, [cashflows]);

  if (loading && !preview) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={18} className="animate-spin text-bm-muted" />
        <span className="ml-2 text-xs text-bm-muted">Loading returns...</span>
      </div>
    );
  }

  if (!preview || !metrics) {
    return (
      <div className="py-12 text-center">
        <p className="text-xs text-bm-muted2">No return data available.</p>
        <p className="mt-1 text-[10px] text-bm-muted">Run the model or configure assumptions to see return metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Primary Return Metrics ── */}
      <div className="grid grid-cols-3 gap-3">
        <MetricTile label="Levered IRR" value={fmtPct(metrics.gross_irr)} accent />
        <MetricTile label="MOIC" value={fmtMult(metrics.gross_moic)} accent />
        <MetricTile label="TVPI" value={fmtMult(metrics.tvpi)} accent />
      </div>

      {/* ── Secondary Metrics ── */}
      <div className="grid grid-cols-2 gap-3">
        <MetricTile label="Equity Invested" value={fmtCcy(equityInvested)} />
        <MetricTile label="Equity Returned" value={fmtCcy(equityReturned)} />
        <MetricTile label="DPI" value={fmtMult(metrics.dpi)} />
        <MetricTile label="RVPI" value={fmtMult(metrics.rvpi)} />
        <MetricTile label="Net IRR" value={fmtPct(metrics.net_irr)} />
        <MetricTile label="Net MOIC" value={fmtMult(metrics.net_moic)} />
      </div>

      {/* ── J-Curve (Cumulative Equity Cash Flow) ── */}
      {jCurveData.length > 0 && (
        <div className="rounded-xl border border-bm-border/50 bg-bm-surface/10 p-4">
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-bm-muted2">
            J-Curve (Cumulative Equity Cash Flow)
          </h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={jCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                interval={Math.max(0, Math.floor(jCurveData.length / 8) - 1)}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
                tickFormatter={(v) => fmtCcy(v)}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a2e",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                formatter={(v: number, name: string) => [
                  fmtCcy(v),
                  name === "cumulative_equity_cf" ? "Cumulative Equity CF" : "Period Equity CF",
                ]}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Line
                type="monotone"
                dataKey="cumulative_equity_cf"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="period_equity_cf"
                stroke="rgba(139,92,246,0.3)"
                strokeWidth={1}
                dot={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Exit Summary ── */}
      {exitData && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/10 px-4 py-3">
          <h4 className="mb-2 text-[10px] font-medium uppercase tracking-[0.1em] text-bm-muted2">
            Exit Summary
          </h4>
          <div className="space-y-1">
            {exitData.sale_date && (
              <div className="flex justify-between text-xs">
                <span className="text-bm-muted">Sale Date</span>
                <span className="text-bm-text tabular-nums">{exitData.sale_date}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-bm-muted">Gross Sale Price</span>
              <span className="text-bm-text tabular-nums">{fmtCcy(exitData.gross_sale_price)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-bm-muted">Net Sale Proceeds</span>
              <span className="text-bm-text tabular-nums">{fmtCcy(exitData.net_sale_proceeds)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-bm-muted">Net Equity Proceeds</span>
              <span className="text-emerald-400 font-medium tabular-nums">{fmtCcy(exitData.equity_proceeds)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Hold Period ── */}
      {cashflows && (
        <div className="rounded-lg border border-bm-border/30 bg-bm-surface/10 px-4 py-3">
          <div className="flex justify-between text-xs">
            <span className="text-bm-muted">Hold Period</span>
            <span className="text-bm-text tabular-nums">{cashflows.length} quarters ({(cashflows.length / 4).toFixed(1)} years)</span>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-bm-muted">Total Equity Cash Flow</span>
            <span className={`font-medium tabular-nums ${
              (preview.summary?.total_equity_cf ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
            }`}>
              {fmtCcy(preview.summary?.total_equity_cf ?? 0)}
            </span>
          </div>
        </div>
      )}
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
