"use client";

// Mission Control — a full-bleed operational wall that COMPOSES existing platform state
// (live telemetry, intelligence cards/findings/reels, role agents, environment status) for
// one environment. It adds NO new intelligence: no analyzers, no agent runs, no LLM, no
// warehouse, no fabricated telemetry or health scores. Every column fails closed with a
// stated reason when its source is unavailable.
//
// Visual language: the telemetry cockpit's RS palette (rsTokens) — not designed from scratch.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { useEnv, type Environment } from "@/components/EnvProvider";
import MissionControlStream from "@/components/telemetry/MissionControlStream";
import { RS, RS_MONO, RS_SANS, RsChip, RsPanel } from "@/components/telemetry/rsTokens";
import IntelligenceCardFeed from "@/components/intelligence/IntelligenceCardFeed";
import { AgentPills, AGENT_PILL_TYPES } from "@/components/intelligence/AgentPills";
import { getCards, agentCreatedBy, type AgentType, type IntelCard } from "@/lib/intelligence/cards";
import { deriveEnvironmentStatus, statusToneColor } from "@/lib/intelligence/envStatus";
import { isTelemetryEnvironment } from "@/components/lab/environments/constants";
import { TELEMETRY_DEMO_ENV_ID } from "@/lib/telemetry/api";

// The live stream source is bound to the telemetry demo env only (MissionControlStream
// hardcodes TELEMETRY_DEMO_ENV_ID). For any other env we fail closed rather than fake a feed.
export function isDemoTelemetryEnv(env: Environment | null): boolean {
  if (!env) return false;
  return (
    isTelemetryEnvironment(env.industry) &&
    (env.slug === TELEMETRY_DEMO_ENV_ID || env.env_id === TELEMETRY_DEMO_ENV_ID)
  );
}

type FeedState = {
  cards: IntelCard[];
  loading: boolean;
  error: string | null;
  nullReason: string | null;
};

const EMPTY_COUNTS: Record<AgentType, number> = { cfo: 0, operations: 0, data_quality: 0, risk: 0 };

export default function MissionControlWall({ envId }: { envId: string }) {
  const { environments } = useEnv();
  const routeEnv = useMemo(
    () => environments.find((e) => e.env_id === envId || e.slug === envId) ?? null,
    [environments, envId],
  );
  const bizId = routeEnv?.business_id ?? null;

  // ── Intelligence Center: the route env's cards (read-only; never the default tenant) ──
  const [feed, setFeed] = useState<FeedState>({ cards: [], loading: false, error: null, nullReason: null });
  const [agentFilter, setAgentFilter] = useState<AgentType | null>(null);

  useEffect(() => {
    if (!routeEnv || !bizId) {
      setFeed({ cards: [], loading: false, error: null, nullReason: routeEnv ? "missing_business_id" : null });
      return;
    }
    let cancelled = false;
    setFeed((s) => ({ ...s, loading: true, error: null, nullReason: null }));
    getCards(routeEnv.env_id, { biz: bizId, limit: 50 })
      .then(({ cards, null_reason }) => {
        if (!cancelled) setFeed({ cards, loading: false, error: null, nullReason: null_reason ?? null });
      })
      .catch((cause) => {
        if (!cancelled) {
          setFeed({
            cards: [], loading: false,
            error: cause instanceof Error ? cause.message : "Failed to load intelligence",
            nullReason: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [routeEnv, bizId]);

  const anomalyCount = useMemo(
    () => feed.cards.filter((c) => c.anomaly_flag && !c.is_dismissed).length,
    [feed.cards],
  );

  const agentCounts = useMemo(() => {
    const counts: Record<AgentType, number> = { ...EMPTY_COUNTS };
    for (const c of feed.cards) {
      for (const t of AGENT_PILL_TYPES) if (c.created_by === agentCreatedBy(t)) counts[t] += 1;
    }
    return counts;
  }, [feed.cards]);

  const visibleCards = useMemo(
    () => (agentFilter ? feed.cards.filter((c) => c.created_by === agentCreatedBy(agentFilter)) : feed.cards),
    [feed.cards, agentFilter],
  );

  const onToggleAgent = useCallback((agent: AgentType) => {
    setAgentFilter((cur) => (cur === agent ? null : agent));
  }, []);

  // ── Fullscreen toggle: Spacebar toggles, Escape exits — never while typing. ──
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    function isTyping(): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && !isTyping()) {
        e.preventDefault(); // stop page scroll
        setFullscreen((v) => !v);
      } else if (e.key === "Escape") {
        setFullscreen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        background: RS.bg,
        color: RS.text,
        fontFamily: RS_SANS,
        minHeight: "100vh",
        padding: 12,
        position: fullscreen ? "fixed" : "relative",
        inset: fullscreen ? 0 : undefined,
        zIndex: fullscreen ? 60 : undefined,
        overflow: fullscreen ? "auto" : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <div className="flex items-baseline gap-3">
          <span style={{ fontFamily: RS_MONO, fontSize: 13, letterSpacing: "0.18em", color: RS.text }}>
            MISSION CONTROL
          </span>
          <span style={{ fontFamily: RS_MONO, fontSize: 11, color: RS.faint }}>
            {routeEnv?.client_name || routeEnv?.env_id || envId}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RsChip color={RS.dim}>{fullscreen ? "ESC TO EXIT" : "SPACE FOR WALL"}</RsChip>
          <Link
            href="/app"
            style={{ fontFamily: RS_MONO, fontSize: 11, color: RS.dim, textDecoration: "none" }}
          >
            Open Home →
          </Link>
        </div>
      </div>

      {/* 3-column grid — stacks on small screens */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* Column 1 — Live Telemetry */}
        <div>
          {isDemoTelemetryEnv(routeEnv) ? (
            <MissionControlStream />
          ) : (
            <RsPanel title="LIVE TELEMETRY">
              <div style={{ padding: 16 }}>
                <div style={{ fontFamily: RS_MONO, fontSize: 13, color: RS.amber }}>
                  Live telemetry unavailable for this environment
                </div>
                <div style={{ fontFamily: RS_SANS, fontSize: 12, color: RS.dim, marginTop: 6 }}>
                  The live stream source is bound to the telemetry demo environment only. No
                  synthetic feed is shown.
                </div>
              </div>
            </RsPanel>
          )}
        </div>

        {/* Column 2 — Intelligence Center */}
        <div className="flex flex-col gap-3">
          <RsPanel title="INTELLIGENCE CENTER">
            <div style={{ padding: 12 }}>
              <div style={{ marginBottom: 10 }}>
                <AgentPills
                  activeFilter={agentFilter}
                  counts={agentCounts}
                  onToggle={routeEnv && bizId ? onToggleAgent : null}
                />
              </div>
              <IntelligenceCardFeed
                cards={visibleCards}
                loading={feed.loading}
                error={feed.error}
                nullReason={feed.nullReason}
              />
            </div>
          </RsPanel>
        </div>

        {/* Column 3 — Environment Status Wall */}
        <div>
          <EnvironmentStatusWall
            environments={environments}
            routeEnvId={routeEnv?.env_id ?? null}
            routeAnomalyCount={anomalyCount}
          />
        </div>
      </div>

      {/* Footer ticker — recent card/agent/reel/anomaly activity for this env */}
      <ActivityTicker cards={feed.cards} loading={feed.loading} nullReason={feed.nullReason} />
    </div>
  );
}

// ── Environment Status Wall ───────────────────────────────────────────────────
// Derived CATEGORICAL status only. For the route env we have real anomaly counts (from its
// fetched cards); for other envs we derive from is_active/business_id presence — never a
// fabricated "Needs attention" from data we didn't fetch. No health_score, no percentage.
function EnvironmentStatusWall({
  environments,
  routeEnvId,
  routeAnomalyCount,
}: {
  environments: Environment[];
  routeEnvId: string | null;
  routeAnomalyCount: number;
}) {
  return (
    <RsPanel title="ENVIRONMENT STATUS">
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {environments.length === 0 ? (
          <div style={{ fontFamily: RS_SANS, fontSize: 12, color: RS.dim, padding: 8 }}>
            No environments resolved.
          </div>
        ) : (
          environments.map((env) => {
            const isRoute = env.env_id === routeEnvId;
            // Only the route env carries a real anomaly count; others pass 0 (their cards
            // were not fetched) so they never get a fabricated "Needs attention".
            const status = deriveEnvironmentStatus(
              env,
              isRoute ? routeAnomalyCount : 0,
              env.business_id ?? null,
            );
            const color = statusToneColor(status.tone);
            return (
              <div
                key={env.env_id}
                className="flex items-center justify-between gap-3"
                style={{
                  background: isRoute ? RS.panelAlt : RS.panel,
                  border: `1px solid ${isRoute ? color : RS.line}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: RS_SANS, fontSize: 12, color: RS.text }} className="truncate">
                    {env.client_name || env.env_id}
                  </div>
                  {status.reason ? (
                    <div style={{ fontFamily: RS_SANS, fontSize: 10, color: RS.faint }} className="truncate">
                      {status.reason}
                    </div>
                  ) : null}
                </div>
                <span
                  style={{
                    fontFamily: RS_MONO, fontSize: 10, letterSpacing: "0.06em", whiteSpace: "nowrap",
                    color, background: color.replace("0.95", "0.12").replace(")", ")"),
                    border: `1px solid ${color}`, borderRadius: 4, padding: "2px 7px",
                  }}
                >
                  {status.label}
                </span>
              </div>
            );
          })
        )}
      </div>
    </RsPanel>
  );
}

// ── Footer activity ticker ────────────────────────────────────────────────────
// Real platform activity from the env's cards (newest first). Fails closed to an explicit
// "Activity feed unavailable" rather than a silently empty bar.
function ActivityTicker({
  cards,
  loading,
  nullReason,
}: {
  cards: IntelCard[];
  loading: boolean;
  nullReason: string | null;
}) {
  const items = useMemo(() => {
    return [...cards]
      .sort((a, b) => (b.last_updated_at || "").localeCompare(a.last_updated_at || ""))
      .slice(0, 12);
  }, [cards]);

  const unavailable = !loading && items.length === 0;

  return (
    <div
      style={{
        marginTop: 12, background: RS.panel, border: `1px solid ${RS.line}`, borderRadius: 6,
        padding: "8px 12px", display: "flex", alignItems: "center", gap: 14, overflowX: "auto",
      }}
    >
      <span style={{ fontFamily: RS_MONO, fontSize: 10, letterSpacing: "0.12em", color: RS.faint, whiteSpace: "nowrap" }}>
        ACTIVITY
      </span>
      {unavailable ? (
        <span style={{ fontFamily: RS_SANS, fontSize: 12, color: RS.dim }}>
          {nullReason ? `Activity feed unavailable — ${nullReason}` : "Activity feed unavailable"}
        </span>
      ) : (
        items.map((c) => (
          <span key={c.id} className="flex items-center gap-2" style={{ whiteSpace: "nowrap" }}>
            <span
              style={{
                height: 6, width: 6, borderRadius: 9999,
                background: c.anomaly_flag ? RS.red : RS.teal, display: "inline-block",
              }}
            />
            <span style={{ fontFamily: RS_SANS, fontSize: 12, color: RS.dim }} className="truncate">
              {c.title}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
