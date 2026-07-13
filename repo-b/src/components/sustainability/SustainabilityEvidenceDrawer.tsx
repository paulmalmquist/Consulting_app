"use client";

import { useEffect, useState } from "react";
import {
  getSusAuthoritativeMetricEvidence,
  type SusAuthoritativeEvidenceItem,
  type SusAuthoritativeMetricItem,
  type SusAuthoritativeQueryParams,
} from "@/lib/bos-api";
import {
  DrawerWrapper,
  DrawerHeader,
  FieldRow,
} from "@/components/telemetry/drawerPrimitives";
import { C } from "@/components/telemetry/primitives";

// Governed fields the workspace already holds on the reader payload. Passed in
// rather than refetched — the drawer is an inspector, not a second source of truth.
export type SustainabilityDrawerGovernance = {
  snapshot_version: string | null;
  promotion_state: string | null;
  trust_status: string | null;
  period_exact: boolean | null;
};

export type SustainabilityEvidenceDrawerProps = {
  open: boolean;
  onClose: () => void;
  metric: SusAuthoritativeMetricItem | null;
  governance: SustainabilityDrawerGovernance;
  query: SusAuthoritativeQueryParams;
  metricLabel?: string;
};

type FetchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; rows: SusAuthoritativeEvidenceItem[] }
  | { kind: "error"; message: string };

function formatValue(item: SusAuthoritativeMetricItem): string | null {
  // Fail-closed: a null value returns null. The drawer surfaces null_reason
  // instead of substituting 0 or a dash-as-value.
  if (item.value === null || item.value === undefined) return null;
  const rendered = Number.isFinite(item.value)
    ? item.value.toLocaleString()
    : String(item.value);
  return item.unit ? `${rendered} ${item.unit}` : rendered;
}

export default function SustainabilityEvidenceDrawer({
  open,
  onClose,
  metric,
  governance,
  query,
  metricLabel,
}: SustainabilityEvidenceDrawerProps) {
  const [fetchState, setFetchState] = useState<FetchState>({ kind: "idle" });

  useEffect(() => {
    if (!open || !metric) {
      setFetchState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    setFetchState({ kind: "loading" });
    getSusAuthoritativeMetricEvidence(metric.metric_key, query)
      .then((res) => {
        if (cancelled) return;
        setFetchState({ kind: "ok", rows: res.evidence ?? [] });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setFetchState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [open, metric, query]);

  if (!metric) {
    return (
      <DrawerWrapper open={open} onClose={onClose}>
        <DrawerHeader title="Metric evidence" description="No metric selected." />
      </DrawerWrapper>
    );
  }

  const title = metricLabel ?? metric.metric_key;
  const formatted = formatValue(metric);
  const isNull = formatted === null;
  const nullReason = metric.null_reason ?? "unavailable";

  return (
    <DrawerWrapper open={open} onClose={onClose}>
      <DrawerHeader
        title={title}
        description={`metric_key: ${metric.metric_key}`}
      />

      {/* Section (a) — value and its standing */}
      <section
        data-testid="sus-evidence-standing"
        style={{ marginTop: 16 }}
      >
        <SectionHeading>Value and standing</SectionHeading>
        {isNull ? (
          <div
            data-testid="sus-evidence-null-reason"
            style={{
              fontFamily: C.mono,
              fontSize: 11,
              color: C.dim,
              padding: "8px 0",
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            null_reason: {nullReason}
          </div>
        ) : (
          <FieldRow label="Value" value={formatted} />
        )}
        <FieldRow label="Unit" value={metric.unit} />
        <FieldRow label="Trust" value={governance.trust_status} />
        <FieldRow label="Promotion" value={governance.promotion_state} />
        <FieldRow
          label="Period exact"
          value={
            governance.period_exact === null
              ? null
              : governance.period_exact
                ? "true"
                : "false"
          }
        />
      </section>

      {/* Section (b) — the snapshot the value was read from */}
      <section data-testid="sus-evidence-snapshot" style={{ marginTop: 16 }}>
        <SectionHeading>Snapshot</SectionHeading>
        <FieldRow label="Snapshot version" value={governance.snapshot_version} />
      </section>

      {/* Section (c) — evidence rows */}
      <section data-testid="sus-evidence-rows" style={{ marginTop: 16 }}>
        <SectionHeading>Evidence rows</SectionHeading>
        <EvidenceBody state={fetchState} />
      </section>
    </DrawerWrapper>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: C.faint,
        fontFamily: C.mono,
        fontSize: 9,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function EvidenceBody({ state }: { state: FetchState }) {
  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div
        data-testid="sus-evidence-loading"
        style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, padding: "8px 0" }}
      >
        Loading evidence…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div
        data-testid="sus-evidence-error"
        style={{
          fontFamily: C.mono,
          fontSize: 11,
          color: C.dim,
          padding: "8px 0",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        Could not load evidence rows: {state.message}
      </div>
    );
  }
  if (state.rows.length === 0) {
    return (
      <div
        data-testid="sus-evidence-empty"
        style={{
          fontFamily: C.mono,
          fontSize: 11,
          color: C.dim,
          padding: "8px 0",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        No evidence rows for this metric.
      </div>
    );
  }
  return (
    <div>
      {state.rows.map((row, idx) => (
        <div
          key={`${row.source_table ?? "src"}-${row.source_row_ref ?? idx}`}
          data-testid="sus-evidence-row"
          style={{
            padding: "8px 0",
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <FieldRow label="Source table" value={row.source_table} />
          <FieldRow label="Source row" value={row.source_row_ref} />
          <FieldRow label="Emission factor set" value={row.emission_factor_set_id} />
          <FieldRow label="Ingestion run" value={row.ingestion_run_id} />
          <FieldRow label="Formula" value={row.formula_id} />
        </div>
      ))}
    </div>
  );
}
