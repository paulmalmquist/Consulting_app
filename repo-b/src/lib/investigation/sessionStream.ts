"use client";

// Investigation session SSE client (plan PR 7). Consumes the named-event stream from
// the PR 6 backend (/api/ade/analytics/sessions/{id}/stream) via fetch + ReadableStream
// (NOT EventSource: we need named events, query params, and NO auto-reconnect — a
// reconnect would restart a session). Renders ONLY events the backend sends; missing
// sections surface their null_reason. No fabricated content.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

const DEFAULT_BUSINESS_ID = "7e1eb000-0000-4000-a000-000000000001";

export type SessionEventType =
  | "session.created" | "context.captured" | "plan.generated"
  | "section.started" | "metric.queried" | "chart.generated" | "section.completed"
  | "user.pause_requested" | "session.paused"
  | "user.steer_submitted" | "plan.revised" | "session.completed"
  | "error";

export interface SessionEvent {
  seq?: number;
  session_id?: string;
  run_token?: string | null;
  [key: string]: unknown;
}

export interface SectionClaim {
  source_kind?: string;
  value?: unknown;
  is_estimate?: boolean;
  source_ref?: Record<string, unknown>;
  null_reason?: string | null;
}

export interface LiveSection {
  key: string;
  title: string;
  status: "running" | "available" | "not_available";
  claims: SectionClaim[];
  null_reason: string | null;
  duration_ms?: number;
}

export interface SessionState {
  id: string;
  title: string;
  status: string;
  plan: { plan_version?: number; sections?: { key: string; title: string }[] };
  sections: LiveSection[];
  events: { seq: number; event_type: string; payload: Record<string, unknown> }[];
  deliverable_card_id: string | null;
  null_reason: string | null;
}

export interface SessionListItem {
  id: string;
  title: string;
  status: string;
  created_at: string | null;
}

// ── REST helpers (reconnect, control plane) ───────────────────────────────────
const q = (env: string, biz: string) => ({ env_id: env, business_id: biz });

export const getSession = (env: string, id: string, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch<SessionState>(`/api/ade/analytics/sessions/${encodeURIComponent(id)}`, { params: q(env, biz) });

export const listSessions = (env: string, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch<{ sessions: SessionListItem[]; null_reason: string | null }>(
    "/api/ade/analytics/sessions", { params: q(env, biz) });

export const createSession = (env: string, title: string, opts: { objective?: string; source_ref?: Record<string, unknown> } = {}, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch<{ session_id: string; status: string }>("/api/ade/analytics/sessions", {
    method: "POST",
    body: JSON.stringify({ env_id: env, business_id: biz, title, ...opts }),
  });

export const pauseSession = (env: string, id: string, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch(`/api/ade/analytics/sessions/${encodeURIComponent(id)}/pause`, {
    method: "POST", body: JSON.stringify({ env_id: env, business_id: biz }),
  });

export const resumeSession = (env: string, id: string, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch(`/api/ade/analytics/sessions/${encodeURIComponent(id)}/resume`, {
    method: "POST", body: JSON.stringify({ env_id: env, business_id: biz }),
  });

export const forkSession = (env: string, id: string, title: string | undefined, biz: string = DEFAULT_BUSINESS_ID) =>
  apiFetch<{ child_session_id: string }>(`/api/ade/analytics/sessions/${encodeURIComponent(id)}/fork`, {
    method: "POST", body: JSON.stringify({ env_id: env, business_id: biz, title }),
  });

// ── SSE stream hook ───────────────────────────────────────────────────────────
type StreamStatus = "idle" | "streaming" | "paused" | "completed" | "error";

export interface StreamHook {
  status: StreamStatus;
  title: string;
  planSections: { key: string; title: string }[];
  sections: LiveSection[];
  deliverableCardId: string | null;
  error: string | null;
  start: () => void;
  stop: () => void;
}

export function useSessionStream(env: string | null, sessionId: string, biz: string = DEFAULT_BUSINESS_ID): StreamHook {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [title, setTitle] = useState("Investigation");
  const [planSections, setPlanSections] = useState<{ key: string; title: string }[]>([]);
  const [sections, setSections] = useState<LiveSection[]>([]);
  const [deliverableCardId, setDeliverableCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const apply = useCallback((eventType: SessionEventType, data: SessionEvent) => {
    switch (eventType) {
      case "plan.generated": {
        const keys = (data.section_keys as string[]) || [];
        setPlanSections(keys.map((k) => ({ key: k, title: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })));
        setStatus("streaming");
        break;
      }
      case "section.started": {
        const key = data.section_key as string;
        setSections((prev) => prev.some((s) => s.key === key) ? prev : [
          ...prev,
          { key, title: (data.title as string) || key, status: "running", claims: [], null_reason: null },
        ]);
        break;
      }
      case "metric.queried": {
        const key = data.section_key as string;
        setSections((prev) => prev.map((s) => s.key === key ? {
          ...s,
          claims: [...s.claims, {
            source_kind: data.source_kind as string | undefined,
            value: data.value,
            is_estimate: Boolean(data.is_estimate),
            source_ref: data.source_ref as Record<string, unknown> | undefined,
            null_reason: (data.null_reason as string | null) ?? null,
          }],
        } : s));
        break;
      }
      case "section.completed": {
        const key = data.section_key as string;
        setSections((prev) => prev.map((s) => s.key === key ? {
          ...s,
          status: (data.status as LiveSection["status"]) || "available",
          null_reason: (data.null_reason as string | null) ?? null,
          duration_ms: data.duration_ms as number | undefined,
        } : s));
        break;
      }
      case "session.paused":
        setStatus("paused");
        break;
      case "session.completed": {
        const deliverable = data.deliverable as { card_id?: string | null } | undefined;
        setDeliverableCardId(deliverable?.card_id ?? null);
        setStatus("completed");
        break;
      }
      case "error":
        setError((data.error as string) || "stream error");
        setStatus("error");
        break;
      default:
        break;
    }
  }, []);

  const start = useCallback(() => {
    if (!env) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setStatus("streaming");

    (async () => {
      try {
        const base = `/api/ade/analytics/sessions/${encodeURIComponent(sessionId)}/stream`;
        const url = `${base}?env_id=${encodeURIComponent(env)}&business_id=${encodeURIComponent(biz)}`;
        const resp = await fetch(url, { signal: controller.signal, headers: { Accept: "text/event-stream" } });
        if (!resp.ok || !resp.body) {
          setError(`stream failed (${resp.status})`);
          setStatus("error");
          return;
        }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        // Read until the stream ends. NO auto-reconnect (a reconnect restarts a session).
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              try {
                apply(currentEvent as SessionEventType, JSON.parse(line.slice(6)));
              } catch {
                /* skip malformed frame */
              }
            }
          }
        }
        setStatus((s) => (s === "streaming" ? "completed" : s));
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return; // intentional stop
        setError(e instanceof Error ? e.message : "stream error");
        setStatus("error");
      }
    })();
  }, [env, sessionId, biz, apply]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Seed title from reconnect state, then begin streaming.
  useEffect(() => {
    if (!env) return;
    let cancelled = false;
    getSession(env, sessionId, biz)
      .then((s) => {
        if (cancelled) return;
        setTitle(s.title || "Investigation");
        if (Array.isArray(s.sections)) {
          setSections(s.sections.map((sec) => ({
            key: sec.key, title: sec.title || sec.key,
            status: sec.status, claims: sec.claims || [], null_reason: sec.null_reason ?? null,
          })));
        }
        if (s.deliverable_card_id) setDeliverableCardId(s.deliverable_card_id);
      })
      .catch(() => { /* reconnect read is best-effort; stream still drives UI */ });
    start();
    return () => { cancelled = true; abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env, sessionId, biz]);

  return { status, title, planSections, sections, deliverableCardId, error, start, stop };
}
