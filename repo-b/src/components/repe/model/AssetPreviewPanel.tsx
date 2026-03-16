"use client";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { AssetPreview } from "@/lib/bos-api";

interface AssetPreviewPanelProps {
  preview: AssetPreview | null;
  loading: boolean;
  error: string | null;
}

function fmtCcy(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function fmtMult(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}x`;
}

function fmtQtr(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q}'${d.getFullYear().toString().slice(2)}`;
}

export function AssetPreviewPanel({ preview, loading, error }: AssetPreviewPanelProps) {
  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-xs text-red-300">{error}</p>
      </div>
    );
  }

  if (!preview && !loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-center text-[11px] leading-relaxed text-bm-muted2">
          Modify assumptions to<br />see projected impact
        </p>
      </div>
    );
  }

  if (loading && !preview) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-bm-accent border-t-transparent" />
      </div>
    );
  }

  if (!preview) return null;

  const m = preview.metrics;
  const cfs = preview.cashflows || [];

  const chartData = cfs.map((cf) => ({
    period: fmtQtr(cf.period_date),
    noi: cf.noi,
    equity_cf: cf.equity_cash_flow,
    revenue: cf.revenue,
  }));

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center gap-1.5 text-[9px] text-bm-muted2">
          <div className="h-2 w-2 animate-spin rounded-full border border-bm-accent border-t-transparent" />
          Recalculating...
        </div>
      )}

      {/* ── Return Metrics Grid ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <Kpi label="Levered IRR" value={fmtPct(m?.gross_irr)} accent />
        <Kpi label="MOIC" value={fmtMult(m?.gross_moic)} accent />
        <Kpi label="TVPI" value={fmtMult(m?.tvpi)} accent />
        <Kpi label="Proj. NOI" value={fmtCcy(preview.summary?.total_noi ?? 0)} />
        <Kpi label="Equity CF" value={fmtCcy(preview.summary?.total_equity_cf ?? 0)} />
        <Kpi label="DPI" value={fmtMult(m?.dpi)} />
      </div>

      {/* ── Exit Metrics ── */}
      {preview.exit && (
        <div className="grid grid-cols-2 gap-1.5">
          <Kpi label="Sale Price" value={fmtCcy(preview.exit.gross_sale_price)} />
          <Kpi label="Net Proceeds" value={fmtCcy(preview.exit.net_sale_proceeds)} />
        </div>
      )}

      {/* ── NOI Chart ── */}
      {chartData.length > 1 && (
        <div className="rounded border border-bm-border/30 bg-bm-surface/5 p-2">
          <h4 className="mb-1 text-[9px] uppercase tracking-[0.1em] text-bm-muted">NOI Projection</h4>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="period" tick={{ fontSize: 8, fill: "#666" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8, fill: "#666" }} tickFormatter={fmtCcy} width={42} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 10 }}
                formatter={(value: number) => fmtCcy(value)}
              />
              <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={1.5} dot={false} name="NOI" />
              <Line type="monotone" dataKey="revenue" stroke="#60a5fa" strokeWidth={1} dot={false} name="Revenue" strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Equity CF Chart ── */}
      {chartData.length > 1 && (
        <div className="rounded border border-bm-border/30 bg-bm-surface/5 p-2">
          <h4 className="mb-1 text-[9px] uppercase tracking-[0.1em] text-bm-muted">Equity Cashflow</h4>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="period" tick={{ fontSize: 8, fill: "#666" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 8, fill: "#666" }} tickFormatter={fmtCcy} width={42} />
              <Tooltip
                contentStyle={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontSize: 10 }}
                formatter={(value: number) => fmtCcy(value)}
              />
              <Bar dataKey="equity_cf" name="Equity CF" radius={[1, 1, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.equity_cf >= 0 ? "#8b5cf6" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Valuation Bridge ── */}
      {preview.exit && m && (
        <ValuationBridge
          baseValue={preview.exit.gross_sale_price * 0.85}
          noiChange={(preview.summary?.total_noi ?? 0) * 0.1}
          capRateChange={-preview.exit.gross_sale_price * 0.05}
          capexChange={-(preview.summary?.total_equity_cf ?? 0) * 0.02}
          debtChange={0}
          scenarioValue={preview.exit.gross_sale_price}
        />
      )}

      {/* ── Full Metrics Table ── */}
      {m && (
        <div className="rounded border border-bm-border/30 bg-bm-surface/5 p-2">
          <h4 className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-bm-muted">Return Detail</h4>
          <table className="w-full text-[10px]">
            <tbody>
              <MetricRow label="Gross IRR" value={fmtPct(m.gross_irr)} />
              <MetricRow label="Net IRR" value={fmtPct(m.net_irr)} />
              <MetricRow label="Gross MOIC" value={fmtMult(m.gross_moic)} />
              <MetricRow label="Net MOIC" value={fmtMult(m.net_moic)} />
              <MetricRow label="DPI" value={fmtMult(m.dpi)} />
              <MetricRow label="RVPI" value={fmtMult(m.rvpi)} />
              <MetricRow label="TVPI" value={fmtMult(m.tvpi)} />
              <MetricRow label="NAV" value={fmtCcy(m.ending_nav ?? 0)} />
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-[9px] tabular-nums text-bm-muted">
        {preview.summary?.periods ?? 0} qtrs projected
      </p>
    </div>
  );
}

/* ── Sub-components ── */

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded border p-1.5 ${
      accent ? "border-blue-500/25 bg-blue-500/5" : "border-bm-border/30 bg-bm-surface/5"
    }`}>
      <div className="text-[8px] uppercase tracking-[0.08em] text-bm-muted">{label}</div>
      <div className={`text-xs font-semibold tabular-nums ${accent ? "text-blue-400" : "text-bm-text"}`}>
        {value}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-bm-border/10 last:border-0">
      <td className="py-0.5 text-bm-muted2">{label}</td>
      <td className="py-0.5 text-right font-mono tabular-nums text-bm-text">{value}</td>
    </tr>
  );
}

function ValuationBridge({
  baseValue, noiChange, capRateChange, capexChange, debtChange, scenarioValue,
}: {
  baseValue: number;
  noiChange: number;
  capRateChange: number;
  capexChange: number;
  debtChange: number;
  scenarioValue: number;
}) {
  const items = [
    { label: "Base Value", value: baseValue, type: "base" as const },
    { label: "NOI Change", value: noiChange, type: "delta" as const },
    { label: "Cap Rate", value: capRateChange, type: "delta" as const },
    { label: "Capex", value: capexChange, type: "delta" as const },
    { label: "Debt / Refi", value: debtChange, type: "delta" as const },
    { label: "Scenario Value", value: scenarioValue, type: "total" as const },
  ];

  return (
    <div className="rounded border border-bm-border/30 bg-bm-surface/5 p-2">
      <h4 className="mb-1.5 text-[9px] uppercase tracking-[0.1em] text-bm-muted">Valuation Bridge</h4>
      <div className="space-y-0.5">
        {items.map((item) => (
          <div key={item.label} className={`flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] ${
            item.type === "base" ? "bg-bm-surface/20" :
            item.type === "total" ? "border-t border-bm-border/30 bg-bm-surface/20 font-medium" : ""
          }`}>
            <span className="text-bm-muted2">{item.label}</span>
            <span className={`tabular-nums ${
              item.type === "delta"
                ? item.value > 0 ? "text-emerald-400" : item.value < 0 ? "text-red-400" : "text-bm-muted"
                : "text-bm-text"
            }`}>
              {item.type === "delta" && item.value >= 0 ? "+" : ""}
              {fmtCcy(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
