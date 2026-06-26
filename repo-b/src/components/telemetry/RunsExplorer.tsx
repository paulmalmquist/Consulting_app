"use client";

import { useEffect, useState } from "react";
import { getRuns, type TestRun, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, DisclosureFooter, ResponsiveSwap, RowCard } from "./primitives";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { MetricInspectorDrawer } from "./drawerPrimitives";
import { ExportToCsvButton } from "./drill";

// CSV/drill row grain = exactly the ingested test-run fields (no fabricated run-link/model columns).
const RUN_COLS = ["id", "run_key", "dataset", "unit_or_channel", "spacecraft", "row_count", "status", "ingest_at", "created_at"];
function runRows(runs: TestRun[]): Array<Record<string, unknown>> {
  return runs.map((r) => ({
    id: r.id, run_key: r.run_key, dataset: r.dataset, unit_or_channel: r.unit_or_channel,
    spacecraft: r.spacecraft ?? "", row_count: r.row_count, status: r.status,
    ingest_at: r.ingest_at ?? "", created_at: r.created_at,
  }));
}

export default function RunsExplorer() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drillRun, setDrillRun] = useState<TestRun | null>(null);

  useEffect(() => {
    getRuns(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID).then(setRuns).catch((e) => setError(String(e)));
  }, []);

  const heading = <TelemetryPageHeader variant="compact" eyebrow="Test Run Explorer" title="Ingested test runs"
    description="Every run ingested into the lakehouse and exposed to the serving layer: SMAP/MSL anomaly channels (go/no-go) and C-MAPSS RUL units, with dataset, unit/channel, and row counts." />;
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!runs) return <>{heading}<Loading label="Loading test runs…" /></>;

  const grid = "1.8fr 1fr 1.1fr 0.7fr 0.8fr";
  return (
    <>
      {heading}
      <Panel title="Ingested test runs"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Tag color={C.cyan}>live rows · tel_test_runs</Tag>
            <Tag color={C.dim}>{runs.length} runs</Tag>
            <ExportToCsvButton filename="telemetry_test_runs" columns={RUN_COLS} rows={runRows(runs)}
              label="Export CSV" disabled={runs.length === 0} disabledReason="No runs ingested" />
          </div>
        }>
        <ResponsiveSwap
          mobile={
            <div style={{ maxHeight: 560, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {runs.map((r) => (
                <RowCard key={r.id} title={r.run_key} onClick={() => setDrillRun(r)}
                  tags={<><Tag color={C.dim}>{r.dataset}</Tag><Tag color={C.green}>{r.status}</Tag></>}
                  fields={[
                    { label: "Unit / craft", value: `${r.unit_or_channel}${r.spacecraft ? ` · ${r.spacecraft}` : ""}` },
                    { label: "Rows", value: r.row_count.toLocaleString() },
                  ]} />
              ))}
            </div>
          }
          desktop={
            <>
              <div style={{ display: "grid", gridTemplateColumns: grid, gap: 8, fontFamily: C.mono, fontSize: 10,
                color: C.faint, letterSpacing: "0.08em", textTransform: "uppercase", paddingBottom: 8 }}>
                <span>Run</span><span>Dataset</span><span>Unit / craft</span><span>Rows</span><span>Status</span>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, maxHeight: 560, overflowY: "auto" }}>
                {runs.map((r) => (
                  <button key={r.id} type="button" onClick={() => setDrillRun(r)}
                    aria-label={`Inspect run ${r.run_key}`}
                    style={{ display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "center", width: "100%",
                      textAlign: "left", cursor: "pointer", background: "transparent", border: "none",
                      borderBottom: `1px solid ${C.border}`,
                      fontFamily: C.mono, fontSize: 12, color: C.text, padding: "8px 0" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.run_key}</span>
                    <span style={{ color: C.dim }}>{r.dataset}</span>
                    <span style={{ color: C.dim }}>{r.unit_or_channel}{r.spacecraft ? ` · ${r.spacecraft}` : ""}</span>
                    <span>{r.row_count.toLocaleString()}</span>
                    <span><Tag color={C.green}>{r.status}</Tag></span>
                  </button>
                ))}
              </div>
            </>
          } />
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 12 }}>
          Runs served from the Supabase serving layer (tel_test_runs). Row counts are the real ingested
          window counts from Databricks Gold. Click a run to inspect its fields and export.
        </div>
      </Panel>

      <MetricInspectorDrawer
        open={drillRun !== null}
        onClose={() => setDrillRun(null)}
        title={drillRun ? drillRun.run_key : "Test run"}
        description="One ingested test run from the serving layer (tel_test_runs). This is a data-ingest run — model/training run identifiers (MLflow, Databricks, model + evidence artifacts) are not carried on this grain and fail-closed below, never fabricated."
        fields={drillRun ? [
          { label: "Run id", value: drillRun.id },
          { label: "Run key", value: drillRun.run_key },
          { label: "Dataset", value: drillRun.dataset },
          { label: "Unit / channel", value: drillRun.unit_or_channel },
          { label: "Spacecraft", value: drillRun.spacecraft },
          { label: "Row count", value: drillRun.row_count.toLocaleString() },
          { label: "Status", value: drillRun.status },
          { label: "Ingested at", value: drillRun.ingest_at },
          { label: "Created at", value: drillRun.created_at },
          { label: "Run type / model kind", value: null },
          { label: "MLflow / Databricks run", value: null },
          { label: "Model / evidence artifact", value: null },
        ] : []}
      >
        {drillRun && (
          <div style={{ marginTop: 12, fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.55 }}>
            null_reason: run-type, model kind, MLflow/Databricks run, and model/evidence artifact are not on
            the ingest-run grain (tel_test_runs records the ingested window, not a training/scoring run). The
            run_key above is the copyable identifier; no run URL is fabricated.
          </div>
        )}
      </MetricInspectorDrawer>

      <DisclosureFooter />
    </>
  );
}
