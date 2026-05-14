"use client";

/**
 * REPE Fund Portfolio page.
 *
 * Single canonical data source: getFundPortfolioCoherent(envId, quarter), which
 * returns one payload covering portfolio_summary + fund_rows + diagnostics +
 * provenance. The previous three-call stitch (listReV1Funds +
 * getPortfolioAuthoritativeStates + getReV2EnvironmentPortfolioKpis) is gone —
 * each endpoint defined "included fund" differently, and the resulting UI
 * showed quarantined orphans in the primary table while header metrics
 * excluded them.
 *
 * Plan / gap report: audit/fund_portfolio_coherence/gap_report.md.
 *
 * Contract:
 *   - fund_rows are released, non-quarantined, scope-complete authoritative
 *     snapshots. They are the only rows rendered in the primary table.
 *   - diagnostics are the excluded counterparts (quarantined / archived /
 *     draft_only / no_released_snapshot / scope_incomplete). They appear ONLY
 *     in <DiagnosticsPanel>, never in the primary table.
 *   - portfolio_summary is computed server-side from fund_rows; the page does
 *     not recompute. NAV reconciliation, IRR weighting, and DSCR provenance
 *     are all server-authored.
 */

import React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus } from "lucide-react";
import {
  deleteRepeFund,
  getAssetMapPoints,
  getFundPortfolioCoherent,
  type AssetMapResponse,
  type CoherentFundRow,
  type CoherentPortfolioPayload,
} from "@/lib/bos-api";
import { FundDeleteDialog } from "@/components/repe/FundDeleteDialog";
import { useMaybeReEnv } from "@/components/repe/workspace/ReEnvProvider";
import { KpiStrip } from "@/components/repe/asset-cockpit/KpiStrip";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { fmtMoney, fmtMultiple, fmtPct } from "@/lib/format-utils";
import { PortfolioAssetMap } from "@/components/repe/portfolio/PortfolioAssetMap";
import FundTrendPanel from "@/components/repe/portfolio/FundTrendPanel";
import DiagnosticsPanel from "@/components/repe/portfolio/DiagnosticsPanel";
import { UnavailableCell } from "@/components/re/UnavailableTile";
import {
  RepeIndexScaffold,
  reIndexNumericCellClass,
  reIndexPrimaryCellClass,
  reIndexTableBodyClass,
  reIndexTableClass,
  reIndexTableHeadRowClass,
  reIndexTableRowClass,
  reIndexTableShellClass,
} from "@/components/repe/RepeIndexScaffold";

function pickCurrentQuarter(): string {
  const now = new Date();
  const q = Math.ceil((now.getUTCMonth() + 1) / 3);
  return `${now.getUTCFullYear()}Q${q}`;
}

function fmtMoneyOrUnavail(v: string | number | undefined | null): string {
  if (v == null) return "Unavailable";
  return fmtMoney(v);
}

function fmtPctOrUnavail(v: string | number | undefined | null): string {
  if (v == null || v === "") return "Unavailable";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "Unavailable";
  return fmtPct(n);
}

function fmtNumOrUnavail(v: string | number | undefined | null, suffix = ""): string {
  if (v == null || v === "") return "Unavailable";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "Unavailable";
  return `${n.toFixed(2)}${suffix}`;
}

const deleteFundActionClass =
  "h-8 w-8 rounded-full border border-bm-border/55 bg-transparent p-0 text-bm-muted2 transition-[transform,colors,box-shadow] duration-[120ms] hover:border-bm-danger/25 hover:bg-bm-danger/8 hover:text-bm-danger";

// ── Component ───────────────────────────────────────────────────────────────

export default function ReFundListPage() {
  // Prefer the workspace-scoped env from ReEnvProvider when present (production path).
  // Fall back to the URL param when the provider was skipped — currently this
  // only happens when PLAYWRIGHT_BYPASS_AUTH=1 (re/layout.tsx skips ReEnvProvider
  // there). The vitest guardrail at re/layout.test.tsx pins this to bypass mode
  // only, so production always takes the provider path.
  const reEnv = useMaybeReEnv();
  const params = useParams<{ envId: string }>();
  const envId = reEnv?.envId ?? params?.envId ?? "";
  const { push } = useToast();
  const [payload, setPayload] = useState<CoherentPortfolioPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<CoherentFundRow | null>(null);
  const [deletingFundId, setDeletingFundId] = useState<string | null>(null);

  const [mapData, setMapData] = useState<AssetMapResponse | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  const quarter = pickCurrentQuarter();

  // ── Data fetch: single coherent payload ──────────────────────────────────
  const refresh = useCallback(async () => {
    if (!envId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setPayload(await getFundPortfolioCoherent(envId, quarter));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Fund portfolio route unavailable");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [envId, quarter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!envId) return;
    setMapLoading(true);
    getAssetMapPoints({ env_id: envId, status: "all" })
      .then(setMapData)
      .catch(() => setMapData(null))
      .finally(() => setMapLoading(false));
  }, [envId]);

  const fundRows = useMemo(() => payload?.fund_rows ?? [], [payload]);
  const summary = payload?.portfolio_summary ?? null;
  const provenance = payload?.provenance ?? null;
  const diagnostics = useMemo(() => payload?.diagnostics ?? [], [payload]);

  // ── Signal bar: derived from server-authored payload ────────────────────
  const signals = useMemo(() => {
    if (!payload) return [];
    const items: { label: string; value: string; tone?: "positive" | "negative" | "neutral" }[] = [];

    // Top NAV driver (already filtered to released/non-quarantined)
    let topNavFund: CoherentFundRow | null = null;
    let topNavVal = 0;
    for (const f of fundRows) {
      const v = f.portfolio_nav ? parseFloat(f.portfolio_nav) : null;
      if (v !== null && !Number.isNaN(v) && v > topNavVal) {
        topNavFund = f;
        topNavVal = v;
      }
    }
    if (topNavFund && topNavVal > 0) {
      items.push({ label: "Top NAV", value: `${topNavFund.name}: ${fmtMoney(topNavVal)}` });
    }

    // IRR range across released funds (≥2)
    const irrValues = fundRows
      .map((f) => (f.gross_irr ? parseFloat(f.gross_irr) : null))
      .filter((v): v is number => v !== null && !Number.isNaN(v));
    if (irrValues.length >= 2) {
      const irrMin = Math.min(...irrValues);
      const irrMax = Math.max(...irrValues);
      items.push({
        label: "IRR Range",
        value: `${fmtPct(irrMin)} – ${fmtPct(irrMax)}`,
      });
    }

    // Data alerts: server-counted excluded funds
    if (diagnostics.length > 0) {
      items.push({
        label: "Data Alerts",
        value: `${diagnostics.length} fund${diagnostics.length === 1 ? "" : "s"} excluded — see diagnostics`,
        tone: "negative",
      });
    }

    return items;
  }, [payload, fundRows, diagnostics]);

  const base = `/lab/env/${envId}/re`;

  const handleDeleteFund = useCallback(async () => {
    if (!deleteTarget) return;
    setDeletingFundId(deleteTarget.fund_id);
    try {
      const result = await deleteRepeFund(deleteTarget.fund_id);
      setDeleteTarget(null);
      void refresh();
      push({
        title: "Fund deleted",
        description: `Removed ${result.deleted.investments} investments and ${result.deleted.assets} assets.`,
        variant: "success",
      });
    } catch (err) {
      push({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete fund.",
        variant: "danger",
      });
    } finally {
      setDeletingFundId(null);
    }
  }, [deleteTarget, push, refresh]);

  // ── Render helper for table cells. fund_rows are already authoritative;
  // null fields render as Unavailable with the carried null_reason.
  function renderMetric(
    fund: CoherentFundRow,
    field: keyof CoherentFundRow,
    formatter: (v: string) => string,
  ) {
    const raw = fund[field];
    if (raw == null) {
      const reason = fund.null_reasons?.[field as string] ?? null;
      return <UnavailableCell nullReason={reason ?? "value_unavailable"} />;
    }
    return <span className="nv-metric">{formatter(String(raw))}</span>;
  }

  function emptyStateCopy() {
    if (loadError) {
      return {
        title: "Fund portfolio unavailable.",
        detail: `Route dependency failed for ${quarter}: ${loadError}`,
        code: "ROUTE_FAILURE",
      };
    }
    const nullReason = summary?.null_reasons?.portfolio;
    if (nullReason === "no_released_authoritative_funds") {
      return {
        title: "No released authoritative fund snapshots for this period.",
        detail: `Required dependency is missing: re_authoritative_fund_state_qtr released rows for ${quarter}.`,
        code: "DATA_DELETED_OR_PERIOD_MISMATCH",
      };
    }
    if (diagnostics.length > 0) {
      return {
        title: "No fund snapshots passed the canonical selector.",
        detail: `${diagnostics.length} fund${diagnostics.length === 1 ? "" : "s"} excluded. See diagnostics for quarantine, archive, release, or scope reasons.`,
        code: "SELECTOR_DIAGNOSTIC",
      };
    }
    return {
      title: "Fund portfolio source data is unavailable.",
      detail: `No canonical fund rows were returned for env ${envId || "unknown"} and ${quarter}. Verify app.env_business_bindings, repe_fund, and released authoritative snapshots before reseeding.`,
      code: "MISSING_DEPENDENCY",
    };
  }

  // ── KPI strip values ────────────────────────────────────────────────────
  const navReconciliation = summary?.nav_reconciliation;
  const irrMethodN = provenance?.irr_method_n_funds ?? 0;
  const irrMethodLabel =
    provenance && provenance.irr_method === "nav_weighted_average" && irrMethodN > 0
      ? `NAV-weighted, n=${irrMethodN}`
      : null;

  return (
    <>
      <RepeIndexScaffold
        title="Fund Portfolio"
        subtitle={`As of ${quarter}`}
        metrics={
          <KpiStrip
            variant="band"
            kpis={[
              {
                label: "Funds",
                value: summary ? String(summary.fund_count) : "—",
                testId: "kpi-fund-count",
              },
              {
                label: "Active Assets",
                value: summary ? String(summary.active_assets) : "—",
              },
              { label: "Total Commitments", value: fmtMoneyOrUnavail(summary?.total_commitments) },
              { label: "Portfolio NAV", value: fmtMoneyOrUnavail(summary?.portfolio_nav) },
              {
                label: "Gross IRR",
                value: fmtPctOrUnavail(summary?.gross_irr),
                hint: irrMethodLabel,
                testId: "kpi-gross-irr",
              },
              {
                label: "Net IRR",
                value: fmtPctOrUnavail(summary?.net_irr),
                hint: irrMethodLabel,
                testId: "kpi-net-irr",
              },
              {
                label: "Wtd DSCR",
                value: summary?.weighted_dscr?.value
                  ? fmtNumOrUnavail(summary.weighted_dscr.value, "x")
                  : "Unavailable",
                hint: summary?.weighted_dscr?.provenance === "legacy_quarter_state" ? "legacy" : null,
              },
            ]}
          />
        }
        className="w-full"
      >
        {/* ── NAV RECONCILIATION STRIP ── */}
        {navReconciliation && summary?.fund_count ? (
          <div
            data-testid="nav-reconciliation"
            data-status={navReconciliation.status}
            className={`flex flex-wrap items-center gap-3 rounded-lg border px-4 py-1.5 text-xs ${
              navReconciliation.status === "reconciled"
                ? "border-emerald-800/40 bg-emerald-950/10 text-emerald-300"
                : "border-red-800/40 bg-red-950/10 text-red-300"
            }`}
          >
            <span className="nv-eyebrow text-[9px]">
              NAV Check
            </span>
            <span className="font-mono">
              Displayed Σ {fmtMoney(parseFloat(navReconciliation.displayed_fund_nav_sum))}
            </span>
            <span className="text-bm-border/40">·</span>
            <span className="font-mono">
              Portfolio NAV {fmtMoney(parseFloat(navReconciliation.portfolio_nav))}
            </span>
            <span className="text-bm-border/40">·</span>
            <span className="font-mono">
              Δ {fmtMoney(parseFloat(navReconciliation.rounding_delta))}
            </span>
            <span className="ml-auto font-medium">
              {navReconciliation.status === "reconciled" ? "✓ Reconciled" : "✗ Drift"}
            </span>
          </div>
        ) : null}

        {/* ── IRR METHOD BADGE ── */}
        {irrMethodLabel ? (
          <div
            data-testid="irr-method-badge"
            className="text-[10px] uppercase tracking-[0.12em] text-bm-muted2 font-mono"
          >
            IRR method: <span className="text-bm-text">{irrMethodLabel}</span>
            {provenance?.mixed_release_states ? (
              <span className="ml-2 text-amber-400/80">
                · mixed snapshot_versions — see provenance
              </span>
            ) : null}
          </div>
        ) : null}

        {/* ── DIAGNOSTICS PANEL ── */}
        <DiagnosticsPanel diagnostics={diagnostics} />

        {/* ── SIGNAL BAR ── */}
        {!loading && signals.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bm-border/20 bg-bm-surface/[0.02] px-4 py-1.5">
            <span className="nv-eyebrow text-[9px] text-bm-muted2">Signals</span>
            {signals.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 text-xs">
                <span className="text-[10px] uppercase tracking-[0.1em] text-bm-muted2">{s.label}:</span>
                <span className={`font-medium ${
                  s.tone === "positive" ? "text-green-400" :
                  s.tone === "negative" ? "text-red-400" :
                  "text-bm-text"
                }`}>{s.value}</span>
                {i < signals.length - 1 && <span className="text-bm-border/40 ml-1.5">|</span>}
              </span>
            ))}
          </div>
        )}

        {/* ── FUND TREND + ASSET MAP ── */}
        {!loading && fundRows.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-stretch">
            <div className="order-1 min-w-0 lg:order-2">
              <FundTrendPanel envId={envId} quarters={12} />
            </div>
            <div className="order-2 min-w-0 lg:order-1">
              <PortfolioAssetMap data={mapData} loading={mapLoading} />
            </div>
          </div>
        )}

        <section data-testid="re-fund-list">
          {loading ? (
            <div className="flex items-center justify-center rounded-xl border border-bm-border/70 py-14 text-sm text-bm-muted2">
              Loading funds...
            </div>
          ) : fundRows.length === 0 ? (
            <div
              className="rounded-xl border border-bm-border/70 bg-bm-surface/10 p-8 text-center"
              data-testid="fund-portfolio-empty-diagnostic"
              data-reason-code={emptyStateCopy().code}
            >
              <p className="text-sm text-bm-muted2">
                {emptyStateCopy().title}
              </p>
              {diagnostics.length > 0 ? (
                <p className="mt-2 text-xs text-amber-400/80">
                  {diagnostics.length} fund{diagnostics.length === 1 ? "" : "s"} excluded
                  — see diagnostics panel above for reasons.
                </p>
              ) : (
                <Link href={`${base}/operator-diagnostics?quarter=${quarter}`} className="mt-3 inline-flex text-sm text-bm-accent hover:text-bm-text">
                  Verify re_authoritative_fund_state_qtr source data
                </Link>
              )}
            </div>
          ) : (
            <div className={reIndexTableShellClass}>
              <table className={`${reIndexTableClass} min-w-[1320px]`}>
                <thead>
                  <tr className={reIndexTableHeadRowClass}>
                    <th className="nv-table-header px-4 py-3">Fund Name</th>
                    <th className="nv-table-header px-4 py-3">Strategy</th>
                    <th className="nv-table-header px-4 py-3">Vintage</th>
                    <th className="nv-table-header px-4 py-3 text-right">Commitments</th>
                    <th className="nv-table-header px-4 py-3 text-right">NAV</th>
                    <th className="nv-table-header px-4 py-3 text-right">Gross IRR</th>
                    <th className="nv-table-header px-4 py-3 text-right">Net IRR</th>
                    <th className="nv-table-header px-4 py-3 text-right">DPI</th>
                    <th className="nv-table-header px-4 py-3 text-right">TVPI</th>
                    <th className="nv-table-header px-4 py-3 text-right">% Invested</th>
                    <th className="nv-table-header px-4 py-3">Status</th>
                    <th className="nv-table-header px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={reIndexTableBodyClass}>
                  {fundRows.map((fund) => {
                    const committed = fund.total_committed ? parseFloat(fund.total_committed) : null;
                    const called = fund.total_called ? parseFloat(fund.total_called) : null;
                    const pctInvested =
                      committed && called && committed > 0 ? called / committed : null;
                    return (
                      <tr
                        key={fund.fund_id}
                        className={reIndexTableRowClass}
                        data-testid="fund-table-row"
                        data-fund-id={fund.fund_id}
                      >
                        <td className="nv-table-cell px-3 py-3 align-middle">
                          <Link href={`${base}/funds/${fund.fund_id}`} className={reIndexPrimaryCellClass}>
                            {fund.name}
                          </Link>
                        </td>
                        <td className="nv-table-cell px-3 py-3 align-middle uppercase tracking-[0.04em] text-bm-muted2">
                          {fund.strategy?.toUpperCase() ?? "—"}
                        </td>
                        <td className="nv-table-cell px-3 py-3 align-middle tracking-[0.04em] text-bm-muted2">
                          {fund.vintage_year ?? "—"}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {renderMetric(fund, "total_committed", (v) => fmtMoney(v))}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {fund.portfolio_nav ? (
                            <Link
                              href={`${base}/funds/${fund.fund_id}/trace/nav?quarter=${encodeURIComponent(quarter)}`}
                              className="nv-metric underline-offset-2 hover:underline"
                              data-testid={`nav-trace-link-${fund.fund_id}`}
                            >
                              {renderMetric(fund, "portfolio_nav", (v) => fmtMoney(v))}
                            </Link>
                          ) : (
                            renderMetric(fund, "portfolio_nav", (v) => fmtMoney(v))
                          )}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {fund.gross_irr && fund.gross_irr_traceable ? (
                            <Link
                              href={`${base}/funds/${fund.fund_id}/trace/gross_irr?quarter=${encodeURIComponent(quarter)}`}
                              className="nv-metric underline-offset-2 hover:underline"
                              data-testid={`irr-trace-link-${fund.fund_id}`}
                            >
                              {renderMetric(fund, "gross_irr", (v) => fmtPct(parseFloat(v)))}
                            </Link>
                          ) : fund.gross_irr ? (
                            <span
                              className="nv-metric cursor-not-allowed text-bm-muted2"
                              title="Lineage unavailable — snapshot cf_series_hash is missing or mismatched."
                              data-testid={`irr-trace-disabled-${fund.fund_id}`}
                            >
                              {renderMetric(fund, "gross_irr", (v) => fmtPct(parseFloat(v)))}
                            </span>
                          ) : (
                            renderMetric(fund, "gross_irr", (v) => fmtPct(parseFloat(v)))
                          )}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {renderMetric(fund, "net_irr", (v) => fmtPct(parseFloat(v)))}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {renderMetric(fund, "dpi", (v) => fmtMultiple(v))}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {renderMetric(fund, "tvpi", (v) => fmtMultiple(v))}
                        </td>
                        <td className={`px-3 py-3 align-middle ${reIndexNumericCellClass}`}>
                          {pctInvested != null ? `${(pctInvested * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="nv-table-cell px-3 py-3 align-middle">
                          <span className="inline-flex rounded-full border border-bm-border/60 bg-bm-surface/18 px-2.5 py-1 text-[11px] capitalize text-bm-muted2">
                            {fund.status ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right align-middle">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={deleteFundActionClass}
                            onClick={() => setDeleteTarget(fund)}
                            data-testid={`delete-fund-${fund.fund_id}`}
                            aria-label={`Delete ${fund.name}`}
                            title={`Delete ${fund.name}`}
                          >
                            <Minus aria-hidden="true" size={14} strokeWidth={2.1} />
                            <span className="sr-only">Delete {fund.name}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </RepeIndexScaffold>
      <FundDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        fundName={deleteTarget?.name || ""}
        deleting={deleteTarget ? deletingFundId === deleteTarget.fund_id : false}
        onConfirm={handleDeleteFund}
      />
    </>
  );
}
