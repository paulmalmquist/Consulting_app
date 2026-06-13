"use client";

// Stargate Live — printer telemetry console fed by the SSE bridge.
// Status strip (mode, throughput, aggregation engine badge), live 3D toolhead
// view, dual-axis temp/vibration chart with anomaly bands, anomaly ticker, and
// the DLQ feed. Full-bleed inside TelemetryShell like every telemetry page.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { C, EmptyState, MetricCard, PageHeading, Panel, RowCard, SplitGrid, Tag } from "../primitives";
import DlqPanel from "./DlqPanel";
import TempVibrationChart from "./TempVibrationChart";
import { useStargateStream } from "@/lib/lab/stargateStream";
import { useIsMobile } from "@/hooks/useIsMobile";

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
  const [selected, setSelected] = useState<string | null>(null);
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

  // Fail closed: a deployment without a configured bridge URL shows an explicit
  // diagnostic instead of silently trying (and failing) to reach localhost.
  // Placed after all hooks so the rules of hooks hold.
  if (!stream.configured) {
    return (
      <div>
        <PageHeading
          eyebrow="Stargate Live"
          title="Printer telemetry stream"
          blurb="Protobuf telemetry over Kafka, windowed in flight, anomalies routed to their own topic."
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
      <PageHeading
        eyebrow="Stargate Live"
        title="Printer telemetry stream"
        blurb="Protobuf telemetry over Kafka, windowed in flight, anomalies routed to their own topic. Live state is ring-buffered in the bridge — no database in the hot path."
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Tag color={stream.connected ? C.green : C.red}>{stream.connected ? "stream live" : "reconnecting"}</Tag>
            <Tag color={badge.color}>{badge.label}</Tag>
          </div>
        }
      />

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
          <TempVibrationChart points={printerPoints} agg={printerAgg} anomalies={printerAnomalies} />
        </Panel>
      </SplitGrid>

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
                <div key={`${a.ts_us}-${i}`} style={{ display: "flex", gap: 12, padding: "8px 14px",
                  borderBottom: `1px solid ${C.border}`, fontFamily: C.mono, fontSize: 11 }}>
                  <span style={{ color: C.faint }}>{new Date(a.ts_us / 1000).toLocaleTimeString([], { hour12: false })}</span>
                  <span style={{ color: C.red }}>{a.melt_pool_temp_c.toFixed(0)}°C</span>
                  <span style={{ color: C.amber }}>{a.arm_vibration_g.toFixed(3)}g</span>
                  <span style={{ color: C.dim }}>layer {a.layer}</span>
                  <span style={{ color: C.faint, overflow: "hidden", textOverflow: "ellipsis" }}>{a.print_job_id}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <DlqPanel rows={dlq} count={stream.dlqCount} />
      </SplitGrid>
    </div>
  );
}
