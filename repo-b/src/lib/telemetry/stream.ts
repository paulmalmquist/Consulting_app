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
  pipeline: StreamPipeline;
  channels: StreamChannel[];
  events: StreamEvent[];
  null_reason: string | null;
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
