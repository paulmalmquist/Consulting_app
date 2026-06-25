"use client";

// Anomaly inspection drawer — inspect a routed anomaly back to its source: the raw event, the 5s/15s/60s
// feature window, the hard rule result, the baseline scorer (rolling-MAD residual — never an LSTM), the
// routing outcome, and the Kafka provenance. In capture mode the provenance coordinates are synthesized
// and LABELED synthetic; the "Open durable serving row" button proves the durable serving row when the
// T2 sink is enabled, and fails closed with two distinct reasons otherwise.

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { C, Tag, verdictColor } from "../primitives";
import type { AnomalyRow, WindowStat } from "@/lib/lab/stargateStream";

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

function show(v: unknown): React.ReactNode {
  if (!present(v)) return <span style={{ color: C.faint }}>Unavailable</span>;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 0.8fr) minmax(0, 1.4fr)",
      gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ color: C.faint, fontFamily: C.mono, fontSize: 9, letterSpacing: "0.09em",
        textTransform: "uppercase" }}>{label}</div>
      <div style={{ color: C.dim, fontFamily: C.mono, fontSize: 11, lineHeight: 1.5, overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 16 }}>
      <div style={{ fontFamily: C.mono, color: C.faint, fontSize: 9, letterSpacing: "0.12em",
        textTransform: "uppercase", marginBottom: 4 }}>{title}</div>
      {children}
    </section>
  );
}

function CopyButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard?.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* clipboard unavailable (e.g. insecure context) — the value is still visible on screen */
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={`Copy ${label}`}
      style={{ fontFamily: C.mono, fontSize: 10, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
        color: done ? C.green : C.dim, background: C.panel, border: `1px solid ${C.border}` }}>
      {done ? "copied" : `copy ${label}`}
    </button>
  );
}

function windowRow(label: string, w: WindowStat | undefined): React.ReactNode {
  if (!w || w.n === 0) return <span style={{ color: C.faint }}>Unavailable</span>;
  void label;
  return `n=${w.n} · avg ${w.avg_temp_c?.toFixed(1)}°C · max vib ${w.max_vib_g?.toFixed(3)}g · `
    + `temp slope ${w.temp_slope_c_per_s?.toFixed(2)}°C/s · vib slope ${w.vib_slope_g_per_s?.toFixed(4)}g/s`;
}

type DurableState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "durable_sink_not_enabled" }
  | { kind: "provenance_not_found" }
  | { kind: "found"; row: Record<string, unknown> }
  | { kind: "error"; detail: string };

export default function AnomalyInspectionDrawer({
  anomaly,
  envId,
  businessId,
  onClose,
  onViewWindow,
  registryHref,
}: {
  anomaly: AnomalyRow | null;
  envId: string;
  businessId: string;
  onClose: () => void;
  onViewWindow?: (tsUs: number) => void;
  registryHref?: string;
}) {
  const [durable, setDurable] = useState<DurableState>({ kind: "idle" });

  // Reset the durable lookup whenever a different anomaly is opened.
  useEffect(() => {
    setDurable({ kind: "idle" });
  }, [anomaly?.provenance?.kafka_topic, anomaly?.provenance?.kafka_partition, anomaly?.provenance?.kafka_offset]);

  const prov = anomaly?.provenance;
  const scorer = anomaly?.scorer;
  const rule = anomaly?.rule;
  const fw = anomaly?.feature_window;
  const eventId = prov ? `${prov.kafka_topic}:${prov.kafka_partition}:${prov.kafka_offset}` : null;

  async function openDurableRow() {
    if (!prov) return;
    setDurable({ kind: "loading" });
    const qs = new URLSearchParams({
      env_id: envId, business_id: businessId, topic: prov.kafka_topic,
      partition: String(prov.kafka_partition), offset: String(prov.kafka_offset),
    });
    try {
      const res = await fetch(`/api/telemetry/stargate/provenance?${qs.toString()}`);
      const body = await res.json().catch(() => ({}));
      const reason = body?.null_reason;
      if (reason === "durable_sink_not_enabled") setDurable({ kind: "durable_sink_not_enabled" });
      else if (reason === "provenance_not_found" || res.status === 404) setDurable({ kind: "provenance_not_found" });
      else if (body?.row) setDurable({ kind: "found", row: body.row });
      else setDurable({ kind: "error", detail: `unexpected response (${res.status})` });
    } catch {
      setDurable({ kind: "error", detail: "provenance route unreachable" });
    }
  }

  return (
    <Dialog.Root open={Boolean(anomaly)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.52)", zIndex: 70 }} />
        <Dialog.Content
          className="fixed bottom-0 left-0 right-0 z-[80] max-h-[88vh] rounded-t-xl lg:bottom-auto lg:left-auto lg:right-0 lg:top-0 lg:h-screen lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-xl"
          style={{ background: C.rail, border: `1px solid ${C.borderHi}`, color: C.text,
            overflowY: "auto", padding: 20, boxShadow: "-18px 0 50px rgba(0,0,0,0.38)" }}
        >
          {anomaly && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <Dialog.Title style={{ fontFamily: C.sans, fontSize: 18, fontWeight: 700 }}>
                    Anomaly inspection
                  </Dialog.Title>
                  <Dialog.Description style={{ color: C.dim, fontFamily: C.mono, fontSize: 10,
                    lineHeight: 1.5, marginTop: 6 }}>
                    {anomaly.printer_id} · {new Date(anomaly.ts_us / 1000).toLocaleTimeString([], { hour12: false })}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" aria-label="Close anomaly inspection"
                    style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${C.borderHi}`,
                      background: C.panel, color: C.dim, cursor: "pointer", flexShrink: 0 }}>x</button>
                </Dialog.Close>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
                <Tag color={C.red}>routed: {anomaly.routing?.routed_to ?? "anomalies"}</Tag>
                {prov && (
                  <Tag color={prov.synthetic ? C.amber : C.green}>
                    {prov.provenance_source}{prov.synthetic ? " · synthetic" : ""}
                  </Tag>
                )}
                {onViewWindow && (
                  <button type="button" onClick={() => onViewWindow(anomaly.ts_us)}
                    style={{ fontFamily: C.mono, fontSize: 10, padding: "3px 8px", borderRadius: 6,
                      cursor: "pointer", color: C.cyan, background: "rgba(103,232,249,0.1)",
                      border: `1px solid ${C.cyan}55` }}>
                    View surrounding 60 seconds
                  </button>
                )}
              </div>

              <Section title="Raw event">
                <Row label="Printer" value={show(anomaly.printer_id)} />
                <Row label="Print job" value={show(anomaly.print_job_id)} />
                <Row label="Layer" value={show(anomaly.layer)} />
                <Row label="Melt pool" value={`${anomaly.melt_pool_temp_c.toFixed(1)}°C`} />
                <Row label="Arm vibration" value={`${anomaly.arm_vibration_g.toFixed(4)}g`} />
              </Section>

              <Section title="Feature window (rolling)">
                <Row label="5s" value={windowRow("5s", fw?.w5s)} />
                <Row label="15s" value={windowRow("15s", fw?.w15s)} />
                <Row label="60s" value={windowRow("60s", fw?.w60s)} />
              </Section>

              <Section title="Rule">
                <Row label="Predicate" value={show(rule?.predicate)} />
                <Row label="Fired" value={rule ? show(rule.fired) : show(undefined)} />
                <Row label="Cold pool" value={rule ? `${rule.temp_c.toFixed(0)}°C < 1400°C` : show(undefined)} />
                <Row label="Shaking arm" value={rule ? `${rule.vib_g.toFixed(3)}g > 0.08g` : show(undefined)} />
              </Section>

              <Section title="Baseline scorer">
                {scorer && (scorer.model_not_configured || scorer.score === null) ? (
                  <Row label="Score" value={
                    <span style={{ color: C.faint }}>
                      Not available — {scorer.null_reason ?? "model_not_configured"}
                    </span>
                  } />
                ) : (
                  <>
                    <Row label="Model" value={show(scorer?.name)} />
                    <Row label="Version" value={show(scorer?.version)} />
                    <Row label="Verdict" value={
                      <Tag color={verdictColor(scorer?.verdict)}>{show(scorer?.verdict)}</Tag>
                    } />
                    <Row label="Score" value={scorer?.score != null ? scorer.score.toFixed(3) : show(undefined)} />
                    <Row label="Threshold" value={show(scorer?.threshold)} />
                  </>
                )}
                {registryHref && (
                  <div style={{ marginTop: 8 }}>
                    <a href={registryHref} style={{ fontFamily: C.mono, fontSize: 10, color: C.cyan }}>
                      Open model card (registry) →
                    </a>
                  </div>
                )}
              </Section>

              <Section title="Routing">
                <Row label="Routed to" value={show(anomaly.routing?.routed_to)} />
                <Row label="Reason" value={show(anomaly.routing?.reason)} />
              </Section>

              <Section title="Provenance">
                {prov ? (
                  <>
                    <div style={{ fontFamily: C.mono, fontSize: 10, lineHeight: 1.5,
                      color: prov.synthetic ? C.amber : C.green, marginBottom: 6 }}>
                      {prov.synthetic
                        ? "Recorded capture — synthetic coordinates (deterministic), not a live broker."
                        : "Live broker coordinates."}
                    </div>
                    <Row label="Topic" value={show(prov.kafka_topic)} />
                    <Row label="Partition" value={show(prov.kafka_partition)} />
                    <Row label="Offset" value={show(prov.kafka_offset)} />
                    <Row label="Schema id" value={show(prov.schema_id)} />
                    <Row label="Schema null reason" value={show(prov.schema_null_reason)} />
                    <Row label="Capture id" value={show(prov.capture_id)} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {eventId && <CopyButton label="event id" text={eventId} />}
                      <CopyButton label="topic/partition/offset"
                        text={`${prov.kafka_topic} / ${prov.kafka_partition} / ${prov.kafka_offset}`} />
                      <CopyButton label="raw payload" text={JSON.stringify(anomaly, null, 2)} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button type="button" onClick={openDurableRow} disabled={durable.kind === "loading"}
                        style={{ fontFamily: C.mono, fontSize: 11, padding: "6px 12px", borderRadius: 7,
                          cursor: durable.kind === "loading" ? "default" : "pointer", color: C.text,
                          background: "rgba(103,232,249,0.12)", border: `1px solid ${C.cyan}55` }}>
                        {durable.kind === "loading" ? "Opening…" : "Open durable serving row"}
                      </button>
                      <div style={{ marginTop: 8, fontFamily: C.mono, fontSize: 10, lineHeight: 1.5 }}>
                        {durable.kind === "durable_sink_not_enabled" && (
                          <span style={{ color: C.faint }}>
                            Durable sink not enabled in this deployment — provenance shown from the live stream.
                          </span>
                        )}
                        {durable.kind === "provenance_not_found" && (
                          <span style={{ color: C.amber }}>
                            No durable serving row for these coordinates yet (provenance_not_found).
                          </span>
                        )}
                        {durable.kind === "found" && (
                          <span style={{ color: C.green }}>
                            Durable serving row found — ingested_at {show(durable.row.ingested_at)}.
                          </span>
                        )}
                        {durable.kind === "error" && (
                          <span style={{ color: C.red }}>{durable.detail}</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div style={{ fontFamily: C.mono, fontSize: 11, color: C.faint }}>
                    Provenance unavailable on this anomaly (older bridge frame).
                  </div>
                )}
              </Section>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
