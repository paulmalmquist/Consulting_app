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

const SYSTEM_LINKS = [
  { href: "/lab/system/control-tower", label: "Control Tower", detail: "Provision and monitor environments" },
  { href: "/lab/system/access", label: "Access", detail: "Grant memberships and workspace visibility" },
  { href: "/lab/audit", label: "Audit", detail: "Operational review surfaces" },
  { href: "/lab/ai-audit", label: "AI Audit", detail: "Assistant and model oversight" },
] as const;

function AppIndexPageInner() {
  const searchParams = useSearchParams();
  const { environments, selectedEnv, selectEnv, loading, isPlatformAdmin } = useEnv();
  const [openingEnvId, setOpeningEnvId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deniedTarget = searchParams.get("denied");
  const selectedEnvironment = useMemo(
    () => selectedEnv || environments[0] || null,
    [environments, selectedEnv],
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

  return (
    <div className="min-h-screen bg-[#05070b] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 14% 18%, rgba(22,163,74,0.14), transparent 24%)",
            "radial-gradient(circle at 84% 22%, rgba(59,130,246,0.12), transparent 24%)",
            "radial-gradient(circle at 72% 82%, rgba(249,115,22,0.12), transparent 22%)",
            "linear-gradient(180deg, #06070b 0%, #090c12 48%, #05060a 100%)",
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
                {selectedEnvironment ? selectedEnvironment.client_name : "No workspace selected"}
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
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {environment.client_name}
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
      <div className="relative z-10 hidden min-h-screen lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-[rgba(8,10,15,0.86)] px-5 py-6 backdrop-blur-xl lg:border-b-0 lg:border-r">
          <div className="space-y-2">
            <h1 className="font-command text-[2rem] uppercase tracking-[0.08em] text-white">Winston</h1>
            <p className="text-sm leading-6 text-white/58">
              Login grants capability. Environment grants scope.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/42">Available workspaces</p>
            {loading ? (
              <div className="space-y-2">
                <div className="h-16 rounded-2xl border border-white/10 bg-white/[0.04]" />
                <div className="h-16 rounded-2xl border border-white/10 bg-white/[0.04]" />
              </div>
            ) : environments.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-white/58">
                No workspaces are provisioned to this account yet.
              </div>
            ) : (
              <div className="space-y-2">
                {environments.map((environment) => {
                  const isActive = selectedEnvironment?.env_id === environment.env_id;
                  const isOpening = openingEnvId === environment.env_id;
                  const tone = environmentTone(environment);
                  return (
                    <button
                      key={environment.env_id}
                      type="button"
                      onClick={() => void openEnvironment(environment.env_id, environment.slug || null)}
                      disabled={isOpening}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition-[transform,border-color,background-color] duration-150 active:scale-[0.98]",
                        isActive
                          ? "bg-white/[0.08] text-white"
                          : "bg-white/[0.03] text-white/78 hover:-translate-y-[1px] hover:bg-white/[0.05]",
                        isOpening && "pointer-events-none opacity-70",
                      )}
                      style={{
                        borderColor: isActive ? `rgba(${tone.glow}, 0.42)` : "rgba(255,255,255,0.08)",
                        boxShadow: isActive ? `0 12px 28px -22px rgba(${tone.glow}, 0.55)` : undefined,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {environment.client_name}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-white/46">
                            {humanIndustry(environment.industry_type || environment.industry)}
                          </p>
                        </div>
                        <span
                          className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: `rgba(${tone.glow}, ${isOpening ? 0.5 : 0.9})` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isPlatformAdmin ? (
            <div className="mt-8 space-y-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/42">System</p>
              <div className="space-y-2">
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
            </div>
          ) : null}
        </aside>

        <main className="flex min-h-screen flex-col px-6 py-6 lg:px-10 lg:py-10">
          <div className="flex items-center justify-end gap-2">
            <AccountMenu />
          </div>

          <div className="flex flex-1 items-center">
            <div className="mx-auto w-full max-w-4xl space-y-6">
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

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md lg:p-8">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/42">Workspace access</p>
                <h2 className="mt-3 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-white">
                  {selectedEnvironment ? selectedEnvironment.client_name : "No workspace selected"}
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-white/66">
                  {selectedEnvironment
                    ? `Your workspace access is ready. Select an environment from the left to enter.`
                    : "Access is provisioned per environment. Once a workspace is assigned to your account, it will appear in the rail on the left."}
                </p>

                {selectedEnvironment ? (
                  <div className="mt-6">
                    <p className="text-xs uppercase tracking-[0.18em] text-white/42">
                      {humanIndustry(selectedEnvironment.industry_type || selectedEnvironment.industry)}
                    </p>
                  </div>
                ) : null}
              </div>
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
