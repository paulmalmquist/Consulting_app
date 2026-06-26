"use client";

// Stargate Live — printer telemetry console fed by the SSE bridge.
// Status strip (mode, throughput, aggregation engine badge), live 3D toolhead
// view, dual-axis temp/vibration chart with anomaly bands, anomaly ticker, and
// the DLQ feed. Full-bleed inside TelemetryShell like every telemetry page.

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { C, EmptyState, MetricCard, Panel, RowCard, SplitGrid, Tag } from "../primitives";
import { TelemetryPageHeader } from "../TelemetryPageHeader";
import AnomalyInspectionDrawer from "./AnomalyInspectionDrawer";
import DlqPanel from "./DlqPanel";
import RulesVsBaselineLane from "./RulesVsBaselineLane";
import TempVibrationChart from "./TempVibrationChart";
import StreamLineageDrawer from "./StreamLineageDrawer";
import { useStargateStream } from "@/lib/lab/stargateStream";
import type { AnomalyRow } from "@/lib/lab/stargateStream";
import { ExportToCsvButton, SOURCE_KIND_TAG } from "../drill";
import { ANOMALY_EXPORT_COLUMNS, anomalyExportRows } from "./streamExportRows";
import StreamContextStrip from "./StreamContextStrip";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "@/lib/telemetry/api";
import { useIsMobile } from "@/hooks/useIsMobile";

/** Stable inspect token for the deep link: topic:partition:offset (only when provenance is present). */
function eventIdOf(a: AnomalyRow): string | null {
  return a.provenance
    ? `${a.provenance.kafka_topic}:${a.provenance.kafka_partition}:${a.provenance.kafka_offset}`
    : null;
}

// The agent stamps a deterministic anomaly id from the detection event (see
// infra/confluent/stargate/agents/anomaly_triage_agent.sql): anom_{printer_id}_{ts_us}. The same id
// links a live SSE anomaly to its PERSISTED lineage in the 10034 serving slice. When the durable
// consumer is off / nothing has landed yet, the drawer fails closed honestly.
function anomalyLineageId(printerId: string, tsUs: number): string {
  return `anom_${printerId}_${tsUs}`;
}

const PrinterHead3D = dynamic(() => import("./PrinterHead3D"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: C.mono, fontSize: 12, color: C.dim }}>Loading 3D view…</div>
  ),
});

function aggBadge(source?: string): { label: string; color: string } {
  if (source === "flink") return { label: "Managed Flink", color: C.green };
  if (source === "local-emulation") return { label: "Local aggregation (Flink emulation)", color: C.amber };
  return { label: "Recorded capture", color: C.cyan };
}

export default function StargateConsole() {
  const stream = useStargateStream();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<string | null>(null);
  const [lineageAnomalyId, setLineageAnomalyId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState<string | null>(null);
  const [inspected, setInspected] = useState<AnomalyRow | null>(null);
  const [highlight, setHighlight] = useState<{ start: number; end: number } | null>(null);
  // The three.js canvas only mounts on desktop, and only after hydration —
  // useIsMobile defaults to desktop on the server, so an unguarded render
  // would mount the canvas for one frame on phones.
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const show3D = mounted && !isMobile;

  // version is the render clock: buffers are refs, so reading them is keyed on it.
  const { telemetry, agg, anomalies, dlq, printers } = useMemo(() => {
    const all = stream.telemetryRef.current.toArray();
    const ids = Array.from(new Set(all.map((p) => p.printer_id))).sort();
    return {
      telemetry: all,
      agg: stream.aggRef.current.toArray(),
      anomalies: stream.anomaliesRef.current.toArray(),
      dlq: stream.dlqRef.current.toArray(),
      printers: ids,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.version]);

  const printer = selected && printers.includes(selected) ? selected : printers[0] || null;
  const printerPoints = useMemo(
    () => telemetry.filter((p) => p.printer_id === printer),
    [telemetry, printer],
  );
  const printerAgg = useMemo(() => agg.filter((a) => a.printer_id === printer), [agg, printer]);
  const printerAnomalies = useMemo(
    () => anomalies.filter((a) => a.printer_id === printer),
    [anomalies, printer],
  );
  const latest = printerPoints.length ? printerPoints[printerPoints.length - 1] : null;
  const badge = aggBadge(stream.health?.aggregation_source);

  // Deep link: ?inspect=<topic>:<partition>:<offset> reopens the drawer when the event is in the
  // current buffer, else shows an explicit fail-closed "not in window" note (never silently nothing).
  const inspectToken = searchParams.get("inspect");
  const missingInspect = Boolean(inspectToken) && !anomalies.some((a) => eventIdOf(a) === inspectToken);
  useEffect(() => {
    if (!inspectToken) return;
    if (inspected && eventIdOf(inspected) === inspectToken) return;
    const match = anomalies.find((a) => eventIdOf(a) === inspectToken);
    if (match) setInspected(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectToken, anomalies]);

  function inspect(a: AnomalyRow) {
    setInspected(a);
    const id = eventIdOf(a);
    if (id) router.replace(`${pathname}?inspect=${encodeURIComponent(id)}`, { scroll: false });
  }
  function closeInspect() {
    setInspected(null);
    router.replace(pathname, { scroll: false });
  }
  function viewWindow(tsUs: number) {
    const center = tsUs / 1000;
    setHighlight({ start: center - 30_000, end: center + 30_000 });
  }
  // The Start control restarts the recorded-capture replay; it is capture-mode
  // only (broker modes own their own producer). Default mode is capture, so the
  // control also shows before the first health frame arrives.
  const isCapture = (stream.health?.mode ?? "capture") === "capture";

  async function startRecordedCapture() {
    if (!stream.baseUrl || starting) return;
    setStarting(true);
    setStartMsg(null);
    try {
      const res = await fetch(`${stream.baseUrl}/stargate/replay/cycle`, { method: "POST" });
      if (res.status === 409) {
        setStartMsg("Start is capture-mode only");
      } else if (!res.ok) {
        setStartMsg(`Start failed (${res.status})`);
      } else {
        stream.reconnect(); // re-open SSE so the restarted replay paints immediately
      }
    } catch {
      setStartMsg("Bridge unreachable");
    } finally {
      setStarting(false);
    }
  }

  // Fail closed: a deployment without a configured bridge URL shows an explicit
  // diagnostic instead of silently trying (and failing) to reach localhost.
  // Placed after all hooks so the rules of hooks hold.
  if (!stream.configured) {
    return (
      <div>
        <TelemetryPageHeader
          variant="compact"
          eyebrow="Stargate Live"
          title="Printer telemetry stream"
          description="Protobuf telemetry over Kafka, windowed in flight, anomalies routed to their own topic."
        />
        <EmptyState
          label="Stargate bridge URL is not configured for this deployment."
          hint="Set NEXT_PUBLIC_STARGATE_BRIDGE_URL to the Railway bridge endpoint."
        />
      </div>
    );
  }

  return (
    <div>
      <TelemetryPageHeader
        variant="compact"
        eyebrow="Stargate Live"
        title="Printer telemetry stream"
        description="The live proof of the thesis: historical launch progress created more data than judgment could keep up with. The modern answer is governed streaming + model evidence + lineage + operator-facing actions. This is recorded test-stand capture replayed through real streaming infrastructure — protobuf over Kafka, windowed in flight, anomalies routed to their own topic, ring-buffered in the bridge with no database in the hot path. The baseline lane is a rolling-MAD scorer (the promoted anomaly champion), not an LSTM. Recorded capture, not a live printer."
        actions={
          <>
            {startMsg && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.red }}>{startMsg}</span>}
            {isCapture && (
              <button type="button" onClick={startRecordedCapture} disabled={starting}
                title="Replays the recorded capture fixture through the live Kafka/SSE bridge. This is recorded capture, not a live printer."
                style={{ fontFamily: C.mono, fontSize: 11, padding: "6px 12px", borderRadius: 7,
                  cursor: starting ? "default" : "pointer", color: starting ? C.dim : C.text,
                  background: "rgba(63,177,232,0.12)", border: `1px solid ${C.cyan}66`,
                  opacity: starting ? 0.6 : 1 }}>
                {starting ? "Starting…" : "▸ Start recorded capture"}
              </button>
            )}
            <Tag color={stream.connected ? C.green : C.red}>{stream.connected ? "stream live" : "reconnecting"}</Tag>
            <Tag color={badge.color}>{badge.label}</Tag>
            <Tag color={C.amber}>{SOURCE_KIND_TAG.fixture} · recorded capture</Tag>
          </>
        }
      />

      {missingInspect && (
        <div style={{ fontFamily: C.mono, fontSize: 11, color: C.amber, marginBottom: 12,
          padding: "8px 12px", border: `1px solid ${C.amber}44`, borderRadius: 7 }}>
          The linked anomaly is not in the current window — the replay loops and the live buffer keeps
          only recent events, so it may have scrolled out or the stream has not reached it yet.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <MetricCard label="Mode" value={stream.health?.mode ?? "—"} sub={badge.label} />
        <MetricCard label="Msgs / sec" value={stream.health?.msgs_in_per_sec ?? 0}
          sub={`${stream.health?.msgs_in_total ?? 0} total`} />
        <MetricCard label="Melt pool" accent={latest && latest.melt_pool_temp_c < 1400 ? C.red : C.text}
          value={latest ? `${latest.melt_pool_temp_c.toFixed(0)}°C` : "—"}
          sub={latest ? `layer ${latest.layer} · ${latest.print_job_id}` : undefined} />
        <MetricCard label="Anomalies routed" accent={anomalies.length ? C.red : C.green}
          value={anomalies.length} sub="temp<1400°C ∧ vib>0.08g" />
        <MetricCard label="Dead letters" accent={stream.dlqCount ? C.red : C.green} value={stream.dlqCount} />
      </div>

      <StreamContextStrip health={stream.health} latestAgg={printerAgg.at(-1) ?? agg.at(-1) ?? null} />

      {printers.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {printers.map((id) => (
            <button key={id} type="button" onClick={() => setSelected(id)}
              style={{ fontFamily: C.mono, fontSize: 11, padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                color: id === printer ? C.text : C.dim,
                background: id === printer ? "rgba(63,177,232,0.12)" : C.panel,
                border: `1px solid ${id === printer ? C.cyan + "66" : C.border}` }}>
              {id}
            </button>
          ))}
        </div>
      )}

      <SplitGrid variant="five-seven" style={{ marginBottom: 14 }}>
        <Panel title={`Toolhead — ${printer ?? "no printer"}`} pad={10}>
          {show3D ? (
            <>
              <PrinterHead3D points={printerPoints} />
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8 }}>
                Melt-pool sphere tracks live x/y/z; color tracks temperature (white-hot nominal, dark red below 1400°C).
              </div>
            </>
          ) : (
            <>
              <RowCard title={printer ?? "no printer"}
                tags={latest ? <Tag color={latest.melt_pool_temp_c < 1400 ? C.red : C.green}>{latest.melt_pool_temp_c.toFixed(0)}°C</Tag> : undefined}
                fields={[
                  { label: "x / y / z", value: latest ? `${latest.x.toFixed(0)} · ${latest.y.toFixed(0)} · ${latest.z.toFixed(1)}` : "—" },
                  { label: "Layer", value: latest ? String(latest.layer) : "—" },
                  { label: "Deposition", value: latest ? `${latest.deposition_rate_kg_hr.toFixed(1)} kg/hr` : "—" },
                  { label: "Vibration", value: latest ? `${latest.arm_vibration_g.toFixed(3)}g` : "—" },
                ]} />
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.faint, marginTop: 8 }}>
                Live toolhead state. The 3D view renders on larger screens.
              </div>
            </>
          )}
        </Panel>
        <Panel title="Melt pool vs arm vibration — 60s window" pad={10}>
          <TempVibrationChart points={printerPoints} agg={printerAgg} anomalies={printerAnomalies}
            highlight={highlight} />
        </Panel>
      </SplitGrid>

      <div style={{ marginBottom: 14 }}>
        <RulesVsBaselineLane scored={stream.scored} />
      </div>

      <SplitGrid variant="halves">
        <Panel title="Anomaly ticker" pad={0}
          right={<Tag color={printerAnomalies.length ? C.red : C.green}>{printerAnomalies.length} on {printer ?? "—"}</Tag>}>
          {printerAnomalies.length === 0 ? (
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint, padding: 14 }}>
              No routed anomalies for this printer yet. A pre-failure print job will cross both thresholds.
            </div>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {[...printerAnomalies].reverse().slice(0, 50).map((a, i) => (
                // Row click inspects the anomaly (raw event / scorer / provenance, deep-linkable); the
                // dedicated "lineage →" button opens the Kafka→triage→Databricks→serving lineage drawer.
                // Two sibling buttons (never nested) so both interactions stay valid + keyboard-reachable.
                <div key={`${a.ts_us}-${i}`} style={{ display: "flex", gap: 12, alignItems: "center",
                  padding: "8px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11 }}>
                  <button type="button" onClick={() => inspect(a)}
                    title="Inspect this anomaly back to its source event and provenance"
                    style={{ display: "flex", gap: 12, flex: 1, minWidth: 0, textAlign: "left",
                      background: "transparent", border: "none", cursor: "pointer",
                      fontFamily: C.mono, fontSize: 11, color: "inherit" }}>
                    <span style={{ color: C.faint }}>{new Date(a.ts_us / 1000).toLocaleTimeString([], { hour12: false })}</span>
                    <span style={{ color: C.red }}>{a.melt_pool_temp_c.toFixed(0)}°C</span>
                    <span style={{ color: C.amber }}>{a.arm_vibration_g.toFixed(3)}g</span>
                    <span style={{ color: C.dim }}>layer {a.layer}</span>
                    <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis" }}>{a.print_job_id}</span>
                  </button>
                  <button type="button"
                    onClick={() => setLineageAnomalyId(anomalyLineageId(a.printer_id, a.ts_us))}
                    title="Show lineage — Kafka → triage → Databricks → serving"
                    style={{ color: C.cyan, background: "transparent", border: "none", cursor: "pointer",
                      fontFamily: C.mono, fontSize: 11, whiteSpace: "nowrap" }}>
                    lineage →
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}`, display: "flex",
            alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.faint }}>
              {anomalies.length} routed · real SSE rows over a recorded-capture replay · all printers
            </span>
            <ExportToCsvButton filename="stargate_anomalies" columns={ANOMALY_EXPORT_COLUMNS}
              rows={anomalyExportRows(anomalies)} label="Export CSV"
              disabledReason="No routed anomalies yet" />
          </div>
        </Panel>
        <DlqPanel rows={dlq} count={stream.dlqCount} />
      </SplitGrid>

      <AnomalyInspectionDrawer
        anomaly={inspected}
        envId={TELEMETRY_DEMO_ENV_ID}
        businessId={TELEMETRY_DEMO_BUSINESS_ID}
        onClose={closeInspect}
        onViewWindow={viewWindow}
      />
      <StreamLineageDrawer
        anomalyId={lineageAnomalyId}
        servingEnvId={TELEMETRY_DEMO_ENV_ID}
        businessId={TELEMETRY_DEMO_BUSINESS_ID}
        routeEnvId={TELEMETRY_DEMO_ENV_ID}
        onClose={() => setLineageAnomalyId(null)}
      />
    </div>
  );
}
