"use client";

/**
 * WorkspaceIdentityBar — persistent "which company am I in" strip.
 *
 * Rendered at the env layout boundary so it shows on EVERY route under
 * `/lab/env/{envId}/...`, including the vertical shells (REPE, PDS, credit,
 * consulting, markets, NCF) where the generic LabEnvironmentShell bails.
 *
 * Visual differentiation comes from the env-specific `glow` color already
 * defined in `environmentCatalog` — no new palette, no new API. A thin
 * left accent bar + tinted text pill is enough for a workspace to feel
 * distinct without breaking the cohesive chrome.
 */

import { useEnv } from "@/components/EnvProvider";
import {
  environmentCatalog,
  isEnvironmentSlug,
  type EnvironmentBranding,
  type EnvironmentSlug,
} from "@/lib/environmentAuth";
import { humanIndustry } from "@/components/lab/environments/constants";
import WorkspaceSwitcher from "@/components/lab/WorkspaceSwitcher";

function pickSlug(input: string | null | undefined): EnvironmentSlug | null {
  if (!input) return null;
  return isEnvironmentSlug(input) ? input : null;
}

function pickBranding(slug: EnvironmentSlug | null): EnvironmentBranding | null {
  if (!slug) return null;
  return environmentCatalog[slug];
}

export default function WorkspaceIdentityBar({ envId }: { envId: string }) {
  const { selectedEnv, environments } = useEnv();
  const matches = selectedEnv?.env_id === envId ? selectedEnv : null;
  const slug = pickSlug(matches?.slug);
  const branding = pickBranding(slug);
  const industryLabel = matches
    ? humanIndustry(matches.industry_type || matches.industry)
    : null;

  // If we don't have enough data to be definitive, render nothing — a
  // half-wrong identity bar is worse than no identity bar.
  if (!matches || !industryLabel) return null;

  const glow = branding ? `rgb(${branding.glow})` : "rgb(148, 163, 184)";
  const glowSoft = branding ? `rgba(${branding.glow}, 0.12)` : "rgba(148, 163, 184, 0.12)";
  const otherEnvs = environments.filter((e) => e.env_id !== envId);

  return (
    <div
      data-testid="workspace-identity-bar"
      data-env-slug={slug || undefined}
      className="flex flex-wrap items-center gap-3 border-l-2 pl-3 text-xs"
      style={{ borderColor: glow }}
    >
      <span className="flex items-center gap-2">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: glow }}
          aria-hidden="true"
        />
        <span className="font-semibold tracking-tight text-bm-text">
          {matches.client_name}
        </span>
      </span>
      <span aria-hidden="true" className="text-bm-muted2">
        ·
      </span>
      <span className="text-bm-muted">{industryLabel}</span>
      <span
        className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]"
        style={{ backgroundColor: glowSoft, color: glow }}
      >
        <span aria-hidden="true">●</span> workspace
      </span>
      <WorkspaceSwitcher currentEnv={matches} otherEnvs={otherEnvs} />
    </div>
  );
}
