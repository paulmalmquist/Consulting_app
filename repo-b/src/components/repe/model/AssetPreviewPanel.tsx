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
} from "recharts";
import type { AssetPreview } from "@/lib/bos-api";

interface AssetPreviewPanelProps {
  preview: AssetPreview | null;
  loading: boolean;
  error: string | null;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(2)}%`;
}

function formatMultiple(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}x`;
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear().toString().slice(2)}`;
}

export function AssetPreviewPanel({ preview, loading, error }: AssetPreviewPanelProps) {
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-xs text-red-300">{error}</p>
      </div>
    );
  }

  if (!preview && !loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-center text-xs text-bm-muted2">
          Edit assumptions to see<br />live projections
        </p>
      </div>
    );
  }

  if (loading && !preview) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-bm-accent border-t-transparent" />
      </div>
    );
  }

  if (!preview) return null;

  const metrics = preview.metrics;
  const cfs = preview.cashflows || [];

  const chartData = cfs.map((cf) => ({
    period: formatQuarter(cf.period_date),
    noi: cf.noi,
    equity_cf: cf.equity_cash_flow,
    revenue: cf.revenue,
    expenses: cf.expenses,
    debt_service: cf.debt_service,
  }));

  return (
    <div className="space-y-4 overflow-y-auto">
      {loading && (
        <div className="flex items-center gap-1.5 text-[10px] text-bm-muted2">
          <div className="h-2.5 w-2.5 animate-spin rounded-full border border-bm-accent border-t-transparent" />
          Recalculating...
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          label="Projected NOI"
          value={formatCurrency(preview.summary?.total_noi ?? 0)}
        />
        <KpiCard
          label="Equity CF"
          value={formatCurrency(preview.summary?.total_equity_cf ?? 0)}
        />
        <KpiCard
          label="Levered IRR"
          value={formatPct(metrics?.gross_irr)}
          highlight
        />
        <KpiCard
          label="MOIC"
          value={formatMultiple(metrics?.gross_moic)}
          highlight
        />
        {preview.exit && (
          <>
            <KpiCard
              label="Sale Proceeds"
              value={formatCurrency(preview.exit.net_sale_proceeds)}
            />
            <KpiCard
              label="Equity at Exit"
              value={formatCurrency(preview.exit.equity_proceeds)}
            />
          </>
        )}
      </div>

      {/* Return Metrics Detail */}
      {metrics && (
        <div className="rounded-lg border border-bm-border/40 bg-bm-surface/10 p-3">
          <h4 className="mb-2 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Return Metrics</h4>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
            <MetricRow label="Gross IRR" value={formatPct(metrics.gross_irr)} />
            <MetricRow label="Net IRR" value={formatPct(metrics.net_irr)} />
            <MetricRow label="DPI" value={formatMultiple(metrics.dpi)} />
            <MetricRow label="RVPI" value={formatMultiple(metrics.rvpi)} />
            <MetricRow label="TVPI" value={formatMultiple(metrics.tvpi)} />
            <MetricRow label="NAV" value={formatCurrency(metrics.ending_nav ?? 0)} />
          </div>
        </div>
      )}

      {/* NOI Projection Chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg border border-bm-border/40 bg-bm-surface/10 p-3">
          <h4 className="mb-2 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">NOI Projection</h4>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#888" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v) => formatCurrency(v)} width={50} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Line type="monotone" dataKey="noi" stroke="#10b981" strokeWidth={2} dot={false} name="NOI" />
              <Line type="monotone" dataKey="revenue" stroke="#60a5fa" strokeWidth={1} dot={false} name="Revenue" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Equity Cashflow Timeline */}
      {chartData.length > 0 && (
        <div className="rounded-lg border border-bm-border/40 bg-bm-surface/10 p-3">
          <h4 className="mb-2 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Equity Cashflow</h4>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="period" tick={{ fontSize: 9, fill: "#888" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v) => formatCurrency(v)} width={50} />
              <Tooltip
                contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Bar dataKey="equity_cf" fill="#8b5cf6" name="Equity CF" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Debt Summary */}
      {preview.exit && (
        <div className="rounded-lg border border-bm-border/40 bg-bm-surface/10 p-3">
          <h4 className="mb-2 text-[10px] uppercase tracking-[0.12em] text-bm-muted2">Exit Summary</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <MetricRow label="Sale Price" value={formatCurrency(preview.exit.gross_sale_price)} />
            <MetricRow label="Net Proceeds" value={formatCurrency(preview.exit.net_sale_proceeds)} />
            <MetricRow label="Sale Date" value={preview.exit.sale_date || "Not set"} />
            <MetricRow label="Equity at Exit" value={formatCurrency(preview.exit.equity_proceeds)} />
          </div>
        </div>
      )}

      {/* Period Count */}
      <p className="text-center text-[10px] text-bm-muted2">
        {preview.summary?.periods ?? 0} quarterly periods projected
      </p>
    </div>
  );
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${
      highlight
        ? "border-bm-accent/30 bg-bm-accent/5"
        : "border-bm-border/40 bg-bm-surface/10"
    }`}>
      <div className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${
        highlight ? "text-bm-accent" : "text-bm-text"
      }`}>
        {value}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-bm-muted2">{label}</span>
      <span className="col-span-2 font-mono tabular-nums text-bm-text">{value}</span>
    </>
  );
}
