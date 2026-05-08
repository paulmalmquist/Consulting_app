"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import AccountMenu from "@/components/AccountMenu";
import { useEnv } from "@/components/EnvProvider";
import { humanIndustry } from "@/components/lab/environments/constants";
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

// ── Mode A: default overview ──────────────────────────────────────────────────
function CenterModeA({
  envCount,
  isPlatformAdmin,
}: {
  envCount: number;
  isPlatformAdmin: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45">
          Execution layer
        </p>
        <h2 className="text-[clamp(1.75rem,3.2vw,2.4rem)] font-semibold leading-tight tracking-tight text-white">
          Ready
        </h2>
        <p className="max-w-xl text-sm leading-6 text-white/60">
          {envCount > 0
            ? `${envCount} workspace${envCount === 1 ? "" : "s"} provisioned. Select one from the rail on the left to enter.`
            : "Access is provisioned per environment. Once a workspace is assigned to your account, it will appear in the rail on the left."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "rgba(107, 174, 127, 0.95)" }}
          />
          AI gateway online
        </span>
        <span className="text-white/20">/</span>
        <span>{envCount} environment{envCount === 1 ? "" : "s"}</span>
        {isPlatformAdmin && (
          <>
            <span className="text-white/20">/</span>
            <span style={{ color: "rgba(92, 213, 204, 0.85)" }}>Platform admin</span>
          </>
        )}
      </div>
    </div>
  );
}

// Novendor action color — teal/cyan, used for primary CTA and selected accents.
const ACTION_TEAL = "92, 213, 204";

// ── Mode B: workspace preview ─────────────────────────────────────────────────
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

// ── Side panel: workspace metadata strip ──────────────────────────────────────
function SidePanel({
  environment,
  envCount,
}: {
  environment: {
    env_id: string;
    client_name: string;
    slug?: string | null;
    industry?: string | null;
    industry_type?: string | null;
    workspace_template_key?: string | null;
    is_active?: boolean;
    created_at?: string;
  } | null;
  envCount: number;
}) {
  const tone = environment ? environmentTone(environment) : { glow: "148, 163, 184" };
  const capConfig = environment
    ? getCapabilityConfig(
        environment.workspace_template_key,
        environment.industry_type || environment.industry,
      )
    : null;
  const templateLabel = environment?.workspace_template_key
    ? environment.workspace_template_key.replace(/_/g, " ")
    : "—";

  return (
    <aside className="hidden w-[280px] shrink-0 xl:block">
      <div
        className="rounded-md border bg-[rgba(8,11,18,0.7)] p-5"
        style={{
          borderColor: "rgba(232,236,242,0.10)",
          boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 20px 40px -28px rgba(0,0,0,0.6)",
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/45">
          Workspace
        </p>

        {environment ? (
          <div className="mt-4 space-y-4">
            <SidePanelRow label="Type" value={capConfig?.entryLabel.replace(/^Open\s+/, "") || "—"} />
            <SidePanelRow label="Template" value={templateLabel} mono />
            <SidePanelRow
              label="Industry"
              value={humanIndustry(environment.industry_type || environment.industry)}
            />
            <SidePanelRow
              label="Status"
              value={environment.is_active === false ? "Inactive" : "Active"}
              tone={environment.is_active === false ? "amber" : "teal"}
            />
            <SidePanelRow
              label="Env ID"
              value={environment.env_id.slice(0, 8)}
              mono
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-white/55">
            <p>Select a workspace from the rail to see details.</p>
          </div>
        )}

        <div
          className="mt-6 border-t pt-4"
          style={{ borderColor: "rgba(232,236,242,0.08)" }}
        >
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
  const { environments, selectedEnv, selectEnv, loading, isPlatformAdmin } = useEnv();
  const [openingEnvId, setOpeningEnvId] = useState<string | null>(null);
  const [hoveredEnvId, setHoveredEnvId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deniedTarget = searchParams.get("denied");
  const selectedEnvironment = useMemo(
    () => selectedEnv || environments[0] || null,
    [environments, selectedEnv],
  );
  const selectedEnvironmentName = selectedEnvironment
    ? assertEnvironmentClientName(selectedEnvironment)
    : null;

  // State priority: hovered > selected > null
  const previewEnvironment = useMemo(
    () => environments.find((e) => e.env_id === hoveredEnvId) ?? selectedEnvironment ?? null,
    [hoveredEnvId, selectedEnvironment, environments],
  );

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

  // Determine center panel mode
  const centerMode: "A" | "B" =
    previewEnvironment === null ? "A" : "B";

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
              {/* Primary detail panel — anchored top-left */}
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

                <div
                  className="relative rounded-md border bg-[rgba(8,11,18,0.7)] p-7 backdrop-blur-md"
                  style={{
                    borderColor: previewEnvironment
                      ? `rgba(${ACTION_TEAL}, 0.22)`
                      : "rgba(232,236,242,0.10)",
                    boxShadow: previewEnvironment
                      ? `inset 0 1px 0 0 rgba(${ACTION_TEAL}, 0.16), 0 0 0 1px rgba(${ACTION_TEAL}, 0.06), 0 28px 56px -32px rgba(0,0,0,0.7)`
                      : "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 28px 56px -32px rgba(0,0,0,0.7)",
                  }}
                >
                  <div
                    key={previewEnvironment?.env_id ?? "mode-a"}
                    className="transition-opacity duration-200"
                  >
                    {centerMode === "A" && (
                      <CenterModeA
                        envCount={environments.length}
                        isPlatformAdmin={isPlatformAdmin}
                      />
                    )}
                    {centerMode === "B" && previewEnvironment && (
                      <CenterModeB
                        environment={previewEnvironment}
                        onOpen={() => void openEnvironment(previewEnvironment.env_id, previewEnvironment.slug || null)}
                        isOpening={openingEnvId === previewEnvironment.env_id}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Secondary side panel — workspace metadata */}
              <SidePanel
                environment={previewEnvironment}
                envCount={environments.length}
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
