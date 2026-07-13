"use client";

import { useEffect, useState } from "react";
import {
  getSusAuthoritativeOverview,
  getSusAuthoritativeReport,
  type SusAuthoritativeStateResponse,
  type SusAuthoritativeMetricItem,
  type SusAuthoritativeQueryParams,
  type SusAuthoritativeReportResponse,
} from "@/lib/bos-api";
import { MetricCard } from "@/components/ui/MetricCard";
import { StateCard } from "@/components/ui/StateCard";
import SustainabilityEvidenceDrawer from "@/components/sustainability/SustainabilityEvidenceDrawer";

const METRIC_LABELS: Record<string, string> = {
  scope1_tco2e: "Scope 1 (tCO2e)",
  scope2_location_tco2e: "Scope 2 Location (tCO2e)",
  scope2_market_tco2e: "Scope 2 Market (tCO2e)",
  scope3_tco2e: "Scope 3 (tCO2e)",
  energy_intensity_kwh_per_sqft: "Energy Intensity (kWh/sqft)",
  water_intensity_gal_per_sqft: "Water Intensity (gal/sqft)",
};

const DEFAULT_QUERY: SusAuthoritativeQueryParams = {
  business_id: "demo",
  env_id: "sustainability-demo",
  entity_scope: "portfolio",
  period_key: "2026Q1",
  metric_family: "ghg",
};

export type BosSustainabilityWorkspaceProps = {
  query?: Partial<SusAuthoritativeQueryParams>;
};

function formatMetricValue(item: SusAuthoritativeMetricItem): string {
  const { value, unit } = item;
  if (value === null || value === undefined) {
    return "";
  }
  const rendered = Number.isFinite(value) ? value.toLocaleString() : String(value);
  return unit ? `${rendered} ${unit}` : rendered;
}

function GovernanceHeader({ state }: { state: SusAuthoritativeStateResponse }) {
  const promotion = state.promotion_state ?? "unknown";
  const trust = state.trust_status ?? "unknown";
  const snapshot = state.snapshot_version ?? "—";
  const notReleased = state.promotion_state !== "released";
  const notTrusted = state.trust_status !== "trusted";
  const warn = notReleased || notTrusted;
  return (
    <div
      data-testid="bos-sus-governance-header"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-bm-border/50 bg-bm-surface/20 px-4 py-3 text-sm"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
        Snapshot
      </span>
      <span data-testid="bos-sus-snapshot-version" className="font-mono text-bm-text">
        {snapshot}
      </span>
      <span
        data-testid="bos-sus-promotion-state"
        className={
          notReleased
            ? "rounded-full border border-bm-warning/40 bg-bm-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-warning"
            : "rounded-full border border-bm-border/40 bg-bm-surface2/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted"
        }
      >
        promotion: {promotion}
      </span>
      <span
        data-testid="bos-sus-trust-status"
        className={
          notTrusted
            ? "rounded-full border border-bm-warning/40 bg-bm-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-warning"
            : "rounded-full border border-bm-success/40 bg-bm-success/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-success"
        }
      >
        trust: {trust}
      </span>
      {state.period_exact === false && (
        <span
          data-testid="bos-sus-period-inexact"
          className="rounded-full border border-bm-warning/40 bg-bm-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-warning"
        >
          period: not exact
        </span>
      )}
      {warn && (
        <span className="text-xs text-bm-warning">
          Snapshot is not released/trusted — displayed values are marked, not silently shown as authoritative.
        </span>
      )}
    </div>
  );
}

function MetricTile({
  item,
  onOpen,
}: {
  item: SusAuthoritativeMetricItem;
  onOpen: (item: SusAuthoritativeMetricItem) => void;
}) {
  const label = METRIC_LABELS[item.metric_key] ?? item.metric_key;
  const isNull = item.value === null || item.value === undefined;
  const testId = isNull
    ? `bos-sus-metric-null-${item.metric_key}`
    : `bos-sus-metric-${item.metric_key}`;
  const className = isNull
    ? "w-full text-left rounded-xl border border-bm-warning/30 bg-bm-warning/8 p-4 hover:border-bm-warning/60 focus:outline-none focus:ring-2 focus:ring-bm-warning/40"
    : "w-full text-left rounded-xl border border-bm-border/50 bg-bm-surface/20 p-4 hover:border-bm-border focus:outline-none focus:ring-2 focus:ring-bm-border";
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={() => onOpen(item)}
      className={className}
    >
      {isNull ? (
        <>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
            {label}
          </p>
          <p
            className="mt-2 font-mono text-xs text-bm-warning"
            data-testid={`bos-sus-metric-null-reason-${item.metric_key}`}
          >
            null_reason: {item.null_reason ?? "unavailable"}
          </p>
          {item.trust_status && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted2">
              trust: {item.trust_status}
            </p>
          )}
        </>
      ) : (
        <>
          <MetricCard label={label} value={formatMetricValue(item)} />
          {item.trust_status && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted2">
              trust: {item.trust_status}
            </p>
          )}
        </>
      )}
    </button>
  );
}

function ReportView({
  report,
}: {
  report: SusAuthoritativeReportResponse;
}) {
  const snapshot = report.snapshot_version ?? "—";
  const promotion = report.promotion_state ?? "unknown";
  const trust = report.trust_status ?? "unknown";
  if (report.null_reason === "snapshot_unavailable") {
    return (
      <div
        data-testid="bos-sus-report-unavailable"
        className="rounded-xl border border-bm-warning/40 bg-bm-warning/10 p-6"
      >
        <h3 className="text-base font-display font-semibold text-bm-text">
          Report unavailable
        </h3>
        <p className="mt-1 text-sm text-bm-warning">
          null_reason: {report.null_reason}
        </p>
        <p className="mt-2 text-xs text-bm-muted2">
          The governed reader reports no released snapshot for this scope. The
          report shows no totals; nothing is substituted.
        </p>
      </div>
    );
  }
  return (
    <div
      data-testid="bos-sus-report-view"
      className="flex flex-col gap-3 rounded-xl border border-bm-border/50 bg-bm-surface/20 p-6"
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-bm-muted2">
          Report snapshot
        </span>
        <span
          data-testid="bos-sus-report-snapshot-version"
          className="font-mono text-bm-text"
        >
          {snapshot}
        </span>
        <span
          data-testid="bos-sus-report-promotion-state"
          className="rounded-full border border-bm-border/40 bg-bm-surface2/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted"
        >
          promotion: {promotion}
        </span>
        <span
          data-testid="bos-sus-report-trust-status"
          className="rounded-full border border-bm-border/40 bg-bm-surface2/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted"
        >
          trust: {trust}
        </span>
      </div>
      <ul
        data-testid="bos-sus-report-metric-list"
        className="flex flex-col divide-y divide-bm-border/40"
      >
        {report.metrics.map((m) => {
          const label = METRIC_LABELS[m.metric_key] ?? m.metric_key;
          const isNull = m.value === null || m.value === undefined;
          return (
            <li
              key={m.metric_key}
              data-testid={`bos-sus-report-metric-${m.metric_key}`}
              className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
            >
              <span className="text-bm-muted2">{label}</span>
              {isNull ? (
                <span
                  data-testid={`bos-sus-report-metric-null-reason-${m.metric_key}`}
                  className="font-mono text-xs text-bm-warning"
                >
                  null_reason: {m.null_reason ?? "unavailable"}
                </span>
              ) : (
                <span className="font-mono text-bm-text">
                  {formatMetricValue(m)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function BosSustainabilityWorkspace({
  query,
}: BosSustainabilityWorkspaceProps = {}) {
  const [state, setState] = useState<SusAuthoritativeStateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openMetric, setOpenMetric] = useState<SusAuthoritativeMetricItem | null>(null);
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [report, setReport] = useState<SusAuthoritativeReportResponse | null>(null);
  const [reportLoading, setReportLoading] = useState<boolean>(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const resolvedQuery: SusAuthoritativeQueryParams = { ...DEFAULT_QUERY, ...(query ?? {}) };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSusAuthoritativeOverview(resolvedQuery)
      .then((res) => {
        if (cancelled) return;
        setState(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolvedQuery.business_id,
    resolvedQuery.env_id,
    resolvedQuery.entity_scope,
    resolvedQuery.period_key,
    resolvedQuery.metric_family,
    resolvedQuery.snapshot_version,
  ]);

  return (
    <div className="min-h-screen w-full bg-bm-bg text-bm-text">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                Sustainability
              </h1>
              <p className="text-sm text-bm-muted2">
                Governed sustainability metrics. Every value comes from an authoritative snapshot; missing values render their null_reason.
              </p>
            </div>
            <button
              type="button"
              data-testid="bos-sus-open-report"
              onClick={() => {
                setReportOpen(true);
                setReportError(null);
                setReportLoading(true);
                setReport(null);
                getSusAuthoritativeReport(resolvedQuery)
                  .then((res) => {
                    setReport(res);
                  })
                  .catch((err: unknown) => {
                    setReportError(err instanceof Error ? err.message : String(err));
                  })
                  .finally(() => setReportLoading(false));
              }}
              className="rounded-lg border border-bm-border/50 bg-bm-surface2/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-bm-text hover:border-bm-border"
            >
              Report
            </button>
          </div>
        </header>

        {reportOpen && (
          <section
            data-testid="bos-sus-report-section"
            className="flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                Governed report
              </h2>
              <button
                type="button"
                data-testid="bos-sus-close-report"
                onClick={() => setReportOpen(false)}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2 hover:text-bm-text"
              >
                Close
              </button>
            </div>
            {reportLoading && <StateCard state="loading" />}
            {!reportLoading && reportError && (
              <StateCard
                state="error"
                title="Could not load governed report"
                message={reportError}
              />
            )}
            {!reportLoading && !reportError && report && <ReportView report={report} />}
          </section>
        )}

        {loading && <StateCard state="loading" />}

        {!loading && error && (
          <StateCard
            state="error"
            title="Could not load authoritative sustainability state"
            message={error}
          />
        )}

        <SustainabilityEvidenceDrawer
          open={openMetric !== null}
          onClose={() => setOpenMetric(null)}
          metric={openMetric}
          governance={{
            snapshot_version: state?.snapshot_version ?? null,
            promotion_state: state?.promotion_state ?? null,
            trust_status: state?.trust_status ?? null,
            period_exact: state?.period_exact ?? null,
          }}
          query={resolvedQuery}
          metricLabel={openMetric ? METRIC_LABELS[openMetric.metric_key] ?? openMetric.metric_key : undefined}
        />

        {!loading && !error && state && (
          <>
            {state.null_reason === "snapshot_unavailable" ? (
              <div
                data-testid="bos-sus-snapshot-unavailable"
                className="rounded-xl border border-bm-warning/40 bg-bm-warning/10 p-6"
              >
                <h2 className="text-base font-display font-semibold text-bm-text">
                  Snapshot unavailable
                </h2>
                <p className="mt-1 text-sm text-bm-warning">
                  null_reason: {state.null_reason}
                </p>
                <p className="mt-2 text-xs text-bm-muted2">
                  No released, trusted authoritative snapshot exists for
                  scope <span className="font-mono">{resolvedQuery.entity_scope}</span> at
                  period <span className="font-mono">{resolvedQuery.period_key}</span> for
                  metric family <span className="font-mono">{resolvedQuery.metric_family}</span>.
                  The governed reader fails closed; nothing is substituted.
                </p>
              </div>
            ) : (
              <>
                <GovernanceHeader state={state} />
                {state.metrics.length === 0 ? (
                  <div
                    data-testid="bos-sus-no-metrics"
                    className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-6 text-sm text-bm-muted2"
                  >
                    No governed metrics returned for this scope. null_reason:{" "}
                    <span className="font-mono">{state.null_reason ?? "unspecified"}</span>
                  </div>
                ) : (
                  <div
                    data-testid="bos-sus-metric-grid"
                    className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    {state.metrics.map((m) => (
                      <MetricTile key={m.metric_key} item={m} onOpen={setOpenMetric} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
