"use client";

import { useEffect, useState } from "react";
import {
  getSusAuthoritativeOverview,
  type SusAuthoritativeStateResponse,
  type SusAuthoritativeMetricItem,
  type SusAuthoritativeQueryParams,
} from "@/lib/bos-api";
import { MetricCard } from "@/components/ui/MetricCard";
import { StateCard } from "@/components/ui/StateCard";

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

function MetricTile({ item }: { item: SusAuthoritativeMetricItem }) {
  const label = METRIC_LABELS[item.metric_key] ?? item.metric_key;
  if (item.value === null || item.value === undefined) {
    const reason = item.null_reason ?? "unavailable";
    return (
      <div
        data-testid={`bos-sus-metric-null-${item.metric_key}`}
        className="rounded-xl border border-bm-warning/30 bg-bm-warning/8 p-4"
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted2">
          {label}
        </p>
        <p className="mt-2 font-mono text-xs text-bm-warning" data-testid={`bos-sus-metric-null-reason-${item.metric_key}`}>
          null_reason: {reason}
        </p>
        {item.trust_status && (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted2">
            trust: {item.trust_status}
          </p>
        )}
      </div>
    );
  }
  return (
    <div
      data-testid={`bos-sus-metric-${item.metric_key}`}
      className="rounded-xl border border-bm-border/50 bg-bm-surface/20 p-4"
    >
      <MetricCard label={label} value={formatMetricValue(item)} />
      {item.trust_status && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-bm-muted2">
          trust: {item.trust_status}
        </p>
      )}
    </div>
  );
}

export default function BosSustainabilityWorkspace({
  query,
}: BosSustainabilityWorkspaceProps = {}) {
  const [state, setState] = useState<SusAuthoritativeStateResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Sustainability
          </h1>
          <p className="text-sm text-bm-muted2">
            Governed sustainability metrics. Every value comes from an authoritative snapshot; missing values render their null_reason.
          </p>
        </header>

        {loading && <StateCard state="loading" />}

        {!loading && error && (
          <StateCard
            state="error"
            title="Could not load authoritative sustainability state"
            message={error}
          />
        )}

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
                      <MetricTile key={m.metric_key} item={m} />
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
