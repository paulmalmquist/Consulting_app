"use client";

// Mission Summary — the executive landing. Concise conclusions, not a telemetry exhibit:
// readiness (fail-closed), a one-line scoring posture, a compact operational-leverage strip, and
// launchpads INTO the detail pages (Model Registry, Test Runs, System Health, Metric Lineage,
// Test Intelligence) rather than re-hosting their tables here. Reads only /api/telemetry/summary;
// every value is real or fails closed. Detail lives on its owning page.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getSummary, type TelemetrySummary,
  TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID,
} from "@/lib/telemetry/api";
import { C, Tag, Panel, Loading, ErrorState, PageHeading, DisclosureFooter } from "./primitives";

function num(n: number | null | undefined): string {
  return n == null ? "—" : Number(n).toLocaleString();
}
function formatTs(value?: string | null): string {
  if (!value) return "as-of unknown";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

// A readiness component-input card: a real headline value (or explicit "Not available here") + a
// link to the surface that owns it. No composite score is computed here.
function ComponentCard({ name, value, href, hrefLabel }: {
  name: string; value: string; href: string; hrefLabel: string;
}) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, padding: 14 }}>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{name}</div>
      <div style={{ fontFamily: C.mono, fontSize: 13, color: C.text, marginTop: 8, lineHeight: 1.4, minHeight: 18 }}>{value}</div>
      <Link href={href} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none" }}>{hrefLabel} →</Link>
    </div>
  );
}

// A launchpad / "continue the demo" navigation card. Optional real sub-value; never a metric dump.
function Launchpad({ title, sub, href }: { title: string; sub?: string; href: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none", display: "block", background: C.panelHi,
      border: `1px solid ${C.border}`, borderRadius: 9, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: C.mono, fontSize: 12.5, color: C.text }}>{title}</span>
        <span style={{ fontFamily: C.mono, fontSize: 13, color: C.cyan }}>→</span>
      </div>
      {sub && <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 5 }}>{sub}</div>}
    </Link>
  );
}

// Compact scoring posture — one slim GO / REVIEW / NO-GO bar from the live verdict distribution.
function ScoringPosture({ verdicts }: { verdicts: Record<string, number> }) {
  const order = [["GO", C.green], ["REVIEW", C.amber], ["NO_GO", C.red]] as const;
  const total = Object.values(verdicts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div style={{ display: "flex", height: 8, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
        {order.map(([v, col]) => {
          const n = verdicts[v] || 0;
          return n ? <div key={v} title={`${v} ${n}`} style={{ width: `${(n / total) * 100}%`, background: col }} /> : null;
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 9 }}>
        {order.map(([v, col]) => (
          <span key={v} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: C.mono, fontSize: 11, color: C.dim }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
            {v === "NO_GO" ? "NO-GO" : v} {num(verdicts[v] || 0)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TelemetryOverview({ envId }: { envId: string }) {
  const [summary, setSummary] = useState<TelemetrySummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSummary(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then(setSummary)
      .catch((e) => setError(String(e)));
  }, []);

  const heading = (
    <PageHeading eyebrow="Mission Summary"
      title="Mission health, model posture, and operating readiness"
      blurb="Executive summary read live from the telemetry serving API. Every value below is real or fails closed — nothing is seeded. Trace any governed number to its source on the Metric Lineage page."
      right={
        <Link href={`/lab/env/${envId}/telemetry/metric-lineage`}
          style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.bg, background: C.cyan,
            border: "none", borderRadius: 8, padding: "10px 18px", textDecoration: "none" }}>
          Trace lineage →
        </Link>
      } />
  );
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!summary) return <>{heading}<Loading label="Loading mission summary…" /></>;

  const k = summary.kpi;
  const inv = summary.inventory;
  const base = `/lab/env/${envId}/telemetry`;

  return (
    <>
      {heading}

      {/* freshness / as-of — first-class, fail-closed */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 0 16px",
        fontFamily: C.mono, fontSize: 11, color: C.dim }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: k.last_scored_at ? C.green : C.amber }} />
        Data as of {formatTs(k.last_scored_at)} · live serving API · values real or fail closed
      </div>

      {/* mission readiness — fail closed (no composite number until the formula is ratified) */}
      <Panel title="Mission readiness" right={<Tag color={C.amber}>not available</Tag>}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: C.sans, fontSize: 28, fontWeight: 700, color: C.amber, lineHeight: 1 }}>Not available</span>
          <span style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, maxWidth: 560, lineHeight: 1.5 }}>
            null_reason: composite_formula_not_ratified — readiness is a weighted composite; its formula and
            weights are not ratified yet. The real component inputs are below.
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ marginTop: 14 }}>
          <ComponentCard name="Operations" value={`${num(k.predictions)} predictions · ${k.test_runs} runs`} href={`${base}/system-health`} hrefLabel="System Health" />
          <ComponentCard name="Quality"
            value={`F1 ${k.anomaly_f1 != null ? Number(k.anomaly_f1).toFixed(4) : "—"} · RMSE ${k.rul_rmse != null ? Number(k.rul_rmse).toFixed(2) : "—"}`}
            href={`${base}/model-performance`} hrefLabel="Model performance" />
          <ComponentCard name="Models" value={`${k.promoted_models} promoted / ${inv.model_runs} evaluated`} href={`${base}/registry`} hrefLabel="Model registry" />
          <ComponentCard name="AI" value="Not available here" href={`${base}/governance`} hrefLabel="Trust Center" />
        </div>
      </Panel>

      {/* compact scoring posture + operational leverage, side by side on desktop */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ marginTop: 16 }}>
        <Panel title="Current scoring posture" right={<Tag color={C.cyan}>{num(k.predictions)} scored</Tag>}>
          <ScoringPosture verdicts={summary.verdicts} />
          <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
            Live verdict distribution across scored events · governed prediction log.
          </div>
        </Panel>
        <Panel title="Operational leverage — technical debt → launch impact" right={<Tag color={C.amber}>framework</Tag>}>
          <div style={{ fontFamily: C.mono, fontSize: 11, color: C.dim, lineHeight: 1.6 }}>
            Tech debt → engineering throughput → test velocity → flight readiness → launch cadence.
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.amber, marginTop: 10 }}>Projection unavailable</div>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 4, lineHeight: 1.5 }}>
            requires a governed metric registry (modeled relationship + basis + confidence). No projection is invented.
          </div>
        </Panel>
      </div>

      {/* continue the demo — launchpads into detail pages (not metric duplicates) */}
      <div style={{ fontFamily: C.mono, fontSize: 11, letterSpacing: "0.13em", color: C.faint,
        textTransform: "uppercase", margin: "26px 0 12px" }}>
        Continue the demo
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Launchpad title="Inspect live stream" href={`${base}/stream`} />
        <Launchpad title="Open metric lineage" href={`${base}/metric-lineage`} />
        <Launchpad title="Review model registry" sub={`${k.promoted_models} promoted / ${inv.model_runs} evaluated`} href={`${base}/registry`} />
        <Launchpad title="Inspect test runs" sub={`${k.test_runs} runs · ${num(k.predictions)} prediction rows`} href={`${base}/runs`} />
        <Launchpad title="System health" href={`${base}/system-health`} />
        <Launchpad title="Ask grounded analyst" href={`${base}/copilot`} />
      </div>

      {/* historical context — subordinate takeaway only (full Bottleneck Map lives on its own surface) */}
      <Panel title="Historical context" style={{ marginTop: 24 }} pad={16}>
        <p style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.6, margin: 0 }}>
          Current bottleneck: decision velocity. Launch cost fell; manufacturing complexity rose. The next gain
          comes from faster, trusted telemetry-to-decision loops.
        </p>
        <Link href={`${base}/how-it-works`} style={{ fontFamily: C.mono, fontSize: 11, color: C.cyan, textDecoration: "none", display: "inline-block", marginTop: 10 }}>
          How this works →
        </Link>
      </Panel>

      <DisclosureFooter />
    </>
  );
}
