"use client";

// Mission Control — RS Demo live stream page (port of rs_jsx/HotFireMissionControl.jsx onto the
// real streaming slice). 1 s polling, synchronized recharts strips over the last 120 s ring window,
// anomaly overlays from live tel_anomaly_events, a measured latency overlay, and a fail-closed
// STALE banner (charts freeze — no interpolation, no synthetic advancement).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, XAxis, YAxis,
} from "recharts";

import { getModelPerformance, TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "@/lib/telemetry/api";
import {
  deriveLag, startStream, STREAM_REASON_HINT, useStreamPoll,
  type StreamChannel, type StreamEvent, type StreamLive,
} from "@/lib/telemetry/stream";
import { SplitGrid } from "./primitives";
import { RS, RS_MONO, RS_SANS, RsChip, RsPanel } from "./rsTokens";

const WINDOW_S = 120;
const MAX_STRIPS = 4;

function sourceChip(live: StreamLive | null): { label: string; color: string } {
  if (!live) return { label: "CONNECTING", color: RS.faint };
  if (live.pipeline.status === "stale") return { label: "STALE", color: RS.red };
  if (live.pipeline.status === "failed") return { label: "FAILED", color: RS.red };
  // No channels rendering = nothing to show; label it NOT AVAILABLE rather than implying a live feed.
  if (live.channels.length === 0) return { label: "NOT AVAILABLE", color: RS.dim };
  switch (live.source) {
    case "iss": return { label: "LIVE · ISS", color: RS.green };
    case "capture": return { label: "CAPTURE (recorded live session)", color: RS.amber };
    case "adsb": return { label: "ADS-B FALLBACK", color: RS.violet };
    default: return { label: "DB TAIL", color: RS.dim };
  }
}

// Age a PIPELINE surface row from its own as_of_ts so the panel stays honest even
// if whatever writes the row stops. A surface re-stamped on a fixed cadence (e.g. the
// broker row, refreshed every ~15 min by a scheduled job) must visibly age rather than
// imply its last status is still current. Threshold = 2× the 15-min cadence.
const SURFACE_STALE_AFTER_MS = 30 * 60 * 1000;
function surfaceAge(asOfTs: string | null, nowMs: number): { label: string; stale: boolean } {
  if (!asOfTs) return { label: "", stale: false };
  const t = Date.parse(asOfTs);
  if (Number.isNaN(t)) return { label: "", stale: false };
  const ageMs = Math.max(0, nowMs - t);
  const mins = Math.floor(ageMs / 60000);
  const label = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
  return { label, stale: ageMs > SURFACE_STALE_AFTER_MS };
}

function activeVerdict(events: StreamEvent[], nowS: number): { text: string; color: string } {
  const active = events.some((e) => e.end_t >= nowS - 60);
  return active ? { text: "NO-GO HOLD", color: RS.red } : { text: "GO", color: RS.green };
}

function ChannelStrip({ ch, events, domain }: {
  ch: StreamChannel; events: StreamEvent[]; domain: [number, number];
}) {
  const data = ch.readings.map((r) => ({ x: Date.parse(r.t), v: r.v }));
  const chEvents = events.filter((e) => e.channel_name === ch.channel_name);
  const vals = data.map((d) => d.v);
  const vMin = vals.length ? Math.min(...vals) : 0;
  const vMax = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max((vMax - vMin) * 0.15, Math.abs(vMax) * 0.002, 0.01);
  return (
    <div style={{ borderBottom: `1px solid ${RS.line}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        padding: "6px 12px 0" }}>
        <span style={{ color: RS.dim, fontFamily: RS_SANS, fontSize: 11 }}>
          {ch.channel_name}{ch.unit ? ` · ${ch.unit}` : ""}
        </span>
        <span style={{ color: RS.cyan, fontFamily: RS_MONO, fontSize: 11 }}>
          {ch.latest ? ch.latest.v.toFixed(2) : "—"} {ch.unit ?? ""}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={96}>
        <ComposedChart data={data} syncId="rs-stream" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="x" type="number" domain={domain} hide />
          <YAxis domain={[vMin - pad, vMax + pad]} width={64}
            tick={{ fill: RS.faint, fontSize: 9, fontFamily: RS_MONO }}
            tickFormatter={(v: number) => v.toFixed(1)} axisLine={false} tickLine={false} />
          {ch.redline_low != null && (
            <ReferenceLine y={ch.redline_low} stroke={RS.red} strokeOpacity={0.45} strokeDasharray="4 3" />
          )}
          {ch.redline_high != null && (
            <ReferenceLine y={ch.redline_high} stroke={RS.red} strokeOpacity={0.45} strokeDasharray="4 3" />
          )}
          {chEvents.map((e, i) => (
            <ReferenceArea key={i} x1={e.start_t * 1000} x2={e.end_t * 1000}
              fill={RS.red} fillOpacity={0.1} stroke={RS.red} strokeOpacity={0.3} strokeDasharray="3 3" />
          ))}
          <Line dataKey="v" stroke={RS.cyan} dot={false} strokeWidth={1.4}
            isAnimationActive={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MissionControlStream() {
  const [hold, setHold] = useState(false);
  const { live, error, clientNowMs } = useStreamPoll(1000, hold);
  const [selected, setSelected] = useState<string[]>([]);
  const [champion, setChampion] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState<string | null>(null);
  const lagHistory = useRef<number[]>([]);

  const handleStart = async () => {
    setStarting(true);
    setStartMsg(null);
    try {
      const r = await startStream();
      setStartMsg(r.status === "already_running"
        ? `already running (${r.source})`
        : `${r.status} (${r.source}) — frames flowing shortly`);
    } catch (e) {
      setStartMsg(`start failed: ${String(e)}`);
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    getModelPerformance(TELEMETRY_DEMO_ENV_ID, TELEMETRY_DEMO_BUSINESS_ID)
      .then((d) => {
        const champ = (d.models || []).find(
          (m) => m.model_kind === "anomaly" && (m.model_alias === "champion" || m.promotion_state === "promoted"));
        if (champ) setChampion(`${champ.model_name} v${champ.model_version} (champion)`);
      })
      .catch(() => {});
  }, []);

  const lag = useMemo(
    () => (live ? deriveLag(live, clientNowMs) : { ingestLagS: null, clientLagS: null }),
    [live, clientNowMs]);
  useEffect(() => {
    if (lag.ingestLagS != null) {
      lagHistory.current = [...lagHistory.current.slice(-59), lag.ingestLagS];
    }
  }, [lag.ingestLagS]);

  const allNames = useMemo(() => (live?.channels || []).map((c) => c.channel_name), [live]);
  const shown = useMemo(() => {
    const wanted = selected.length ? selected : allNames;
    return (live?.channels || []).filter((c) => wanted.includes(c.channel_name)).slice(0, MAX_STRIPS);
  }, [live, selected, allNames]);

  const serverMs = live ? Date.parse(live.server_ts) : Date.now();
  const domain: [number, number] = [serverMs - WINDOW_S * 1000, serverMs];
  const chip = sourceChip(live);
  const stale = live != null && live.pipeline.status !== "fresh" && live.pipeline.status !== "unknown";
  const verdict = live ? activeVerdict(live.events, serverMs / 1000) : { text: "—", color: RS.faint };

  return (
    <div style={{ minHeight: "100vh", width: "100%", padding: 12, background: RS.bg,
      fontFamily: RS_SANS, color: RS.text }}>
      {/* STALE banner — fail closed, full width, charts freeze (data simply stops advancing) */}
      {stale && (
        <div style={{ background: `${RS.red}22`, border: `1px solid ${RS.red}`, borderRadius: 6,
          padding: "10px 14px", marginBottom: 12, fontFamily: RS_MONO, fontSize: 13, color: RS.red }}>
          {live!.pipeline.status.toUpperCase()} — feed lost {live!.pipeline.as_of_ts ?? "(unknown)"}
          {live!.pipeline.reason ? ` · ${live!.pipeline.reason}` : ""} · charts frozen, no interpolation
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "0 4px 12px" }}>
        <div>
          <div style={{ color: RS.faint, fontSize: 11, letterSpacing: "0.18em" }}>TELEMETRY LAB</div>
          <div style={{ fontSize: 13, letterSpacing: "0.14em" }}>MISSION CONTROL · LIVE STREAM</div>
        </div>
        <RsChip color={RS.cyan}>run: iss_live:stream</RsChip>
        <RsChip color={chip.color}>{chip.label}</RsChip>
        {champion && <RsChip color={RS.violet}>model: {champion}</RsChip>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: RS.dim, fontFamily: RS_MONO, fontSize: 11 }}>
            ingest lag {lag.ingestLagS != null ? `${lag.ingestLagS.toFixed(1)}s` : "—"}
            {" · "}client lag {lag.clientLagS != null ? `${lag.clientLagS.toFixed(1)}s` : "—"}
          </span>
          <span style={{ color: verdict.color, border: `1px solid ${verdict.color}`,
            background: `${verdict.color}18`, fontFamily: RS_MONO, fontWeight: 700,
            padding: "4px 12px", borderRadius: 4, fontSize: 13 }}>
            {verdict.text}
          </span>
          <button type="button" onClick={handleStart} disabled={starting}
            title="Start (or restart) the live ingest worker on the backend"
            style={{ fontFamily: RS_MONO, fontSize: 11, fontWeight: 700, padding: "4px 12px",
              borderRadius: 4, cursor: starting ? "default" : "pointer",
              color: starting ? RS.faint : RS.bg,
              background: starting ? "transparent" : RS.green,
              border: `1px solid ${starting ? RS.line : RS.green}` }}>
            {starting ? "Starting…" : "Start stream"}
          </button>
          <button type="button" onClick={() => setHold((h) => !h)}
            style={{ fontFamily: RS_MONO, fontSize: 11, padding: "4px 10px", borderRadius: 4,
              cursor: "pointer", color: hold ? RS.bg : RS.dim,
              background: hold ? RS.amber : "transparent", border: `1px solid ${RS.line}` }}>
            {hold ? "Resume" : "Hold"}
          </button>
        </div>
      </div>

      {startMsg && (
        <div style={{ padding: "0 4px 8px", fontFamily: RS_MONO, fontSize: 11,
          color: startMsg.startsWith("start failed") ? RS.red : RS.green }}>
          stream control: {startMsg}
        </div>
      )}

      {error && !live && (
        <RsPanel><div style={{ padding: 16, fontFamily: RS_MONO, fontSize: 12, color: RS.red }}>
          Could not load the stream: {error}
        </div></RsPanel>
      )}
      {live && live.channels.length === 0 && (
        <RsPanel title="STREAM NOT AVAILABLE">
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}
            data-testid="stream-unavailable">
            <div style={{ fontFamily: RS_MONO, fontSize: 12, color: RS.amber }}>
              Not available — <span style={{ color: RS.red }}>{live.null_reason ?? "no_stream_data"}</span>
            </div>
            <div style={{ fontFamily: RS_SANS, fontSize: 12.5, color: RS.text }}>
              {STREAM_REASON_HINT[live.null_reason ?? "no_stream_data"] ?? STREAM_REASON_HINT.no_stream_data}
            </div>
            <div style={{ fontFamily: RS_MONO, fontSize: 10.5, color: RS.faint }}>
              worker in this process: {live.worker_present ? "running" : "not running"} · pipeline:{" "}
              {live.pipeline.status}{live.pipeline.reason ? ` (${live.pipeline.reason})` : ""} · server_ts {live.server_ts}
            </div>
            <div style={{ fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>
              No synthetic or interpolated values are rendered in place of a missing feed.
            </div>
          </div>
        </RsPanel>
      )}

      {live && live.channels.length > 0 && (
        <SplitGrid variant="wide-main-side">
          {/* Left: channel selector ribbon + synced strips */}
          <RsPanel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px",
              borderBottom: `1px solid ${RS.line}` }}>
              {allNames.map((name) => {
                const on = (selected.length ? selected : allNames.slice(0, MAX_STRIPS)).includes(name);
                return (
                  <button key={name} type="button"
                    onClick={() => setSelected((cur) => {
                      const base = cur.length ? cur : allNames.slice(0, MAX_STRIPS);
                      return base.includes(name)
                        ? base.filter((n) => n !== name)
                        : [...base, name].slice(-MAX_STRIPS);
                    })}
                    style={{ fontFamily: RS_MONO, fontSize: 10, padding: "3px 8px", borderRadius: 999,
                      cursor: "pointer", color: on ? RS.cyan : RS.faint,
                      border: `1px solid ${on ? RS.cyan + "55" : RS.line}`,
                      background: on ? `${RS.cyan}14` : "transparent" }}>
                    {name}
                  </button>
                );
              })}
            </div>
            {shown.map((ch) => (
              <ChannelStrip key={ch.channel_name} ch={ch} events={live.events} domain={domain} />
            ))}
            <div style={{ padding: "6px 12px", fontFamily: RS_MONO, fontSize: 10, color: RS.faint }}>
              window: last {WINDOW_S}s · poll 1s · x-axis synced across strips
            </div>
          </RsPanel>

          {/* Right: live events + lag detail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RsPanel title="LIVE ANOMALY EVENTS (champion rule)">
              {live.events.length === 0 ? (
                <div style={{ padding: 12, fontFamily: RS_MONO, fontSize: 11, color: RS.faint }}>
                  None recorded — no NO_GO verdicts from the frozen champion on the live window.
                </div>
              ) : (
                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  {live.events.slice(0, 8).map((e, i) => (
                    <div key={i} style={{ background: RS.panelAlt, borderRadius: 4, padding: 8,
                      fontFamily: RS_MONO, fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: RS.red }}>{e.channel_name}</span>
                        <span style={{ color: RS.faint }}>{e.anomaly_class}</span>
                      </div>
                      <div style={{ color: RS.dim }}>
                        {new Date(e.start_t * 1000).toISOString().slice(11, 19)}
                        {" → "}
                        {new Date(e.end_t * 1000).toISOString().slice(11, 19)} UTC
                        {e.confidence != null ? ` · score ${e.confidence.toFixed(2)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </RsPanel>

            <RsPanel title="LATENCY">
              <div style={{ padding: 12, fontFamily: RS_MONO, fontSize: 11, color: RS.dim }}>
                <div>ingest lag (server_ts − newest ts_source): <span style={{ color: RS.cyan }}>
                  {lag.ingestLagS != null ? `${lag.ingestLagS.toFixed(2)}s` : "—"}</span></div>
                <div>client lag (now − server_ts): <span style={{ color: RS.cyan }}>
                  {lag.clientLagS != null ? `${lag.clientLagS.toFixed(2)}s` : "—"}</span>
                  <span style={{ color: RS.faint }}> (includes client clock skew)</span></div>
                <div style={{ marginTop: 8, display: "flex", gap: 2, alignItems: "flex-end", height: 28 }}>
                  {lagHistory.current.slice(-40).map((v, i) => (
                    <div key={i} style={{ width: 4, background: v > 2 ? RS.amber : RS.teal,
                      height: Math.min(28, 4 + v * 10) }} />
                  ))}
                </div>
                <div style={{ color: RS.faint, marginTop: 4 }}>ingest-lag history (last 40 polls)</div>
              </div>
            </RsPanel>

            <RsPanel title="PIPELINE">
              <div style={{ padding: 12, fontFamily: RS_MONO, fontSize: 11 }}>
                {Object.entries(live.pipeline.surfaces).map(([surface, s]) => {
                  const age = surfaceAge(s.as_of_ts, Date.now());
                  // A stale-dated row reads red regardless of its stored status — the
                  // refresh lapsed, so the last status can't be trusted as current.
                  const isFresh = s.status === "fresh" && !age.stale;
                  return (
                    <div key={surface} style={{ display: "flex", justifyContent: "space-between",
                      padding: "3px 0", color: RS.dim }}>
                      <span>{surface}</span>
                      <span style={{ color: isFresh ? RS.green : RS.red }}>
                        {age.stale ? `STALE (${age.label})` : s.status}
                        {s.reason ? ` · ${s.reason}` : ""}
                        {!age.stale && age.label ? ` · ${age.label}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </RsPanel>
          </div>
        </SplitGrid>
      )}

      {/* Demo-honesty footnote (owner-mandated acceptance gate) */}
      <div style={{ paddingTop: 12, textAlign: "center", fontSize: 11, color: RS.faint,
        fontFamily: RS_SANS, lineHeight: 1.6 }}>
        Live stream source is public ISS telemetry adapted to the RS-style telemetry interface; the
        production equivalent would be test-stand hot-fire channels. Live channels are normalized to
        fractional deviation before the frozen champion rule scores them (declared adaptation). No
        synthetic values are rendered as live or measured; a lost feed shows STALE, never interpolation.
      </div>
    </div>
  );
}
