"use client";

import { useEffect, useMemo, useState } from "react";
import { getReplayFeed, type ReplayFeed, type ReplayTick } from "@/lib/telemetry/api";
import {
  C, Panel, MetricCard, Loading, ErrorState, EmptyState, PageHeading, Tag,
  StatGrid, ScrollTable, verdictColor,
} from "./primitives";

// Verdict bands on the anomaly score (frozen detector). GO < 1.0 <= REVIEW <= 2.0 < NO_GO.
// Exported so the test can assert the boundaries directly.
export function scoreVerdict(score: number): "GO" | "REVIEW" | "NO_GO" {
  if (score > 2.0) return "NO_GO";
  if (score >= 1.0) return "REVIEW";
  return "GO";
}

function verdictLabel(v: "GO" | "REVIEW" | "NO_GO"): string {
  return v === "NO_GO" ? "NO-GO" : v;
}

// One Known Anomaly Walkthrough — real recorded champion output on a known channel. This is replayed
// (recorded) output, NOT a live feed. Every count, the fire tick, and the score series come straight
// from /api/telemetry/replay; the per-tick verdict is the frozen detector's band applied to the real
// score. Channel attribution / top contributors are deliberately not fabricated here.
export default function KnownAnomalyCard({ embedded = false }: { embedded?: boolean } = {}) {
  const [feed, setFeed] = useState<ReplayFeed | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getReplayFeed().then(setFeed).catch((e) => setError(String(e))); }, []);

  const ticks = useMemo<ReplayTick[]>(() => feed?.feed ?? [], [feed]);

  // Peak-score tick — the most off-nominal moment in the recorded run.
  const peak = useMemo<ReplayTick | null>(() => {
    if (ticks.length === 0) return null;
    return ticks.reduce((a, b) => (b.score > a.score ? b : a));
  }, [ticks]);

  // The window of ticks around the first model fire, so the table stays compact.
  const window = useMemo<ReplayTick[]>(() => {
    if (ticks.length === 0) return [];
    const fireT = feed?.first_model_fire_t;
    const center = fireT != null ? ticks.findIndex((p) => p.t >= fireT) : -1;
    const idx = center >= 0 ? center : ticks.findIndex((p) => p === peak);
    const safe = idx >= 0 ? idx : 0;
    return ticks.slice(Math.max(0, safe - 4), safe + 5);
  }, [ticks, feed, peak]);

  const heading = embedded ? null : (
    <PageHeading eyebrow="Known Anomaly · replayed" title="One known anomaly, walked through end to end"
      blurb="Recorded champion output on a known channel — replayed, not live. The score series and the first autonomous fire are the model's real outputs; the per-tick verdict is the frozen detector band applied to that score." />
  );
  if (error) return <>{heading}<ErrorState message={error} /></>;
  if (!feed) return <>{heading}<Loading label="Loading known anomaly…" /></>;
  if (feed.null_reason || ticks.length === 0) {
    return <>{heading}<EmptyState label="Known anomaly walkthrough not available"
      hint={feed.null_reason || "The replay feed returned no ticks. The recorded champion run is empty."} /></>;
  }

  const peakVerdict = peak ? scoreVerdict(peak.score) : "GO";
  const pcol = verdictColor(peakVerdict);
  const scoreMax = Math.max(...ticks.map((p) => p.score), 1);

  return (
    <>
      {heading}

      <div style={{ border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 8,
        padding: "8px 12px", marginBottom: 16, fontFamily: C.mono, fontSize: 10.5, color: C.amber, lineHeight: 1.5 }}>
        Replayed champion output (recorded) — not a live feed. Source: {feed.provenance.source_table}.
      </div>

      <StatGrid cols={4}>
        <MetricCard label="First model fire" value={feed.first_model_fire_t != null ? `t=${feed.first_model_fire_t}` : "no fire"}
          accent={feed.first_model_fire_t != null ? C.red : C.green} />
        <MetricCard label="Model-fired ticks" value={String(feed.model_fired_ticks)} accent={C.amber} />
        <MetricCard label="Label anomaly ticks" value={String(feed.label_anomaly_ticks)} />
        <MetricCard label="Fixture ticks" value={String(feed.fixture_ticks)}
          sub={`of ${feed.total_ticks_source} source`} />
      </StatGrid>

      <Panel title="Peak-score verdict" style={{ marginTop: 16 }}
        right={<Tag color={pcol}>{verdictLabel(peakVerdict)}</Tag>}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontFamily: C.sans, fontSize: 40, fontWeight: 700, color: pcol, lineHeight: 1,
            textShadow: `0 0 18px ${pcol}55` }}>{verdictLabel(peakVerdict)}</div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.dim, lineHeight: 1.5 }}>
            peak anomaly score <span style={{ color: C.text }}>{peak?.score.toFixed(3)}</span> at tick{" "}
            <span style={{ color: C.text }}>t={peak?.t}</span>
          </div>
        </div>
        <p style={{ fontFamily: C.mono, fontSize: 10.5, color: C.faint, lineHeight: 1.6, marginTop: 12 }}>
          Bands (frozen detector): GO &lt; 1.0 · REVIEW 1.0–2.0 · NO-GO &gt; 2.0. Channel attribution /
          top-contributing channels are available on the model-detail surface — not fabricated here.
        </p>
      </Panel>

      <Panel title={`Score timeline around first fire (channel ${feed.channel} · ${feed.spacecraft})`}
        style={{ marginTop: 16 }} pad={16}>
        <ScrollTable minWidth={560}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["tick", "value", "rmean", "score", "model_pred", "label", "verdict"].map((h) => (
                  <th key={h} style={{ textAlign: h === "tick" ? "left" : "right", fontFamily: C.mono, fontSize: 9,
                    letterSpacing: "0.1em", color: C.faint, textTransform: "uppercase", padding: "6px 10px",
                    borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {window.map((p) => {
                const v = scoreVerdict(p.score);
                const vc = verdictColor(v);
                const isPeak = peak != null && p.t === peak.t;
                return (
                  <tr key={p.t} style={{ background: isPeak ? `${pcol}12` : undefined }}>
                    <td style={cell(C.text, "left")}>t={p.t}</td>
                    <td style={cell(C.dim)}>{p.value.toFixed(3)}</td>
                    <td style={cell(C.dim)}>{p.rmean.toFixed(3)}</td>
                    <td style={cell(C.text)}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                        <span style={{ width: 36, height: 4, borderRadius: 999, background: C.panelHi, overflow: "hidden", display: "inline-block" }}>
                          <span style={{ display: "block", height: "100%", background: vc,
                            width: `${Math.min(100, (p.score / scoreMax) * 100)}%` }} />
                        </span>
                        {p.score.toFixed(3)}
                      </span>
                    </td>
                    <td style={cell(p.model_pred === 1 ? C.red : C.dim)}>{p.model_pred}</td>
                    <td style={cell(p.is_anomaly === 1 ? C.amber : C.dim)}>{p.is_anomaly}</td>
                    <td style={{ ...cell(vc), fontWeight: 600 }}>{verdictLabel(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollTable>
      </Panel>

      <Panel title="Provenance" style={{ marginTop: 16 }} pad={14}>
        <Row label="Channel" value={`${feed.channel} (${feed.spacecraft})`} />
        <Row label="Champion model" value={feed.provenance.champion_model} />
        <Row label="MLflow run" value={feed.provenance.champion_mlflow_run_id} />
        <Row label="Source table" value={feed.provenance.source_table} />
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, lineHeight: 1.6, marginTop: 12 }}>
          {feed.provenance.note}
        </p>
      </Panel>
    </>
  );
}

function cell(color: string, align: "left" | "right" = "right") {
  return { fontFamily: C.mono, fontSize: 11.5, color, padding: "6px 10px",
    borderBottom: `1px solid ${C.border}`, textAlign: align } as const;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12,
      padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>{label}</span>
      <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}
