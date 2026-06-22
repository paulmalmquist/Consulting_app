"use client";

import { useEffect, useState } from "react";
import { getRuns, type TestRun, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, PageHeading, DisclosureFooter, ResponsiveSwap, RowCard } from "./primitives";

export default function RunsExplorer() {
  const [runs, setRuns] = useState<TestRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRuns(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID).then(setRuns).catch((e) => setError(String(e)));
  }, []);

  const heading = <PageHeading eyebrow="Test Run Explorer" title="Ingested test runs"
    blurb="Every run ingested into the lakehouse and exposed to the serving layer: SMAP/MSL anomaly channels (go/no-go) and C-MAPSS RUL units, with dataset, unit/channel, and row counts." />;
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!runs) return <>{heading}<Loading label="Loading test runs…" /></>;

  const grid = "1.8fr 1fr 1.1fr 0.7fr 0.8fr";
  return (
    <>
      {heading}
      <Panel title="Ingested test runs" right={<Tag color={C.cyan}>{runs.length} runs</Tag>}>
        <ResponsiveSwap
          mobile={
            <div style={{ maxHeight: 560, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {runs.map((r) => (
                <RowCard key={r.id} title={r.run_key}
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
                  <div key={r.id} style={{ display: "grid", gridTemplateColumns: grid, gap: 8, alignItems: "center",
                    fontFamily: C.mono, fontSize: 12, color: C.text, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.run_key}</span>
                    <span style={{ color: C.dim }}>{r.dataset}</span>
                    <span style={{ color: C.dim }}>{r.unit_or_channel}{r.spacecraft ? ` · ${r.spacecraft}` : ""}</span>
                    <span>{r.row_count.toLocaleString()}</span>
                    <span><Tag color={C.green}>{r.status}</Tag></span>
                  </div>
                ))}
              </div>
            </>
          } />
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, marginTop: 12 }}>
          Runs served from the Supabase serving layer (tel_test_runs). Row counts are the real ingested
          window counts from Databricks Gold.
        </div>
      </Panel>
      <DisclosureFooter />
    </>
  );
}
