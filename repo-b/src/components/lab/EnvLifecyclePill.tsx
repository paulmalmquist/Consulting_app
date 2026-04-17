"use client";

/**
 * EnvLifecyclePill — small status chip rendered on env cards in the `/app`
 * environment picker.
 *
 * Uses the same taxonomy as `CapabilityUnavailable` so product language is
 * unified: users see one vocabulary for "this thing isn't fully active"
 * regardless of whether it's a capability, a module, or a whole environment.
 *
 * Only three taxonomy states are actually meaningful at the environment
 * lifecycle level:
 *   - `archived` — env is_active === false
 *   - `experimental_partial` — active env with industry-readiness flag false
 *     (e.g. REPE env whose `repe_initialized` is false)
 *   - `preview` — env marked as a demo/fixture workspace
 * Fully-live envs render nothing (implicit "active" state).
 *
 * `not_enabled` and `temporary_error` are not applicable to env lifecycle —
 * those are per-capability.
 */

import {
  CAPABILITY_STATE_META,
  CAPABILITY_STATE_TONE_CLASSES,
  type CapabilityState,
} from "@/lib/lab/capability-state-taxonomy";

export type EnvLifecycleState = "archived" | "experimental_partial" | "preview";

interface EnvLifecyclePillProps {
  state: EnvLifecycleState | null;
  className?: string;
}

export default function EnvLifecyclePill({ state, className }: EnvLifecyclePillProps) {
  if (!state) return null;
  const meta = CAPABILITY_STATE_META[state as CapabilityState];
  const toneClass = CAPABILITY_STATE_TONE_CLASSES[meta.tone];

  return (
    <span
      data-testid="env-lifecycle-pill"
      data-state={state}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${toneClass.pill} ${className ?? ""}`.trim()}
    >
      {meta.pillLabel}
    </span>
  );
}

/**
 * Derive the lifecycle state from an environment record. Returns null when
 * the env is fully active (implicit — no pill rendered).
 */
export function deriveEnvLifecycleState(env: {
  is_active?: boolean;
  repe_initialized?: boolean;
  industry?: string | null;
  industry_type?: string | null;
  slug?: string | null;
}): EnvLifecycleState | null {
  if (env.is_active === false) return "archived";

  const industry = (env.industry_type || env.industry || "").toLowerCase();
  // REPE environments advertise a readiness flag — flag as partial when
  // the env is active but not yet initialized.
  if ((industry === "repe" || industry === "real_estate_pe") && env.repe_initialized === false) {
    return "experimental_partial";
  }

  // Demo slug heuristic — the only demo/preview env slug currently in catalog
  // is not explicitly marked; future `demo: true` fields would land here.
  if (env.slug && env.slug.startsWith("demo-")) {
    return "preview";
  }

  return null;
}
