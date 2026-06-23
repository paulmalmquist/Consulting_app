"use client";

// Stargate SSE client — typed contracts for the bridge frames plus a hook that
// holds everything in fixed-size circular buffers. High-frequency streams must
// never grow React state unboundedly: the buffers live in refs (preallocated
// arrays with a head pointer), and state carries only a version counter so a
// render is one integer bump per frame, not an array copy per message.

import { useCallback, useEffect, useRef, useState } from "react";

export type TelemetryPoint = {
  printer_id: string;
  ts_us: number;
  layer: number;
  print_job_id: string;
  x: number;
  y: number;
  z: number;
  melt_pool_temp_c: number;
  deposition_rate_kg_hr: number;
  arm_vibration_g: number;
};

export type AggRow = {
  printer_id: string;
  window_start_ms: number;
  window_end_ms: number;
  avg_temp_c: number;
  max_vibration_g: number;
  n: number;
};

export type AnomalyRow = {
  printer_id: string;
  ts_us: number;
  layer: number;
  print_job_id: string;
  melt_pool_temp_c: number;
  arm_vibration_g: number;
};

export type DlqRow = {
  ts_ms: number;
  topic: string;
  reason: string;
  raw_preview: string;
  raw_bytes: number;
};

export type BridgeHealth = {
  mode: "cloud" | "local" | "capture";
  aggregation_source: "flink" | "local-emulation" | "capture";
  consumer_alive: boolean;
  msgs_in_total: number;
  msgs_in_per_sec: number;
  last_message_age_ms: number | null;
  dlq_count: number;
  uptime_s: number;
};

type Frame = {
  type: "snapshot" | "delta";
  telemetry?: TelemetryPoint[];
  agg?: AggRow[];
  anomalies?: AnomalyRow[];
  dlq?: DlqRow[];
  dlq_count?: number;
  health?: BridgeHealth;
  mode?: string;
};

export class CircularBuffer<T> {
  private items: (T | undefined)[];
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.items = new Array(capacity);
  }

  push(item: T): void {
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  pushAll(batch: T[]): void {
    for (const item of batch) this.push(item);
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
    this.items = new Array(this.capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Oldest-to-newest copy. Called once per render, not per message. */
  toArray(): T[] {
    const out: T[] = [];
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i += 1) {
      out.push(this.items[(start + i) % this.capacity] as T);
    }
    return out;
  }
}

/**
 * Resolve the bridge origin, fail-closed. A deployed page must never silently
 * point the visitor's browser at their own localhost: return the configured
 * env value, the dev-only localhost fallback, or null (caller renders a
 * "not configured" diagnostic instead of connecting). Static property access on
 * both vars is deliberate — Next.js inlines NEXT_PUBLIC_* and NODE_ENV at build
 * time; a dynamic lookup would resolve to undefined in the production bundle.
 */
export function bridgeBaseUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_STARGATE_BRIDGE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "development") return "http://localhost:8100";
  return null;
}

export type StargateStream = {
  connected: boolean;
  configured: boolean;
  /** Resolved bridge origin (or null when unconfigured) — for control POSTs. */
  baseUrl: string | null;
  version: number;
  health: BridgeHealth | null;
  dlqCount: number;
  /** Force a fresh EventSource (used after restarting the capture replay). */
  reconnect: () => void;
  telemetryRef: React.MutableRefObject<CircularBuffer<TelemetryPoint>>;
  aggRef: React.MutableRefObject<CircularBuffer<AggRow>>;
  anomaliesRef: React.MutableRefObject<CircularBuffer<AnomalyRow>>;
  dlqRef: React.MutableRefObject<CircularBuffer<DlqRow>>;
};

export function useStargateStream(baseUrl?: string): StargateStream {
  const telemetryRef = useRef(new CircularBuffer<TelemetryPoint>(2000));
  const aggRef = useRef(new CircularBuffer<AggRow>(240));
  const anomaliesRef = useRef(new CircularBuffer<AnomalyRow>(200));
  const dlqRef = useRef(new CircularBuffer<DlqRow>(100));
  const [version, setVersion] = useState(0);
  const [connected, setConnected] = useState(false);
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [dlqCount, setDlqCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  const resolvedBase = baseUrl || bridgeBaseUrl();
  const reconnect = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!resolvedBase) return; // fail closed: no bridge URL → no EventSource
    const url = `${resolvedBase}/stargate/stream`;
    const source = new EventSource(url);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false); // EventSource retries on its own

    source.onmessage = (event) => {
      let frame: Frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame.type === "snapshot") {
        telemetryRef.current.clear();
        aggRef.current.clear();
        anomaliesRef.current.clear();
        dlqRef.current.clear();
      }
      if (frame.telemetry?.length) telemetryRef.current.pushAll(frame.telemetry);
      if (frame.agg?.length) aggRef.current.pushAll(frame.agg);
      if (frame.anomalies?.length) anomaliesRef.current.pushAll(frame.anomalies);
      if (frame.dlq?.length) dlqRef.current.pushAll(frame.dlq);
      if (frame.health) setHealth(frame.health);
      if (typeof frame.dlq_count === "number") setDlqCount(frame.dlq_count);
      setVersion((v) => v + 1); // one integer bump per frame (~10 Hz), not per message
    };

    return () => source.close();
  }, [resolvedBase, nonce]);

  return {
    connected,
    configured: resolvedBase !== null,
    baseUrl: resolvedBase,
    version,
    health,
    dlqCount,
    reconnect,
    telemetryRef,
    aggRef,
    anomaliesRef,
    dlqRef,
  };
}
