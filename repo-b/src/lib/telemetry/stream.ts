"use client";

// RS Demo streaming slice — typed fetchers + the 1 s poll hook for Mission Control.
// Polling (not SSE) per the slice plan; backoff on error; client clock captured per tick so the
// latency overlay can show ingest lag (server_ts - max ts_source) and client lag separately.
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import { TELEMETRY_DEMO_BUSINESS_ID, TELEMETRY_DEMO_ENV_ID } from "./api";

export interface StreamReading { t: string; v: number }

export interface StreamChannel {
  channel_name: string;
  unit: string | null;
  redline_low: number | null;
  redline_high: number | null;
  readings: StreamReading[];
  latest: StreamReading | null;
}

export interface StreamEvent {
  channel_name: string;
  start_t: number;          // epoch seconds
  end_t: number;
  anomaly_class: string;
  confidence: number | null;
}

export interface StreamPipeline {
  status: string;           // fresh | stale | failed | unknown
  as_of_ts: string | null;
  reason: string | null;
  surfaces: Record<string, { status: string; as_of_ts: string; reason: string | null }>;
}

export interface StreamLive {
  server_ts: string;
  source: string;           // capture | iss | adsb | db_tail
  worker_present?: boolean;
  pipeline: StreamPipeline;
  channels: StreamChannel[];
  events: StreamEvent[];
  null_reason: string | null;   // specific actionable reason when channels is empty (see STREAM_REASON_HINT)
}

// Actionable repair hints for each stream-absence reason the backend can emit. Keeps the UI honest:
// a reviewer sees exactly WHY the feed is dark and the next diagnostic step — never a vague blank.
export const STREAM_REASON_HINT: Record<string, string> = {
  stream_worker_disabled: "Stream worker is disabled. Set TELEMETRY_STREAM_ENABLED=1 on the backend and redeploy.",
  source_unavailable: "The stream source is unreachable. Check the adapter source (capture fixture / ISS feed).",
  no_bronze_frames: "Worker is running but no frames have landed yet — the adapter/source produced nothing.",
  etl_watermark_stalled: "Frames are landing but the ETL loop isn't advancing the silver watermark.",
  no_channel_mapping: "No channels are mapped for run_key 'iss_live:stream' — seed tel_telemetry_channels.",
  no_stream_data: "No stream data available for this environment.",
};

export const CHANNEL_DISPLAY_NAMES: Record<string, string> = {
  USLAB000058: "US Lab · cabin pressure",
  USLAB000059: "US Lab · cabin temperature",
  USLAB000062: "US Lab · ppO₂",
  USLAB000063: "US Lab · ppN₂",
  USLAB000064: "US Lab · ppCO₂",
  AIRLOCK000049: "Airlock · crewlock pressure",
  NODE3000005: "Node 3 · urine tank",
  NODE3000008: "Node 3 · waste water tank",
  NODE3000009: "Node 3 · clean water tank",
  S4000001: "S4 · 1A solar array voltage",
  S6000004: "S6 · 4B solar array voltage",
  P4000001: "P4 · 2A solar array voltage",
};

export function channelLabel(channelName: string): string {
  return CHANNEL_DISPLAY_NAMES[channelName] ?? channelName;
}

export interface StreamAssertion {
  job_name: string; table_name: string; assertion_name: string;
  passed: boolean; observed: string | null; threshold: string | null; run_ts: string;
}

export interface StreamHealth {
  server_ts: string;
  freshness: { channel_name: string; last_ts: string; age_s: number; rows: number }[];
  ingest_lag_p50_s: number | null;
  ingest_lag_p95_s: number | null;
  ingest_lag_sample_n: number;
  rows_per_min: number;
  assertions: StreamAssertion[];
  pipeline_status: { surface: string; status: string; as_of_ts: string; reason: string | null }[];
  watermarks: { job_name: string; watermark_ts: string; age_s: number }[];
  null_reason: string | null;
}

export const getStreamLive = (channels?: string[]) =>
  apiFetch<StreamLive>("/api/telemetry/stream/live", {
    params: {
      env_id: TELEMETRY_DEMO_ENV_ID,
      business_id: TELEMETRY_DEMO_BUSINESS_ID,
      ...(channels && channels.length ? { channels: channels.join(",") } : {}),
    },
  });

export const getStreamHealth = () =>
  apiFetch<StreamHealth>("/api/telemetry/stream/health", {
    params: { env_id: TELEMETRY_DEMO_ENV_ID, business_id: TELEMETRY_DEMO_BUSINESS_ID },
  });

export interface StreamControlResult {
  status: "started" | "restarted" | "already_running";
  source: string;
  env_id: string;
  last_frame_at?: string | null;
}

/** Start (or restart) the live ingest worker on the backend so frames flow again. */
export const startStream = () =>
  apiFetch<StreamControlResult>("/api/telemetry/stream/control", { method: "POST" });

/** Pure derivation for the latency overlay (unit-testable). */
export function deriveLag(live: StreamLive, clientNowMs: number): {
  ingestLagS: number | null; clientLagS: number | null;
} {
  const serverMs = Date.parse(live.server_ts);
  let newestSourceMs: number | null = null;
  for (const ch of live.channels) {
    if (ch.latest) {
      const t = Date.parse(ch.latest.t);
      if (newestSourceMs === null || t > newestSourceMs) newestSourceMs = t;
    }
  }
  return {
    ingestLagS: newestSourceMs !== null && Number.isFinite(serverMs)
      ? Math.max(0, (serverMs - newestSourceMs) / 1000) : null,
    clientLagS: Number.isFinite(serverMs) ? Math.max(0, (clientNowMs - serverMs) / 1000) : null,
  };
}

/** 1 s poll hook (FundImpactTab setInterval precedent) with backoff-on-error and hold support. */
export function useStreamPoll(intervalMs = 1000, hold = false) {
  const [live, setLive] = useState<StreamLive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientNowMs, setClientNowMs] = useState<number>(Date.now());
  const failures = useRef(0);

  useEffect(() => {
    if (hold) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      getStreamLive()
        .then((d) => {
          if (stopped) return;
          failures.current = 0;
          setLive(d);
          setError(null);
          setClientNowMs(Date.now());
        })
        .catch((e) => {
          if (stopped) return;
          failures.current += 1;
          setError(String(e));
        })
        .finally(() => {
          if (stopped) return;
          const backoff = Math.min(failures.current, 5) * 1000;
          timer = setTimeout(tick, intervalMs + backoff);
        });
    };
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [intervalMs, hold]);

  return { live, error, clientNowMs };
}
