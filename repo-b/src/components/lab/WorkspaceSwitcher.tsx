"use client";

/**
 * WorkspaceSwitcher — in-env environment switcher mounted inside
 * `WorkspaceIdentityBar`.
 *
 * Context-preserving routing (plan Loop 2):
 *   - If the target env has the same top-level module, preserve the module
 *     but strip any deep sub-path (entity ids don't cross env boundaries).
 *   - Otherwise route to the target env's primary home path.
 *   - Tooltip warns the user when a deep path won't be preserved so there
 *     are no silent redirects.
 *
 * Non-admin with a single env: renders a non-interactive pill with only the
 * "← Winston" back link — no menu.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { Environment } from "@/components/EnvProvider";
import {
  environmentCatalog,
  isEnvironmentSlug,
  type EnvironmentSlug,
} from "@/lib/environmentAuth";
import { resolveSwitchTarget } from "@/lib/lab/resolveSwitchTarget";
import { switchPlatformEnvironment } from "@/lib/platformSessionClient";

interface WorkspaceSwitcherProps {
  currentEnv: Environment;
  otherEnvs: Environment[];
}

function glowFor(slug: string | null | undefined): string {
  if (slug && isEnvironmentSlug(slug)) {
    return `rgb(${environmentCatalog[slug as EnvironmentSlug].glow})`;
  }
  return "rgb(148, 163, 184)";
}

export default function WorkspaceSwitcher({ currentEnv, otherEnvs }: WorkspaceSwitcherProps) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasMenu = otherEnvs.length > 0;

  const resolvedTargets = useMemo(
    () =>
      otherEnvs.map((env) => ({
        env,
        target: resolveSwitchTarget(pathname, env),
      })),
    [otherEnvs, pathname],
  );

  async function handleSwitch(env: Environment) {
    setSwitchingTo(env.env_id);
    setError(null);
    try {
      await switchPlatformEnvironment({
        environmentSlug:
          env.slug && isEnvironmentSlug(env.slug) ? env.slug : undefined,
        envId: env.slug && isEnvironmentSlug(env.slug) ? undefined : env.env_id,
      });
      const { path } = resolveSwitchTarget(pathname, env);
      router.push(path);
    } catch (cause) {
      setSwitchingTo(null);
      setError(cause instanceof Error ? cause.message : "Failed to switch environment");
    }
  }

  if (!hasMenu) {
    return (
      <Link
        href="/app"
        className="rounded border border-bm-border/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted hover:border-bm-border hover:bg-bm-surface/40 hover:text-bm-text"
        data-testid="workspace-exit"
        aria-label="Back to Winston environment selector"
      >
        ← Winston
      </Link>
    );
  }

  return (
    <div className="relative" data-testid="workspace-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch environment"
        className="inline-flex items-center gap-1.5 rounded border border-bm-border/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-bm-muted hover:border-bm-border hover:bg-bm-surface/40 hover:text-bm-text"
      >
        Switch
        <span aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-lg border border-bm-border/80 bg-bm-bg/95 shadow-xl backdrop-blur-sm"
          data-testid="workspace-switcher-menu"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-bm-muted2">
            Switch environment
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {resolvedTargets.map(({ env, target }) => {
              const isSwitching = switchingTo === env.env_id;
              const tooltip = target.preservesModule
                ? `Opens the same module in ${env.client_name}`
                : `Switches to ${env.client_name}'s home workspace`;
              return (
                <li key={env.env_id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSwitch(env)}
                    disabled={isSwitching}
                    title={tooltip}
                    data-testid={`workspace-switcher-item-${env.env_id}`}
                    data-preserves-module={target.preservesModule ? "true" : "false"}
                    data-target-path={target.path}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bm-surface/40 disabled:pointer-events-none disabled:opacity-60"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: glowFor(env.slug) }}
                    />
                    <span className="flex-1">
                      <span className="block font-medium text-bm-text">{env.client_name}</span>
                      <span className="block text-[10px] text-bm-muted2">
                        {target.preservesModule ? "Same module" : "Home workspace"}
                      </span>
                    </span>
                    {isSwitching ? (
                      <span className="text-[10px] text-bm-muted2">Switching…</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-bm-border/60">
            <Link
              href="/app"
              className="block px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-bm-muted hover:bg-bm-surface/40 hover:text-bm-text"
              data-testid="workspace-exit"
              onClick={() => setOpen(false)}
            >
              ← Back to Winston
            </Link>
          </div>
          {error ? (
            <div
              className="border-t border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200"
              data-testid="workspace-switcher-error"
            >
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Mark current env in a11y tree so screen readers know the anchor */}
      <span className="sr-only" data-testid="workspace-switcher-current">
        Current: {currentEnv.client_name}
      </span>
    </div>
  );
}
