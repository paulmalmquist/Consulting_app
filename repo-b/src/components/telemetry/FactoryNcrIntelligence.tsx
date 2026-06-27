"use client";

// RS Demo PR 3 — Factory & NCR Intelligence, ported from rs_jsx/FactoryNcrIntelligence.jsx onto
// rsTokens with REAL pipeline data. Every coordinate on the scatter is the model's actual UMAP
// output (the template's render-time mulberry32 jitter is deliberately gone); cluster labels,
// keywords, exemplars, trends, pareto, and the backlog forecast all come from the mirrored
// Databricks run, with provenance labeled in the header. Fail-closed: data_not_ingested renders an
// explicit empty state, never a seeded-looking dashboard.
import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, ComposedChart, Bar, Line, Area,
  XAxis, YAxis, ReferenceLine, Cell,
} from "recharts";

import { SplitGrid, StatGrid } from "./primitives";
import { RS, RS_MONO, RS_SANS, RsPanel, RsChip, RsKpi } from "./rsTokens";
import { TelemetryPageHeader } from "./TelemetryPageHeader";
import { ExportToCsvButton, DatabricksRunLink, SOURCE_KIND_TAG } from "./drill";
import { MetricInspectorDrawer } from "./drawerPrimitives";
import {
  getNcr, TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID,
  type NcrResponse, type NcrCluster, type NcrBacklogRow,
} from "@/lib/telemetry/api";

// ── drill/export row builders (the displayed grain, no fabricated fields) ───────────────────────
const CLUSTER_COLS = ["cluster_id", "label", "status", "n_records", "median_ttc_days", "reopen_rate", "keywords", "mlflow_run_id", "provenance"];
function clusterRows(clusters: NcrCluster[]): Array<Record<string, unknown>> {
  return clusters.map((c) => ({
    cluster_id: c.cluster_id, label: c.label, status: c.status, n_records: c.n_records,
    median_ttc_days: c.median_ttc_days, reopen_rate: c.reopen_rate,
    keywords: c.keywords.join("|"), mlflow_run_id: c.mlflow_run_id ?? "", provenance: c.provenance,
  }));
}
const EXEMPLAR_COLS = ["ncr_key", "severity", "workcell", "summary", "cluster_id", "cluster_label", "cluster_status"];
function exemplarRows(c: NcrCluster, exemplars: NcrCluster["exemplars"]): Array<Record<string, unknown>> {
  return exemplars.map((e) => ({
    ncr_key: e.ncr_key, severity: e.severity, workcell: e.workcell, summary: e.summary,
    cluster_id: c.cluster_id, cluster_label: c.label, cluster_status: c.status,
  }));
}

// Stable cluster color assignment: clusters arrive ordered by size (largest first).
const CLUSTER_COLORS = [RS.red, RS.amber, RS.blue, RS.teal, RS.violet, RS.green, RS.cyan];
export function clusterColor(index: number): string {
  return CLUSTER_COLORS[index % CLUSTER_COLORS.length];
}

export interface BacklogChartRow {
  w: string;
  opened: number | null;
  closed: number | null;
  backlog: number | null;
  fc: number | null;
  lo: number | null;
  coneH: number | null;            // hi - lo, stacked on lo to draw the band
}

// Pure: trailing history + forecast -> one recharts series with the stacked-area cone trick and a
// bridge row so the forecast line starts at the last actual. Exported for unit tests.
export function assembleBacklogSeries(
  history: NcrBacklogRow[], forecast: NcrBacklogRow[], trailingWeeks = 8,
): BacklogChartRow[] {
  const tail = history.slice(-trailingWeeks);
  if (tail.length === 0) return [];
  const rows: BacklogChartRow[] = tail.map((r, i) => ({
    w: `W-${tail.length - i}`,
    opened: r.opened, closed: r.closed, backlog: r.backlog,
    fc: null, lo: null, coneH: null,
  }));
  const last = tail[tail.length - 1];
  rows[rows.length - 1] = {
    w: "W-1", opened: null, closed: null, backlog: last.backlog,
    fc: last.backlog, lo: last.backlog, coneH: 0,
  };
  forecast.forEach((r, i) => {
    rows.push({
      w: `W+${i + 1}`, opened: null, closed: null, backlog: null,
      fc: r.fc, lo: r.lo,
      coneH: r.hi !== null && r.lo !== null ? r.hi - r.lo : null,
    });
  });
  return rows;
}

const STATUS_COLOR: Record<string, string> = {
  rising: RS.red, flat: RS.dim, declining: RS.green,
};

function ChipButton({ color, active, onClick, children }: {
  color: string; active?: boolean; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ color, fontFamily: RS_MONO, fontSize: 11, padding: "2px 8px", borderRadius: 4,
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${color}${active ? "" : "55"}`,
        background: active ? `${color}22` : `${color}10` }}>
      {children}
    </button>
  );
}

export default function FactoryNcrIntelligence() {
  const [data, setData] = useState<NcrResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [drillExemplar, setDrillExemplar] = useState<NcrCluster["exemplars"][number] | null>(null);

  useEffect(() => {
    getNcr(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((d) => {
        setData(d);
        if (d.clusters.length > 0) setSelectedId(d.clusters[0].cluster_id);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const clusters = useMemo(() => data?.clusters ?? [], [data]);
  const colorByCluster = useMemo(() => {
    const m = new Map<number, string>();
    clusters.forEach((c, i) => m.set(c.cluster_id, clusterColor(i)));
    return m;
  }, [clusters]);

  const pointsByCluster = useMemo(() => {
    const m = new Map<number, { x: number; y: number }[]>();
    for (const p of data?.points ?? []) {
      if (p.x === null || p.y === null) continue;
      const cid = p.cluster_id === null ? -1 : p.cluster_id;
      if (!m.has(cid)) m.set(cid, []);
      m.get(cid)!.push({ x: p.x, y: p.y });
    }
    return m;
  }, [data]);

  const backlogData = useMemo(
    () => assembleBacklogSeries(data?.backlog.history ?? [], data?.backlog.forecast ?? []),
    [data]);

  const selected: NcrCluster | undefined = clusters.find((c) => c.cluster_id === selectedId);
  const backtest = data?.backlog.backtest ?? null;
  const prov = data?.provenance ?? null;
  const isDatabricks = prov?.provenance === "databricks";
  // severity filter over the selected cluster's exemplars (the data carries severity per exemplar)
  const exemplarSeverities = selected ? Array.from(new Set(selected.exemplars.map((e) => e.severity))) : [];
  const shownExemplars = !selected ? []
    : severityFilter === "all" ? selected.exemplars
    : selected.exemplars.filter((e) => e.severity === severityFilter);

  if (err) {
    return (
      <div style={{ minHeight: "100vh", background: RS.bg, color: RS.text, fontFamily: RS_SANS,
        padding: 24 }}>
        <RsPanel title="FACTORY · NCR INTELLIGENCE">
          <div style={{ padding: 16, color: RS.red, fontFamily: RS_MONO, fontSize: 12 }}
            data-testid="ncr-error">
            Not available — {err}
          </div>
        </RsPanel>
      </div>
    );
  }

  if (data && data.null_reason) {
    return (
      <div style={{ minHeight: "100vh", background: RS.bg, color: RS.text, fontFamily: RS_SANS,
        padding: 24 }}>
        <RsPanel title="FACTORY · NCR INTELLIGENCE">
          <div style={{ padding: 16, fontFamily: RS_MONO, fontSize: 12, color: RS.dim }}
            data-testid="ncr-empty">
            Not available — {data.null_reason}. The NCR pipeline mirror has not been applied to this
            environment; no synthetic placeholder is rendered.
          </div>
        </RsPanel>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: RS.bg, color: RS.faint, fontFamily: RS_MONO,
        padding: 24, fontSize: 12 }}>
        loading ncr intelligence…
      </div>
    );
  }

  const k = data.kpis;
  const noisePareto = data.pareto.find((p) => p.cluster_id === -1);

  return (
    <div style={{ minHeight: "100vh", width: "100%", padding: 12, background: RS.bg,
      fontFamily: RS_SANS, color: RS.text }}>
      {/* header */}
      <TelemetryPageHeader
        variant="standard"
        eyebrow="TELEMETRY LAB"
        title="Factory · NCR Intelligence"
        actions={
          <>
            <RsChip color={RS.cyan}>pipeline: embed → UMAP → HDBSCAN → c-TF-IDF</RsChip>
            <RsChip color={isDatabricks ? RS.green : RS.amber}>
              {SOURCE_KIND_TAG[isDatabricks ? "computed-artifact" : "fixture"]}
            </RsChip>
            {prov && (
              <RsChip color={isDatabricks ? RS.green : RS.amber}>
                {isDatabricks
                  ? `DATABRICKS · mlflow ${(prov.cluster_mlflow_run_id ?? "").slice(0, 8)}`
                  : "LOCAL FALLBACK — not a Databricks run"}
              </RsChip>
            )}
          </>
        }
        metadata={
          <div style={{ color: RS.faint, fontFamily: RS_MONO, fontSize: 11, display: "flex",
            flexDirection: "column", gap: 5 }}>
            <span>
              window: 16-week corpus · batch pipeline mirror (not live) ·{" "}
              {isDatabricks ? "real Databricks run, batch — not live serving" : "local fallback fixture"}
            </span>
            <span style={{ fontFamily: RS_SANS, maxWidth: 900, lineHeight: 1.55, color: RS.dim }}>
              NCRs are non-conformance reports — the unstructured quality record raised when a part fails
              inspection. This is where &ldquo;the launch became a data problem&rdquo;: the failure signal is
              buried in free-text narratives, so the surface embeds and clusters them into defect families
              to answer <em>which families are rising, how long they take to close, and where the open
              backlog is heading</em>.
            </span>
          </div>
        }
      />

      {/* KPI tiles — all real derivations; absent values say so */}
      <StatGrid cols={4} style={{ paddingBottom: 12 }}>
        <RsKpi label="Open NCRs" value={k?.open_now != null ? String(k.open_now) : "not available"}
          sub={k?.open_weeks_ago != null ? `vs ${k.open_weeks_ago} eight weeks ago` : "no 8-week history"} />
        <RsKpi label="Median time to close"
          value={k?.median_ttc_days != null ? `${k.median_ttc_days.toFixed(0)} d` : "not available"}
          sub="closed records, full corpus window" color={RS.amber} />
        <RsKpi label="Reopen rate"
          value={k?.reopen_rate != null ? `${(k.reopen_rate * 100).toFixed(1)}%` : "not available"}
          sub="full corpus window" />
        <RsKpi label="Clusters rising" value={String(k?.clusters_rising ?? 0)}
          sub={k && k.rising_labels.length > 1
            ? `${k.rising_labels[0]} +${k.rising_labels.length - 1} more`
            : (k?.rising_labels?.[0] ?? "none rising")}
          color={k && k.clusters_rising > 0 ? RS.red : RS.green} />
      </StatGrid>

      <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: 10 }}>
        <ExportToCsvButton
          filename="factory_ncr_clusters"
          columns={CLUSTER_COLS}
          rows={clusterRows(clusters)}
          label="Export clusters CSV"
          disabled={clusters.length === 0}
          disabledReason="No clusters in this corpus window" />
      </div>

      <SplitGrid variant="two-one">
        {/* embedding map — REAL model coordinates */}
        <RsPanel title="NCR EMBEDDING MAP · UMAP PROJECTION · HDBSCAN CLUSTERS"
          right={<span style={{ color: RS.faint, fontFamily: RS_MONO, fontSize: 11 }}>
            click a cluster to inspect</span>}>
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
              <XAxis dataKey="x" type="number" name="UMAP-1"
                tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
                axisLine={{ stroke: RS.line }} tickLine={false} domain={["auto", "auto"]} />
              <YAxis dataKey="y" type="number" name="UMAP-2" width={40}
                tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
                axisLine={{ stroke: RS.line }} tickLine={false} domain={["auto", "auto"]} />
              <Scatter data={pointsByCluster.get(-1) ?? []} fill={RS.gray} fillOpacity={0.45}
                isAnimationActive={false} />
              {clusters.map((c) => {
                const dim = selectedId !== null && selectedId !== c.cluster_id;
                return (
                  <Scatter key={c.cluster_id} data={pointsByCluster.get(c.cluster_id) ?? []}
                    isAnimationActive={false} fill={colorByCluster.get(c.cluster_id)}
                    fillOpacity={dim ? 0.25 : 0.85} cursor="pointer"
                    onClick={() => setSelectedId(c.cluster_id)} />
                );
              })}
            </ScatterChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 12px 12px" }}>
            {clusters.map((c) => (
              <ChipButton key={c.cluster_id} color={colorByCluster.get(c.cluster_id) ?? RS.dim}
                active={c.cluster_id === selectedId} onClick={() => setSelectedId(c.cluster_id)}>
                cluster_{c.cluster_id} · {c.n_records}
              </ChipButton>
            ))}
            {/* WCAG: RS.gray (#3D4D60) is fine as the de-emphasized noise-scatter FILL, but as chip
                text it is ~2.1 contrast (unreadable). Use RS.dim for the readable label; the scatter
                points keep RS.gray. */}
            <RsChip color={RS.dim}>noise · {noisePareto?.n ?? 0}</RsChip>
          </div>
        </RsPanel>

        {/* cluster drawer */}
        <RsPanel title="CLUSTER DETAIL">
          {!selected ? (
            <div style={{ padding: 12, color: RS.dim, fontFamily: RS_MONO, fontSize: 12 }}>
              no cluster selected
            </div>
          ) : (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12,
              fontSize: 12 }} data-testid="cluster-detail">
              <div style={{ display: "flex", alignItems: "flex-start",
                justifyContent: "space-between", gap: 8 }}>
                <div>
                  <div style={{ fontFamily: RS_MONO,
                    color: colorByCluster.get(selected.cluster_id) }}>
                    cluster_{selected.cluster_id}
                  </div>
                  <div style={{ color: RS.text }}>{selected.label}</div>
                </div>
                <RsChip color={STATUS_COLOR[selected.status] ?? RS.dim}>
                  {selected.status.toUpperCase()}
                </RsChip>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8,
                fontFamily: RS_MONO }}>
                <div style={{ background: RS.panelAlt, borderRadius: 4, padding: 8,
                  textAlign: "center" }}>
                  <div>{selected.n_records}</div>
                  <div style={{ color: RS.faint, fontFamily: RS_SANS }}>records</div>
                </div>
                <div style={{ background: RS.panelAlt, borderRadius: 4, padding: 8,
                  textAlign: "center" }}>
                  <div>{selected.median_ttc_days != null
                    ? `${selected.median_ttc_days.toFixed(0)} d` : "n/a"}</div>
                  <div style={{ color: RS.faint, fontFamily: RS_SANS }}>median close</div>
                </div>
                <div style={{ background: RS.panelAlt, borderRadius: 4, padding: 8,
                  textAlign: "center" }}>
                  <div>{selected.reopen_rate != null
                    ? `${(selected.reopen_rate * 100).toFixed(0)}%` : "n/a"}</div>
                  <div style={{ color: RS.faint, fontFamily: RS_SANS }}>reopen</div>
                </div>
              </div>

              <div>
                <div style={{ color: RS.faint, letterSpacing: "0.1em", marginBottom: 6 }}>
                  C-TF-IDF KEYWORDS
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selected.keywords.map((kw) => (
                    <RsChip key={kw} color={colorByCluster.get(selected.cluster_id) ?? RS.dim}>
                      {kw}
                    </RsChip>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ color: RS.faint, letterSpacing: "0.1em", marginBottom: 4 }}>
                  WEEKLY VOLUME · 8 WK
                </div>
                <ResponsiveContainer width="100%" height={56}>
                  <ComposedChart data={selected.trend.map((v, i) => ({ w: i + 1, v }))}
                    margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="w" hide />
                    <YAxis hide domain={[0, Math.max(...selected.trend, 4)]} />
                    <Bar dataKey="v" fill={colorByCluster.get(selected.cluster_id)}
                      fillOpacity={0.7} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                  <span style={{ color: RS.faint, letterSpacing: "0.1em" }}>
                    EXEMPLAR RECORDS · NEAREST CENTROID
                  </span>
                  <ExportToCsvButton
                    filename={`factory_ncr_exemplars_cluster_${selected.cluster_id}`}
                    columns={EXEMPLAR_COLS}
                    rows={exemplarRows(selected, shownExemplars)}
                    label="Export exemplars CSV"
                    disabled={shownExemplars.length === 0}
                    disabledReason="No exemplars match this severity filter" />
                </div>
                {/* severity filter — only severities actually present in the cluster */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  <ChipButton color={RS.dim} active={severityFilter === "all"}
                    onClick={() => setSeverityFilter("all")}>all · {selected.exemplars.length}</ChipButton>
                  {exemplarSeverities.map((sev) => (
                    <ChipButton key={sev}
                      color={sev === "major" || sev === "critical" ? RS.amber : RS.dim}
                      active={severityFilter === sev} onClick={() => setSeverityFilter(sev)}>
                      {sev} · {selected.exemplars.filter((e) => e.severity === sev).length}
                    </ChipButton>
                  ))}
                </div>
                {shownExemplars.length === 0 ? (
                  <div style={{ color: RS.dim, fontFamily: RS_MONO, fontSize: 11, padding: "6px 0" }}>
                    No exemplars at severity &ldquo;{severityFilter}&rdquo; in this cluster.
                  </div>
                ) : shownExemplars.map((e) => (
                  <button key={e.ncr_key} type="button" onClick={() => setDrillExemplar(e)}
                    aria-label={`Inspect NCR ${e.ncr_key}`}
                    style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                      background: RS.panelAlt, border: `1px solid ${RS.line}`, borderRadius: 4,
                      padding: 8, marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center",
                      justifyContent: "space-between", marginBottom: 2 }}>
                      <span style={{ fontFamily: RS_MONO, color: RS.cyan }}>{e.ncr_key}</span>
                      <RsChip color={e.severity === "major" || e.severity === "critical"
                        ? RS.amber : RS.dim}>{e.severity}</RsChip>
                    </div>
                    <div style={{ color: RS.dim }}>{e.summary}</div>
                    <div style={{ color: RS.faint, fontFamily: RS_MONO, fontSize: 10 }}>
                      {e.workcell} · click to inspect ›
                    </div>
                  </button>
                ))}
                <div style={{ color: RS.faint, fontSize: 10 }}>
                  Summaries shown are redacted per export-control handling. Embeddings computed on
                  an internally hosted model; raw narratives never leave the boundary.
                </div>
              </div>
            </div>
          )}
        </RsPanel>
      </SplitGrid>

      {/* bottom analytics row */}
      <SplitGrid variant="halves" style={{ marginTop: 12 }}>
        <RsPanel title="PARETO BY DISCOVERED CLUSTER · CORPUS WINDOW">
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={data.pareto} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="family" tick={{ fill: RS.faint, fontSize: 8, fontFamily: RS_MONO }}
                axisLine={false} tickLine={false} interval={0}
                tickFormatter={(v: string) => v.length > 14 ? `${v.slice(0, 13)}…` : v} />
              <YAxis yAxisId="n" width={30} tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
                axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} width={34}
                tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
                tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <ReferenceLine yAxisId="pct" y={80} stroke={RS.faint} strokeDasharray="3 3" />
              <Bar yAxisId="n" dataKey="n" isAnimationActive={false}>
                {data.pareto.map((p, i) => (
                  <Cell key={p.cluster_id}
                    fill={p.cluster_id === -1 ? RS.gray : (i === 0 ? RS.red : RS.teal)}
                    fillOpacity={0.75} />
                ))}
              </Bar>
              <Line yAxisId="pct" dataKey="cum_pct" stroke={RS.amber} strokeWidth={1.4}
                dot={{ r: 2, fill: RS.amber }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </RsPanel>

        <RsPanel title="OPEN BACKLOG · 8 WK HISTORY + 4 WK FORECAST"
          right={backtest && backtest.mae != null ? (
            <span style={{ color: RS.faint, fontFamily: RS_MONO, fontSize: 11 }}>
              backtest MAE {backtest.mae.toFixed(1)}
              {backtest.mae_naive != null ? ` (naive ${backtest.mae_naive.toFixed(1)})` : " (naive n/a)"} ·
              MAPE {backtest.mape_pct != null ? `${backtest.mape_pct.toFixed(1)}%` : "n/a"} ·
              skill {backtest.skill_vs_naive != null
                ? `${(backtest.skill_vs_naive * 100).toFixed(0)}%` : "n/a"}
            </span>
          ) : (
            <span style={{ color: RS.faint, fontFamily: RS_MONO, fontSize: 11 }}>
              backtest metrics not available
            </span>
          )}>
          {backlogData.length === 0 ? (
            <div style={{ padding: 16, color: RS.dim, fontFamily: RS_MONO, fontSize: 12 }}
              data-testid="backlog-empty">
              Not available — no backlog history ingested for this environment.
            </div>
          ) : (
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={backlogData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="w" tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
                axisLine={false} tickLine={false} interval={0} />
              <YAxis width={30} tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
                axisLine={false} tickLine={false} domain={[0, "auto"]} />
              <Bar dataKey="opened" fill={RS.blue} fillOpacity={0.55} isAnimationActive={false} />
              <Bar dataKey="closed" fill={RS.green} fillOpacity={0.55} isAnimationActive={false} />
              <Area dataKey="lo" stackId="cone" stroke="none" fill="transparent"
                isAnimationActive={false} />
              <Area dataKey="coneH" stackId="cone" stroke="none" fill={RS.violet}
                fillOpacity={0.14} isAnimationActive={false} />
              <Line dataKey="backlog" stroke={RS.text} strokeWidth={1.4} dot={false}
                isAnimationActive={false} />
              <Line dataKey="fc" stroke={RS.violet} strokeWidth={1.4} strokeDasharray="4 3"
                dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          )}
          <div style={{ padding: "0 12px 8px", fontSize: 11, display: "flex", flexWrap: "wrap",
            gap: 16, fontFamily: RS_MONO }}>
            <span style={{ color: RS.blue }}>■ opened</span>
            <span style={{ color: RS.green }}>■ closed</span>
            <span style={{ color: RS.text }}>— open backlog</span>
            <span style={{ color: RS.violet }}>--- forecast (90% band)</span>
          </div>
          <div style={{ padding: "0 12px 12px", color: RS.faint, fontSize: 10 }}>
            MAE reported alongside MAPE; MAPE alone is unstable when actuals approach zero. Band is
            the empirical 90% quantile of walk-forward residuals.
          </div>
        </RsPanel>
      </SplitGrid>

      <div style={{ padding: "12px 0 4px", textAlign: "center", fontSize: 11, color: RS.faint }}>
        Synthetic NCR corpus (deterministic, SEED=20260609) — no program or supplier data. The
        clustering and forecast outputs shown are real model runs; provenance is labeled in the
        header. Production equivalent would ingest the live NCR/QMS system.
      </div>

      <MetricInspectorDrawer
        open={drillExemplar !== null}
        onClose={() => setDrillExemplar(null)}
        title={drillExemplar ? `NCR ${drillExemplar.ncr_key}` : "NCR"}
        description="One non-conformance exemplar from the selected cluster. Record-level history (detected/created date, disposition, record status) is not carried in the corpus-grain mirror — shown fail-closed below, never fabricated."
        fields={drillExemplar && selected ? [
          { label: "NCR id", value: drillExemplar.ncr_key },
          { label: "Severity", value: drillExemplar.severity },
          { label: "Workcell / station", value: drillExemplar.workcell },
          { label: "Summary (redacted)", value: drillExemplar.summary },
          { label: "Cluster", value: `cluster_${selected.cluster_id} · ${selected.label}` },
          { label: "Cluster status", value: selected.status },
          { label: "Detected / created at", value: null },
          { label: "Disposition", value: null },
          { label: "Record status", value: null },
        ] : []}
      >
        {drillExemplar && selected && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: RS_MONO, fontSize: 10.5, color: RS.faint, lineHeight: 1.5 }}>
              null_reason: detected_at / disposition / record-status are not in the NCR mirror&rsquo;s
              cluster-grain exemplar; the source QMS holds record-level history.
            </div>
            {selected.mlflow_run_id
              ? <DatabricksRunLink runId={selected.mlflow_run_id} />
              : <span style={{ fontFamily: RS_MONO, fontSize: 10.5, color: RS.faint }}>
                  cluster run link unavailable — no mlflow_run_id on this cluster (local fallback)
                </span>}
          </div>
        )}
      </MetricInspectorDrawer>
    </div>
  );
}
