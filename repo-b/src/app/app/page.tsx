"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSession } from "@/lib/investigation/sessionStream";

import AccountMenu from "@/components/AccountMenu";
import { useEnv, type Environment } from "@/components/EnvProvider";
import { humanIndustry } from "@/components/lab/environments/constants";
import IntelligenceCardFeed from "@/components/intelligence/IntelligenceCardFeed";
import { InvestigateButton } from "@/components/investigation/InvestigateButton";
import {
  getCards,
  upsertCard,
  dismissCard,
  runAnalyzers,
  type IntelCard,
} from "@/lib/intelligence/cards";
import { cn } from "@/lib/cn";
import {
  environmentCatalog,
  isEnvironmentSlug,
  type EnvironmentSlug,
} from "@/lib/environmentAuth";
import { switchPlatformEnvironment } from "@/lib/platformSessionClient";
import { getCapabilityConfig } from "@/lib/workspaceCapabilities";
import { resolveWorkspaceOpenPath } from "@/lib/workspaceTemplates";

function environmentTone(environment: { slug?: string | null }) {
  if (environment.slug && isEnvironmentSlug(environment.slug)) {
    const branding = environmentCatalog[environment.slug];
    return {
      glow: branding.glow,
    };
  }

  return {
    glow: "148, 163, 184",
  };
}

function assertEnvironmentClientName(environment: { env_id: string; client_name: string }) {
  const clientName = environment.client_name?.trim();
  if (!clientName) {
    throw new Error(`Malformed environment card data: missing client_name for env ${environment.env_id}`);
  }
  return clientName;
}

const SYSTEM_LINKS = [
  { href: "/lab/system/control-tower", label: "Control Tower", detail: "Provision and monitor environments" },
  { href: "/lab/system/access", label: "Access", detail: "Grant memberships and workspace visibility" },
  { href: "/lab/audit", label: "Audit", detail: "Operational review surfaces" },
  { href: "/lab/ai-audit", label: "AI Audit", detail: "Assistant and model oversight" },
  { href: "/lab/system/ai-usage", label: "AI Usage", detail: "Token spend, attribution, and savings recommendations" },
] as const;

// Novendor action color — teal/cyan, used for primary CTA and selected accents.
const ACTION_TEAL = "92, 213, 204";

// Deterministic source_ref for the one seeded dashboard card per environment.
// Seeding is idempotent: the backend upserts on (env_id, source_ref_key).
function dashboardSourceRef(envId: string) {
  return { type: "app_home_dashboard", env_id: envId };
}

// ── Agent pills: VISUAL-ONLY scaffold (PR 5). No logic, no handlers, no routing. ──
const AGENT_PILLS = [
  { label: "CFO", glow: ACTION_TEAL },
  { label: "Operations", glow: "107, 174, 127" },
  { label: "Data Quality", glow: "176, 64, 255" },
  { label: "Risk", glow: "209, 161, 91" },
] as const;

function AgentPills() {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Agents (preview)">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
        Agents
      </span>
      {AGENT_PILLS.map((agent) => (
        <span
          key={agent.label}
          aria-disabled
          title="Coming soon"
          className="inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/55"
          style={{ borderColor: `rgba(${agent.glow}, 0.22)`, background: `rgba(${agent.glow}, 0.06)` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: `rgba(${agent.glow}, 0.8)` }} />
          {agent.label}
        </span>
      ))}
    </div>
  );
}

// ── Derived environment status (PR 5) ─────────────────────────────────────────
// Honest, derived from KNOWN client-side fields only. No invented health_score,
// no numeric percentage. promotion_state is NOT available on the client Environment
// type, so its branches are forward-compat and unreachable this PR — we never fetch it.
type EnvStatusTone = "teal" | "amber" | "muted";
type EnvStatus = { label: string; tone: EnvStatusTone; reason: string | null };

const PROMO_DEGRADED = new Set(["degraded", "blocked", "failed", "error", "broken"]);
const PROMO_PENDING = new Set(["pending", "draft", "in_progress", "provisioning", "queued"]);

function deriveEnvironmentStatus(
  env: Environment | null,
  anomalyCount: number,
  bizId: string | null,
  promotionState?: string | null, // omitted by callers — forward-compat only
): EnvStatus {
  if (!env) {
    return { label: "Status unavailable", tone: "muted", reason: "No environment selected." };
  }
  if (typeof env.is_active !== "boolean" || !env.env_id) {
    return { label: "Status unavailable", tone: "muted", reason: "Required environment fields not loaded." };
  }
  // Inactive wins: a dead env's signals are moot.
  if (env.is_active === false) {
    return { label: "Inactive", tone: "amber", reason: null };
  }
  // Forward-compat (unreachable now — promotionState is always undefined).
  const ps = promotionState?.toLowerCase();
  if (ps && PROMO_DEGRADED.has(ps)) {
    return { label: "Needs attention", tone: "amber", reason: `Promotion state: ${promotionState}` };
  }
  // No tenant → intelligence cannot be scoped → fail closed (never use the default tenant).
  if (!bizId) {
    return {
      label: "Status unavailable",
      tone: "muted",
      reason: "No tenant (business_id) resolved; intelligence cannot be scoped.",
    };
  }
  // The real signal this PR ships: open anomaly cards for the scoped env.
  if (anomalyCount > 0) {
    return {
      label: "Needs attention",
      tone: "amber",
      reason: `${anomalyCount} open anomaly card${anomalyCount === 1 ? "" : "s"}.`,
    };
  }
  if (ps && PROMO_PENDING.has(ps)) {
    return { label: "In progress", tone: "teal", reason: `Promotion state: ${promotionState}` };
  }
  return { label: "Healthy", tone: "teal", reason: "Derived from active state and open cards. Promotion state not loaded." };
}

// ── Intelligence feed hook (PR 5) ─────────────────────────────────────────────
// Binds to the SELECTED environment (never hover). Fails closed when there is no
// real business_id — never falls back to the cards.ts default tenant.
type FeedState = {
  cards: IntelCard[];
  loading: boolean;
  error: string | null;
  nullReason: string | null;
};

function useIntelligenceFeed(env: Environment | null, bizId: string | null) {
  const [state, setState] = useState<FeedState>({
    cards: [],
    loading: false,
    error: null,
    nullReason: null,
  });
  // Keys we've attempted to seed this mount — guards against double-seed.
  const seededRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Fail closed: no env, or no real tenant → no fetch, no seed.
    if (!env || !bizId) {
      setState({
        cards: [],
        loading: false,
        error: null,
        nullReason: !env ? null : "missing_business_id",
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, nullReason: null }));

    (async () => {
      const seedKey = `${env.env_id}:${bizId}`;
      try {
        const { cards, null_reason } = await getCards(env.env_id, { biz: bizId, limit: 50 });
        if (cancelled) return;
        setState({ cards, loading: false, error: null, nullReason: null_reason ?? null });

        // Seed ONE dashboard card only on a clean-empty result (not failure/null_reason).
        if (cards.length === 0 && !null_reason && !seededRef.current.has(seedKey)) {
          seededRef.current.add(seedKey); // mark before await — no double-fire
          const title = env.client_name?.trim() || "Workspace";
          try {
            const created = await upsertCard(
              env.env_id,
              {
                card_type: "dashboard",
                title,
                summary: `Open the ${humanIndustry(env.industry_type || env.industry)} workspace.`,
                source_ref: dashboardSourceRef(env.env_id),
                priority_score: 0,
                anomaly_flag: false,
                created_by: "system",
              },
              bizId,
            );
            // Optimistic insert — NO refetch (avoids the eventual-consistency seed loop).
            if (!cancelled && created?.id) {
              setState((s) => ({ ...s, cards: [created, ...s.cards] }));
            }
          } catch {
            // Best-effort: seeding failure is non-fatal; seededRef already marked.
          }
        }
      } catch (cause) {
        if (cancelled) return;
        setState({
          cards: [],
          loading: false,
          error: cause instanceof Error ? cause.message : "Failed to load intelligence",
          nullReason: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Primitive deps — one fetch per (env, tenant) selection, never per hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [env?.env_id, bizId]);

  const removeCard = useCallback((cardId: string) => {
    setState((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== cardId) }));
  }, []);

  // Re-pull cards only (no seed) after a user-triggered analyzer run. Authoritative —
  // shows whatever the analyzers just upserted. Fail-closed without a real tenant.
  const refetch = useCallback(async () => {
    if (!env || !bizId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { cards, null_reason } = await getCards(env.env_id, { biz: bizId, limit: 50 });
      setState({ cards, loading: false, error: null, nullReason: null_reason ?? null });
    } catch (cause) {
      setState((s) => ({
        ...s,
        loading: false,
        error: cause instanceof Error ? cause.message : "Failed to load intelligence",
      }));
    }
  }, [env, bizId]);

  return { ...state, removeCard, refetch };
}

// ── Mode B: workspace preview (reachable via toggle) ──────────────────────────
function CenterModeB({
  environment,
  onOpen,
  isOpening,
}: {
  environment: {
    env_id: string;
    client_name: string;
    slug?: string | null;
    industry?: string | null;
    industry_type?: string | null;
    workspace_template_key?: string | null;
  };
  onOpen: () => void;
  isOpening: boolean;
}) {
  const tone = environmentTone(environment);
  const clientName = environment.client_name?.trim() || "Workspace";
  const industryLabel = humanIndustry(environment.industry_type || environment.industry);
  const capConfig = getCapabilityConfig(
    environment.workspace_template_key,
    environment.industry_type || environment.industry,
  );
  const openPath = resolveWorkspaceOpenPath(environment.env_id, {
    workspaceTemplateKey: environment.workspace_template_key,
    industryType: environment.industry_type,
    industry: environment.industry,
  });

  const ctaContent = isOpening ? "Opening…" : capConfig.entryLabel;
  const ctaClass =
    "inline-flex h-11 items-center gap-3 rounded-md px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 transition-[filter,box-shadow] duration-150 hover:brightness-110 disabled:pointer-events-none disabled:opacity-70";
  const ctaStyle = {
    background: `rgba(${ACTION_TEAL}, 0.92)`,
    boxShadow: `0 0 0 1px rgba(${ACTION_TEAL}, 0.45), 0 12px 24px -16px rgba(${ACTION_TEAL}, 0.55)`,
  } as const;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">
          {industryLabel}
        </p>
        <h2
          className="text-[clamp(1.75rem,3.2vw,2.4rem)] font-semibold leading-tight tracking-tight text-white"
          style={{ textShadow: `0 0 24px rgba(${tone.glow}, 0.10)` }}
        >
          {clientName}
        </h2>
        <p className="max-w-xl text-sm leading-6 text-white/60">
          {workspaceDescription(environment.workspace_template_key, environment.industry_type || environment.industry)}
        </p>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
          Capabilities
        </p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {capConfig.capabilities.map((cap) => (
            <li key={cap} className="flex items-center gap-2.5 text-[13px] text-white/75">
              <span
                className="inline-block h-1 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: `rgba(${ACTION_TEAL}, 0.85)` }}
              />
              {cap}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <span
          className="inline-flex items-center gap-2 rounded-sm px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{
            backgroundColor: `rgba(107, 174, 127, 0.10)`,
            color: `rgba(140, 200, 158, 0.95)`,
            border: `1px solid rgba(107, 174, 127, 0.28)`,
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: `rgba(107, 174, 127, 0.95)` }}
          />
          {capConfig.dataPhrase}
        </span>
      </div>

      <div className="pt-2">
        {openPath ? (
          <Link href={openPath} className={ctaClass} style={ctaStyle}>
            {ctaContent}
          </Link>
        ) : (
          <button type="button" onClick={onOpen} disabled={isOpening} className={ctaClass} style={ctaStyle}>
            {ctaContent}
          </button>
        )}
      </div>
    </div>
  );
}

function workspaceDescription(
  templateKey: string | null | undefined,
  industryType: string | null | undefined,
): string {
  const key = (templateKey || industryType || "").toLowerCase();
  const map: Record<string, string> = {
    repe_workspace: "Fund, asset, and capital intelligence for real estate private equity.",
    trading_platform: "Regime, signals, and execution for systematic trading.",
    pds_enterprise: "Property data ingestion, AI query, and executive briefings.",
    credit_risk_hub: "Underwriting policy, decisioning, and audit chain for consumer credit.",
    ecc_command: "Cross-entity executive command center for the operating group.",
    legal_ops_command: "Matters, contracts, and outside counsel for legal operations.",
    consulting_revenue_os: "Pipeline, engagement, and client intelligence for the consulting business.",
    discovery_lab: "AI-assisted scoping and blueprinting for new engagements.",
    data_studio: "Ingestion, mapping, and quality for the workspace data layer.",
  };
  return map[key] || "Operational workspace for the connected business surface.";
}

// ── Environment Status panel (PR 5) — derived status, NOT a health score ──────
function EnvironmentStatusPanel({
  environment,
  envStatus,
  envCount,
  variant = "desktop",
}: {
  environment: {
    env_id: string;
    client_name: string;
    slug?: string | null;
    industry?: string | null;
    industry_type?: string | null;
    workspace_template_key?: string | null;
    is_active?: boolean;
  } | null;
  envStatus: EnvStatus;
  envCount: number;
  variant?: "desktop" | "mobile";
}) {
  const tone = environment ? environmentTone(environment) : { glow: "148, 163, 184" };
  const templateLabel = environment?.workspace_template_key
    ? environment.workspace_template_key.replace(/_/g, " ")
    : "—";

  const shellClass =
    variant === "desktop"
      ? "hidden w-[280px] shrink-0 xl:block"
      : "block xl:hidden";

  return (
    <aside className={shellClass}>
      <div
        className="rounded-md border bg-[rgba(8,11,18,0.7)] p-5"
        style={{
          borderColor: "rgba(232,236,242,0.10)",
          boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 20px 40px -28px rgba(0,0,0,0.6)",
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
          Environment Status
        </p>

        {environment ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/42">
                Status
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: statusToneColor(envStatus.tone) }}
                />
                <span
                  className="text-right text-[13px]"
                  style={{ color: statusToneColor(envStatus.tone) }}
                  title={envStatus.reason ?? undefined}
                >
                  {envStatus.label}
                </span>
              </span>
            </div>
            {envStatus.reason ? (
              <p className="-mt-2 text-right text-[11px] leading-4 text-white/40">
                {envStatus.reason}
              </p>
            ) : null}
            <SidePanelRow
              label="Industry"
              value={humanIndustry(environment.industry_type || environment.industry)}
            />
            <SidePanelRow label="Template" value={templateLabel} mono />
            <SidePanelRow label="Env ID" value={environment.env_id.slice(0, 8)} mono />
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-white/55">
            <p>Select a workspace from the rail to see its status.</p>
          </div>
        )}

        <div className="mt-6 border-t pt-4" style={{ borderColor: "rgba(232,236,242,0.08)" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
            Session
          </p>
          <div className="mt-3 space-y-2 text-[13px] text-white/65">
            <div className="flex items-center justify-between">
              <span>Workspaces</span>
              <span className="text-white/85">{envCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>AI gateway</span>
              <span className="inline-flex items-center gap-1.5 text-white/85">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "rgba(107, 174, 127, 0.95)" }}
                />
                Online
              </span>
            </div>
          </div>
        </div>

        {/* TODO(PR6): environment comparison mode */}

        {environment ? (
          <div
            aria-hidden
            className="mt-5 h-px w-full"
            style={{
              background: `linear-gradient(90deg, transparent, rgba(${tone.glow}, 0.35), transparent)`,
            }}
          />
        ) : null}
      </div>
    </aside>
  );
}

function statusToneColor(tone: EnvStatusTone): string {
  if (tone === "amber") return "rgba(209, 161, 91, 0.95)";
  if (tone === "teal") return "rgba(140, 200, 158, 0.95)";
  return "rgba(255,255,255,0.55)";
}

function SidePanelRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "teal" | "amber";
}) {
  const toneColor =
    tone === "amber"
      ? "rgba(209, 161, 91, 0.95)"
      : tone === "teal"
        ? "rgba(140, 200, 158, 0.95)"
        : "rgba(255,255,255,0.85)";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/42">
        {label}
      </span>
      <span
        className={cn("truncate text-right text-[13px]", mono && "font-mono text-[12px]")}
        style={{ color: toneColor }}
      >
        {value}
      </span>
    </div>
  );
}

function AppIndexPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { environments, selectedEnv, selectEnv, loading, isPlatformAdmin } = useEnv();
  const [openingEnvId, setOpeningEnvId] = useState<string | null>(null);
  const [hoveredEnvId, setHoveredEnvId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const deniedTarget = searchParams.get("denied");
  const selectedEnvironment = useMemo(
    () => selectedEnv || environments[0] || null,
    [environments, selectedEnv],
  );
  const selectedEnvironmentName = selectedEnvironment
    ? assertEnvironmentClientName(selectedEnvironment)
    : null;

  // Hover drives ONLY the workspace preview, never the feed.
  const previewEnvironment = useMemo(
    () => environments.find((e) => e.env_id === hoveredEnvId) ?? selectedEnvironment ?? null,
    [hoveredEnvId, selectedEnvironment, environments],
  );

  // Intelligence feed binds to the SELECTED environment + its tenant (fail-closed).
  const bizId = selectedEnvironment?.business_id ?? null;
  const feed = useIntelligenceFeed(selectedEnvironment, bizId);
  const anomalyCount = useMemo(
    () => feed.cards.filter((c) => c.anomaly_flag && !c.is_dismissed).length,
    [feed.cards],
  );
  const envStatus = useMemo(
    () => deriveEnvironmentStatus(selectedEnvironment, anomalyCount, bizId),
    [selectedEnvironment, anomalyCount, bizId],
  );

  // Reset the preview toggle when the selected env changes.
  useEffect(() => {
    setShowPreview(false);
  }, [selectedEnvironment?.env_id]);

  async function openEnvironment(envId: string, slug?: string | null) {
    setOpeningEnvId(envId);
    setError(null);
    selectEnv(envId);

    try {
      await switchPlatformEnvironment({
        environmentSlug:
          slug && isEnvironmentSlug(slug as EnvironmentSlug)
            ? (slug as EnvironmentSlug)
            : undefined,
        envId:
          slug && isEnvironmentSlug(slug as EnvironmentSlug)
            ? undefined
            : envId,
      });
    } catch (cause) {
      setOpeningEnvId(null);
      setError(cause instanceof Error ? cause.message : "Failed to open environment");
    }
  }

  // Card open: dashboard cards carry {type:'app_home_dashboard', env_id}; route through openEnvironment.
  const handleCardOpen = useCallback(
    (card: IntelCard) => {
      const ref = card.source_ref as { type?: string; env_id?: string } | null;
      const targetId = ref?.env_id;
      const target = targetId ? environments.find((e) => e.env_id === targetId) : null;
      if (target) {
        void openEnvironment(target.env_id, target.slug || null);
      }
      // Non-environment cards have no destination yet (investigations are a later PR) — no-op.
    },
    // openEnvironment is a stable closure recreated each render; environments is the real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [environments],
  );

  const handleCardDismiss = useCallback(
    (card: IntelCard) => {
      if (!selectedEnvironment || !bizId) return;
      feed.removeCard(card.id); // optimistic
      void dismissCard(selectedEnvironment.env_id, card.id, bizId).catch(() => {
        // Best-effort; the next load reflects server truth.
      });
    },
    [selectedEnvironment, bizId, feed],
  );

  // Investigate a card: create a grounded session (source_type='card', source_ref ->
  // the card) via the existing PR 6 endpoint, then route to the workspace. Fail-closed:
  // no-op without a real env/tenant (the card button is also disabled in that case).
  const handleCardInvestigate = useCallback(
    (card: IntelCard) => {
      if (!selectedEnvironment || !bizId) return;
      const sourceRef = { type: "card", card_id: card.id, card_type: card.card_type, ...card.source_ref };
      void createSession(
        selectedEnvironment.env_id,
        `Investigate: ${card.title}`,
        { source_ref: sourceRef },
        bizId,
      )
        .then((res) => {
          if (res?.session_id) router.push(`/app/investigate/${res.session_id}`);
        })
        .catch(() => {
          // Leave the user on the home; nothing fabricated, no partial state.
        });
    },
    [selectedEnvironment, bizId, router],
  );

  // Run the deterministic analyzers, persisting findings as cards, then refetch the feed.
  // Fail-closed: no-op without a real env/tenant (the button is disabled in that case).
  const handleAnalyze = useCallback(async () => {
    if (!selectedEnvironment || !bizId || analyzing) return;
    setAnalyzing(true);
    try {
      await runAnalyzers(selectedEnvironment.env_id, bizId);
      await feed.refetch();
    } catch {
      // Each analyzer already fails closed server-side; nothing fabricated on error.
    } finally {
      setAnalyzing(false);
    }
  }, [selectedEnvironment, bizId, analyzing, feed]);

  useEffect(() => {
    if (loading || environments.length !== 1 || isPlatformAdmin || deniedTarget) {
      return;
    }

    const target = environments[0];
    void openEnvironment(target.env_id, target.slug || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, environments, isPlatformAdmin, deniedTarget]);

  const deniedMessage = deniedTarget
    ? `You do not have access to ${deniedTarget}. Your account can only enter provisioned environments.`
    : null;

  const feedSection = (
    <section
      className="bm-bridge relative rounded-md border bg-[rgba(8,11,18,0.55)] p-5 backdrop-blur-md"
      style={{
        borderColor: "rgba(232,236,242,0.10)",
        boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 28px 56px -32px rgba(0,0,0,0.7)",
      }}
    >
      <IntelligenceCardFeed
        cards={feed.cards}
        loading={feed.loading}
        error={feed.error}
        nullReason={feed.nullReason}
        onOpen={handleCardOpen}
        onDismiss={handleCardDismiss}
        onForkInvestigation={handleCardInvestigate}
      />
    </section>
  );

  return (
    <div className="min-h-screen bg-[#03070e] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(900px 480px at 8% -8%, rgba(92,213,204,0.07), transparent 60%)",
            "radial-gradient(800px 520px at 92% 12%, rgba(176,64,255,0.05), transparent 62%)",
            "radial-gradient(700px 500px at 50% 110%, rgba(88,64,255,0.04), transparent 60%)",
            "linear-gradient(180deg, #04070e 0%, #060a14 50%, #03060c 100%)",
          ].join(", "),
        }}
      />

      {/* ── Mobile layout ────────────────────────────────────────────── */}
      <div className="relative z-10 lg:hidden">
        {/* Header */}
        <div className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(8,10,15,0.92)] px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-command text-[1.4rem] uppercase tracking-[0.08em] text-white">Winston</h1>
            <AccountMenu />
          </div>
        </div>

        <main className="mx-auto flex min-h-[calc(100vh-4.5rem)] w-full max-w-3xl flex-col gap-5 px-4 py-5">
          {deniedMessage ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {deniedMessage}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {/* Current environment card */}
          <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md">
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/42">Current workspace</p>
              <h2 className="text-[1.8rem] font-semibold tracking-tight text-white">
                {selectedEnvironmentName ?? "No workspace selected"}
              </h2>
              <p className="text-sm leading-6 text-white/66">
                {selectedEnvironment
                  ? "Your active workspace. Tap any environment below to enter directly."
                  : "Select a workspace below to get started."}
              </p>
            </div>

            {selectedEnvironment ? (
              <button
                type="button"
                onClick={() => void openEnvironment(selectedEnvironment.env_id, selectedEnvironment.slug || null)}
                disabled={openingEnvId === selectedEnvironment.env_id}
                className="mt-5 w-full rounded-2xl border px-4 py-4 text-left transition-[transform,filter] duration-150 hover:-translate-y-[1px] hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70"
                style={{
                  borderColor: `rgba(${environmentTone(selectedEnvironment).glow}, 0.36)`,
                  boxShadow: `0 18px 36px -28px rgba(${environmentTone(selectedEnvironment).glow}, 0.6)`,
                  backgroundColor: "rgba(255,255,255,0.03)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-white/42">
                      {humanIndustry(selectedEnvironment.industry_type || selectedEnvironment.industry)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-white/80">
                      {openingEnvId === selectedEnvironment.env_id ? "Opening…" : "Tap to enter"}
                    </p>
                  </div>
                  <span
                    className="inline-flex h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: `rgba(${environmentTone(selectedEnvironment).glow}, 0.95)` }}
                  />
                </div>
              </button>
            ) : null}
          </section>

          {/* Agent pills (visual-only) */}
          <AgentPills />

          {/* Intelligence feed — the core of the home, kept near the top on mobile too */}
          {feedSection}

          {/* Environment Status (inline on mobile) */}
          <EnvironmentStatusPanel
            environment={previewEnvironment}
            envStatus={envStatus}
            envCount={environments.length}
            variant="mobile"
          />

          {/* Provisioned workspaces list */}
          <section className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/42">Workspaces</p>
                <p className="mt-1 text-sm text-white/66">
                  {loading ? "Resolving access…" : `${environments.length} available`}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {loading ? (
                <>
                  <div className="h-[4.5rem] rounded-2xl border border-white/10 bg-white/[0.04]" />
                  <div className="h-[4.5rem] rounded-2xl border border-white/10 bg-white/[0.04]" />
                </>
              ) : environments.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-white/58">
                  No workspaces are provisioned to this account yet.
                </div>
              ) : (
                environments.map((environment) => {
                  const isActive = selectedEnvironment?.env_id === environment.env_id;
                  const isOpening = openingEnvId === environment.env_id;
                  const clientName = assertEnvironmentClientName(environment);
                  return (
                    <button
                      key={`mobile-${environment.env_id}`}
                      type="button"
                      onClick={() => void openEnvironment(environment.env_id, environment.slug || null)}
                      disabled={isOpening}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-4 text-left transition-[transform,border-color,background-color] duration-150 active:scale-[0.98]",
                        isActive
                          ? "bg-white/[0.08] text-white"
                          : "bg-white/[0.03] text-white/78 hover:-translate-y-[1px] hover:bg-white/[0.05]",
                        isOpening && "pointer-events-none opacity-70",
                      )}
                      style={{
                        borderColor: isActive ? `rgba(${environmentTone(environment).glow}, 0.42)` : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="truncate text-sm font-semibold text-white">
                              {clientName}
                            </div>
                          </div>
                          <p className="mt-0.5 text-xs uppercase tracking-[0.18em] text-white/42">
                            {humanIndustry(environment.industry_type || environment.industry)}
                          </p>
                        </div>
                        <span
                          className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: `rgba(${environmentTone(environment).glow}, ${isOpening ? 0.5 : 0.9})` }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {isPlatformAdmin ? (
            <details className="rounded-[1.6rem] border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer text-sm font-medium text-white">System and admin routes</summary>
              <div className="mt-4 space-y-2">
                {SYSTEM_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 transition-colors duration-150 hover:bg-white/[0.05]"
                  >
                    <div className="text-sm font-medium text-white">{item.label}</div>
                    <p className="mt-1 text-xs leading-5 text-white/46">{item.detail}</p>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </main>
      </div>

      {/* ── Desktop layout ────────────────────────────────────────────── */}
      <div className="relative z-10 hidden min-h-screen w-full lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className="border-b px-5 py-6 backdrop-blur-xl lg:border-b-0 lg:border-r"
          style={{
            borderColor: "rgba(232,236,242,0.08)",
            background: "rgba(6,9,16,0.78)",
          }}
        >
          <div className="space-y-1">
            <h1 className="font-command text-[1.7rem] uppercase tracking-[0.08em] text-white">
              Winston
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
              Workspace console
            </p>
          </div>

          <div className="mt-7 space-y-2.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
              Workspaces
            </p>
            {loading ? (
              <div className="space-y-1.5">
                <div className="h-14 rounded-md border border-white/[0.08] bg-white/[0.03]" />
                <div className="h-14 rounded-md border border-white/[0.08] bg-white/[0.03]" />
              </div>
            ) : environments.length === 0 ? (
              <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-[13px] text-white/58">
                No workspaces are provisioned to this account yet.
              </div>
            ) : (
              <div className="space-y-1">
                {environments.map((environment) => {
                  const isActive = selectedEnvironment?.env_id === environment.env_id;
                  const isOpening = openingEnvId === environment.env_id;
                  const tone = environmentTone(environment);
                  const clientName = assertEnvironmentClientName(environment);
                  const capConfig = getCapabilityConfig(
                    environment.workspace_template_key,
                    environment.industry_type || environment.industry,
                  );
                  return (
                    <button
                      key={environment.env_id}
                      type="button"
                      onClick={() => void openEnvironment(environment.env_id, environment.slug || null)}
                      disabled={isOpening}
                      onMouseEnter={() => setHoveredEnvId(environment.env_id)}
                      onMouseLeave={() => setHoveredEnvId(null)}
                      className={cn(
                        "group relative w-full overflow-hidden rounded-md border px-3.5 py-2.5 text-left transition-[border-color,background-color] duration-150",
                        isActive
                          ? "bg-white/[0.06] text-white"
                          : "bg-white/[0.02] text-white/75 hover:bg-white/[0.04] hover:text-white",
                        isOpening && "pointer-events-none opacity-70",
                      )}
                      style={{
                        borderColor: isActive
                          ? `rgba(${ACTION_TEAL}, 0.38)`
                          : "rgba(232,236,242,0.08)",
                        boxShadow: isActive
                          ? `inset 0 1px 0 0 rgba(${ACTION_TEAL}, 0.18), 0 0 0 1px rgba(${ACTION_TEAL}, 0.10)`
                          : undefined,
                      }}
                    >
                      {isActive ? (
                        <span
                          aria-hidden
                          className="absolute inset-y-1.5 left-0 w-[2px] rounded-r-sm"
                          style={{ backgroundColor: `rgba(${ACTION_TEAL}, 0.85)` }}
                        />
                      ) : null}
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-white">
                            {clientName}
                          </div>
                          <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
                            {capConfig.entryLabel.replace(/^Open\s+/, "")}
                          </p>
                        </div>
                        <span
                          className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: isActive
                              ? `rgba(${ACTION_TEAL}, 0.95)`
                              : `rgba(${tone.glow}, ${isOpening ? 0.4 : 0.7})`,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isPlatformAdmin ? (
            <div className="mt-7 space-y-2.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
                System
              </p>
              <div className="space-y-1">
                {SYSTEM_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block rounded-md border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 transition-colors duration-150 hover:border-white/[0.12] hover:bg-white/[0.04]"
                  >
                    <div className="text-[13px] font-medium text-white">{item.label}</div>
                    <p className="mt-0.5 text-[11px] leading-4 text-white/46">{item.detail}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex min-h-screen flex-col">
          {/* Top system bar */}
          <div
            className="flex items-center justify-between gap-4 border-b px-8 py-3"
            style={{
              borderColor: "rgba(232,236,242,0.08)",
              background: "rgba(6,9,16,0.55)",
            }}
          >
            <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.22em] text-white/50">
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: "rgba(107, 174, 127, 0.95)" }}
                />
                Console online
              </span>
              <span className="text-white/20">/</span>
              <span>{environments.length} workspace{environments.length === 1 ? "" : "s"}</span>
              {isPlatformAdmin ? (
                <>
                  <span className="text-white/20">/</span>
                  <span style={{ color: `rgba(${ACTION_TEAL}, 0.85)` }}>Platform admin</span>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <AccountMenu />
            </div>
          </div>

          {/* Content area */}
          <div className="flex flex-1 px-8 pt-10 pb-8 lg:px-10 xl:px-12 2xl:px-14">
            <div className="grid w-full grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:gap-10">
              {/* Primary column — intelligence feed (or workspace preview via toggle) */}
              <div className="min-w-0 space-y-4">
                {deniedMessage ? (
                  <div
                    className="rounded-md border px-4 py-2.5 text-[13px]"
                    style={{
                      borderColor: "rgba(209, 161, 91, 0.30)",
                      background: "rgba(209, 161, 91, 0.08)",
                      color: "rgba(232, 200, 140, 0.95)",
                    }}
                  >
                    {deniedMessage}
                  </div>
                ) : null}

                {error ? (
                  <div
                    className="rounded-md border px-4 py-2.5 text-[13px]"
                    style={{
                      borderColor: "rgba(212, 122, 114, 0.30)",
                      background: "rgba(212, 122, 114, 0.08)",
                      color: "rgba(240, 180, 174, 0.95)",
                    }}
                  >
                    {error}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-4">
                  <AgentPills />
                  <div className="flex shrink-0 items-center gap-3">
                    {selectedEnvironment && bizId ? (
                      <button
                        type="button"
                        onClick={() => void handleAnalyze()}
                        disabled={analyzing}
                        title="Run the analyzers and add their findings to the feed"
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors disabled:cursor-default disabled:opacity-60"
                        style={{
                          borderColor: `rgba(${ACTION_TEAL}, 0.30)`,
                          color: `rgba(${ACTION_TEAL}, 0.95)`,
                          background: `rgba(${ACTION_TEAL}, 0.06)`,
                        }}
                      >
                        {analyzing ? "Analyzing…" : "Analyze"}
                      </button>
                    ) : null}
                    {selectedEnvironment ? (
                      <InvestigateButton
                        envId={selectedEnvironment.env_id}
                        businessId={selectedEnvironment.business_id ?? undefined}
                        title={`${selectedEnvironment.client_name} investigation`}
                        sourceRef={{ type: "environment", env_id: selectedEnvironment.env_id }}
                      />
                    ) : null}
                    {selectedEnvironment ? (
                      <button
                        type="button"
                        onClick={() => setShowPreview((v) => !v)}
                        className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45 transition-colors hover:text-white/75"
                      >
                        {showPreview ? "← Intelligence" : "Workspace preview →"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {showPreview && previewEnvironment ? (
                  <div
                    className="relative rounded-md border bg-[rgba(8,11,18,0.7)] p-7 backdrop-blur-md"
                    style={{
                      borderColor: `rgba(${ACTION_TEAL}, 0.22)`,
                      boxShadow: `inset 0 1px 0 0 rgba(${ACTION_TEAL}, 0.16), 0 0 0 1px rgba(${ACTION_TEAL}, 0.06), 0 28px 56px -32px rgba(0,0,0,0.7)`,
                    }}
                  >
                    <CenterModeB
                      environment={previewEnvironment}
                      onOpen={() => void openEnvironment(previewEnvironment.env_id, previewEnvironment.slug || null)}
                      isOpening={openingEnvId === previewEnvironment.env_id}
                    />
                  </div>
                ) : (
                  feedSection
                )}
              </div>

              {/* Right column — derived Environment Status */}
              <EnvironmentStatusPanel
                environment={previewEnvironment}
                envStatus={envStatus}
                envCount={environments.length}
                variant="desktop"
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function AppIndexPage() {
  return (
    <Suspense>
      <AppIndexPageInner />
    </Suspense>
  );
}
