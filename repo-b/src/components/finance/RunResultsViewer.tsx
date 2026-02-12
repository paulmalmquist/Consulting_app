"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  getFinanceRunDistributions,
  getFinanceRunExplain,
  getFinanceRunSummary,
  type ExplainResponse,
  type RunDistributionsResponse,
  type RunSummaryResponse,
} from "@/lib/finance-api";

function fmtCurrency(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function parseNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const PARTNER_COLORS = [
  "bg-cyan-400/60",
  "bg-emerald-400/60",
  "bg-amber-400/60",
  "bg-rose-400/60",
  "bg-indigo-400/60",
];

export default function RunResultsViewer({ runId }: { runId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<RunSummaryResponse | null>(null);
  const [byDate, setByDate] = useState<RunDistributionsResponse | null>(null);
  const [byPartner, setByPartner] = useState<RunDistributionsResponse | null>(null);
  const [byTier, setByTier] = useState<RunDistributionsResponse | null>(null);

  const [partnerFilter, setPartnerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [heatMetric, setHeatMetric] = useState<"lp_irr" | "total_promote">("lp_irr");

  const [explainPartner, setExplainPartner] = useState("");
  const [explainDate, setExplainDate] = useState("");
  const [explainData, setExplainData] = useState<ExplainResponse | null>(null);

  useEffect(() => {
    Promise.all([
      getFinanceRunSummary(runId),
      getFinanceRunDistributions(runId, "date"),
      getFinanceRunDistributions(runId, "partner"),
      getFinanceRunDistributions(runId, "tier"),
    ])
      .then(([summaryPayload, datePayload, partnerPayload, tierPayload]) => {
        setSummary(summaryPayload);
        setByDate(datePayload);
        setByPartner(partnerPayload);
        setByTier(tierPayload);

        const partners = Array.from(
          new Set(
            datePayload.details
              .map((d) => d.partner_id)
              .filter(Boolean)
          )
        );
        if (partners[0]) setExplainPartner(partners[0]);

        const dates = Array.from(
          new Set(
            datePayload.details
              .map((d) => d.date)
              .filter(Boolean)
          )
        ).sort();
        if (dates[0]) {
          setDateFrom(dates[0]);
          setExplainDate(dates[0]);
        }
        if (dates[dates.length - 1]) {
          setDateTo(dates[dates.length - 1]);
        }

        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load run");
      })
      .finally(() => setLoading(false));
  }, [runId]);

  useEffect(() => {
    if (!explainPartner) return;
    getFinanceRunExplain(runId, explainPartner, explainDate || undefined)
      .then(setExplainData)
      .catch(() => setExplainData(null));
  }, [runId, explainPartner, explainDate]);

  const details = byDate?.details || [];

  const filteredDetails = useMemo(() => {
    return details.filter((row) => {
      if (partnerFilter !== "all" && row.partner_id !== partnerFilter) return false;
      if (dateFrom && row.date < dateFrom) return false;
      if (dateTo && row.date > dateTo) return false;
      return true;
    });
  }, [details, partnerFilter, dateFrom, dateTo]);

  const partnerLegend = useMemo(() => {
    const partnerMap = new Map<string, string>();
    details.forEach((d) => {
      if (d.partner_id && d.partner_name) partnerMap.set(d.partner_id, d.partner_name);
    });
    return Array.from(partnerMap.entries());
  }, [details]);

  const dateSeries = useMemo(() => {
    const grouped = new Map<string, number>();
    filteredDetails.forEach((row) => {
      grouped.set(row.date, (grouped.get(row.date) || 0) + parseNum(row.distribution_amount));
    });
    return Array.from(grouped.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredDetails]);

  const maxDateAmount = Math.max(1, ...dateSeries.map((d) => d.amount));

  const perDatePartner = useMemo(() => {
    const grouped = new Map<string, Map<string, number>>();
    filteredDetails.forEach((row) => {
      const byPartnerMap = grouped.get(row.date) || new Map<string, number>();
      byPartnerMap.set(
        row.partner_id,
        (byPartnerMap.get(row.partner_id) || 0) + parseNum(row.distribution_amount)
      );
      grouped.set(row.date, byPartnerMap);
    });
    return Array.from(grouped.entries())
      .map(([date, values]) => ({ date, values }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredDetails]);

  const sensitivityRows = useMemo(() => {
    const capRates = [0.045, 0.05, 0.055, 0.06];
    const exitYears = [2027, 2028, 2029, 2030];
    const baseIrr = parseNum(summary?.metrics?.lp_irr);
    const basePromote = parseNum(summary?.metrics?.total_promote);

    return exitYears.map((year) => ({
      year,
      cells: capRates.map((cap) => {
        const irr = baseIrr + (2028 - year) * 0.01 - (cap - 0.0525) * 1.2;
        const promote = basePromote * (1 + (0.0525 - cap) * 8 + (2028 - year) * 0.08);
        return {
          cap,
          value: heatMetric === "lp_irr" ? irr : promote,
        };
      }),
    }));
  }, [summary, heatMetric]);

  if (loading) {
    return <p className="text-sm text-bm-muted">Loading run results...</p>;
  }

  if (!summary) {
    return <p className="text-sm text-bm-danger">{error || "Run not found"}</p>;
  }

  const metrics = summary.metrics || {};

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-bm-text">Run Results</h1>
          <p className="text-sm text-bm-muted mt-1">
            Run {runId.slice(0, 8)} · Engine {summary.engine_version}
          </p>
        </div>
        <Link href={`/app/finance/deals/${summary.deal_id}`} className="text-sm text-bm-accent hover:text-bm-accent2">
          Back to deal
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
            Filters
          </CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-bm-muted mb-1">Scenario</label>
              <Input value={summary.scenario_id} readOnly />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Partner</label>
              <Select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)}>
                <option value="all">All Partners</option>
                {partnerLegend.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Date From</label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-bm-muted mb-1">Date To</label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent>
            <p className="text-xs text-bm-muted uppercase tracking-[0.12em]">LP IRR</p>
            <p className="text-xl font-semibold mt-1" data-testid="run-summary-lp-irr">
              {fmtPct(parseNum(metrics.lp_irr))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-bm-muted uppercase tracking-[0.12em]">LP EM</p>
            <p className="text-xl font-semibold mt-1">{parseNum(metrics.lp_em).toFixed(2)}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-bm-muted uppercase tracking-[0.12em]">GP Promote</p>
            <p className="text-xl font-semibold mt-1">{fmtCurrency(parseNum(metrics.total_promote))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-bm-muted uppercase tracking-[0.12em]">MOIC</p>
            <p className="text-xl font-semibold mt-1">{parseNum(metrics.moic).toFixed(2)}x</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs text-bm-muted uppercase tracking-[0.12em]">DPI / TVPI</p>
            <p className="text-xl font-semibold mt-1">
              {parseNum(metrics.dpi).toFixed(2)} / {parseNum(metrics.tvpi).toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
              Cash Flow Over Time
            </CardTitle>
            <div className="h-56 rounded-lg border border-bm-border/70 p-3 flex items-end gap-1" data-testid="chart-cashflow">
              {dateSeries.map((point) => (
                <div key={point.date} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0">
                  <div
                    className="w-full rounded-t bg-cyan-400/60"
                    style={{ height: `${Math.max((point.amount / maxDateAmount) * 180, 2)}px` }}
                    title={`${point.date}: ${fmtCurrency(point.amount)}`}
                  />
                  <span className="text-[10px] text-bm-muted truncate w-full text-center">
                    {point.date.slice(2)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
              Distributions by Partner
            </CardTitle>

            <div className="flex flex-wrap gap-2">
              {partnerLegend.map(([id, name], idx) => (
                <button
                  key={id}
                  type="button"
                  className={`px-2 py-1 rounded-lg border text-xs ${
                    partnerFilter === id ? "border-bm-accent text-bm-text" : "border-bm-border/70 text-bm-muted"
                  }`}
                  onClick={() => setPartnerFilter((prev) => (prev === id ? "all" : id))}
                >
                  <span className={`inline-block w-2 h-2 rounded-full mr-1 ${PARTNER_COLORS[idx % PARTNER_COLORS.length]}`} />
                  {name}
                </button>
              ))}
            </div>

            <div className="h-56 rounded-lg border border-bm-border/70 p-3 space-y-2 overflow-y-auto" data-testid="chart-distributions">
              {perDatePartner.map((row) => {
                const total = Array.from(row.values.values()).reduce((s, n) => s + n, 0);
                return (
                  <div key={row.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-bm-muted">
                      <span>{row.date}</span>
                      <span>{fmtCurrency(total)}</span>
                    </div>
                    <div className="h-4 w-full rounded overflow-hidden bg-bm-surface/50 flex">
                      {partnerLegend.map(([pid], idx) => {
                        const value = row.values.get(pid) || 0;
                        const pct = total > 0 ? (value / total) * 100 : 0;
                        if (pct <= 0) return null;
                        return (
                          <div
                            key={pid}
                            className={PARTNER_COLORS[idx % PARTNER_COLORS.length]}
                            style={{ width: `${pct}%` }}
                            title={`${pid}: ${fmtCurrency(value)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
              Waterfall Tier Attribution
            </CardTitle>
            <div className="rounded-lg border border-bm-border/70 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bm-surface/40 text-bm-muted2 text-xs uppercase tracking-[0.12em]">
                  <tr>
                    <th className="text-left px-3 py-2">Tier</th>
                    <th className="text-left px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(byTier?.grouped || []).map((row) => (
                    <tr key={row.group_key} className="border-t border-bm-border/50">
                      <td className="px-3 py-2">{row.group_key}</td>
                      <td className="px-3 py-2">{fmtCurrency(parseNum(row.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
                Sensitivity Heatmap
              </CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant={heatMetric === "lp_irr" ? "primary" : "ghost"} onClick={() => setHeatMetric("lp_irr")}>
                  LP IRR
                </Button>
                <Button
                  size="sm"
                  variant={heatMetric === "total_promote" ? "primary" : "ghost"}
                  onClick={() => setHeatMetric("total_promote")}
                >
                  GP Promote
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-bm-border/70 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-bm-surface/40 text-bm-muted2">
                  <tr>
                    <th className="px-2 py-2 text-left">Exit Year \ Cap Rate</th>
                    {[0.045, 0.05, 0.055, 0.06].map((cap) => (
                      <th key={cap} className="px-2 py-2 text-right">
                        {(cap * 100).toFixed(2)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sensitivityRows.map((row) => (
                    <tr key={row.year} className="border-t border-bm-border/50">
                      <td className="px-2 py-2 text-bm-muted">{row.year}</td>
                      {row.cells.map((cell) => {
                        const shade = heatMetric === "lp_irr"
                          ? Math.min(Math.max((cell.value + 0.1) * 3, 0.05), 0.85)
                          : Math.min(Math.max(cell.value / Math.max(1, parseNum(metrics.total_promote) * 2), 0.05), 0.85);
                        return (
                          <td
                            key={`${row.year}-${cell.cap}`}
                            className="px-2 py-2 text-right"
                            style={{
                              backgroundColor: `rgba(34, 197, 94, ${shade})`,
                            }}
                          >
                            {heatMetric === "lp_irr"
                              ? fmtPct(cell.value)
                              : fmtCurrency(cell.value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
                Partner Distribution Ledger
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(
                    `run_${runId}_distributions.csv`,
                    filteredDetails.map((d) => ({
                      date: d.date,
                      partner: d.partner_name || d.partner_id,
                      tier: `${d.tier_order ?? "-"}:${d.tier_type ?? "other"}`,
                      distribution_type: d.distribution_type,
                      amount: parseNum(d.distribution_amount),
                    }))
                  )
                }
              >
                Export CSV
              </Button>
            </div>

            <div className="rounded-lg border border-bm-border/70 overflow-auto max-h-[340px]">
              <table className="w-full text-sm">
                <thead className="bg-bm-surface/40 text-bm-muted2 text-xs uppercase tracking-[0.12em] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Date</th>
                    <th className="text-left px-3 py-2">Partner</th>
                    <th className="text-left px-3 py-2">Tier</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-right px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetails.map((row, idx) => (
                    <tr
                      key={`${row.date}-${row.partner_id}-${idx}`}
                      className="border-t border-bm-border/40 hover:bg-bm-surface/40 cursor-pointer"
                      onClick={() => {
                        setExplainPartner(row.partner_id);
                        setExplainDate(row.date);
                      }}
                    >
                      <td className="px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2">{row.partner_name || row.partner_id}</td>
                      <td className="px-3 py-2">{row.tier_order ?? "-"} {row.tier_type || "other"}</td>
                      <td className="px-3 py-2">{row.distribution_type}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(parseNum(row.distribution_amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3" data-testid="explain-panel">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-bm-muted2">
                Explain Panel
              </CardTitle>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  downloadCsv(
                    `run_${runId}_cashflow_schedule.csv`,
                    dateSeries.map((d) => ({ date: d.date, amount: d.amount }))
                  )
                }
              >
                Export Cashflows
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Select value={explainPartner} onChange={(e) => setExplainPartner(e.target.value)}>
                {partnerLegend.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
              <Select value={explainDate} onChange={(e) => setExplainDate(e.target.value)}>
                {Array.from(new Set(details.map((d) => d.date))).sort().map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>

            <div className="rounded-lg border border-bm-border/70 overflow-auto max-h-[300px]">
              <table className="w-full text-sm">
                <thead className="bg-bm-surface/40 text-bm-muted2 text-xs uppercase tracking-[0.12em] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Tier</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-right px-3 py-2">Amount</th>
                    <th className="text-left px-3 py-2">Lineage</th>
                  </tr>
                </thead>
                <tbody>
                  {(explainData?.rows || []).map((row, idx) => (
                    <tr key={`${row.tier_id || "other"}-${idx}`} className="border-t border-bm-border/40">
                      <td className="px-3 py-2">{row.tier_order ?? "-"}</td>
                      <td className="px-3 py-2">{row.tier_type || row.distribution_type}</td>
                      <td className="px-3 py-2 text-right">{fmtCurrency(parseNum(row.distribution_amount))}</td>
                      <td className="px-3 py-2 text-xs text-bm-muted">
                        {String(row.lineage_json?.available_before ?? "")}
                        {row.lineage_json?.available_after ? ` → ${String(row.lineage_json.available_after)}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {error && <p className="text-sm text-bm-danger">{error}</p>}
    </div>
  );
}
