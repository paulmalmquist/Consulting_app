/**
 * CapabilityUnavailable — unified "this thing isn't fully working" state.
 *
 * Fail-loud pattern (tips.md #17): when a capability is scaffolded but not
 * enabled, a transient backend failure prevents load, or the module is
 * experimental/archived, render the full structural shell with a credible
 * empty state rather than a blank card, infinite skeleton, or raw error toast.
 *
 * Taxonomy-driven (plan Loop 3): every "unavailable" state is one of five
 * fixed values from `@/lib/lab/capability-state-taxonomy`:
 *   - not_enabled          (default — scaffolded capability the env doesn't have wired)
 *   - preview              (synthetic fixture data, not yet backed by a real backend)
 *   - temporary_error      (transient backend/network failure)
 *   - experimental_partial (real but incomplete, some features stubbed)
 *   - archived             (retired capability, read-only if surfaced)
 *
 * The same taxonomy powers `EnvLifecyclePill` so product language stays
 * consistent across per-capability and per-environment surfaces.
 *
 * Contract:
 *   - state: taxonomy state (default "not_enabled")
 *   - capabilityKey: stable id e.g. "repe.waterfall" (also `data-capability-key`)
 *   - title: human-readable capability name
 *   - moduleLabel: optional top eyebrow ("REPE Financial Intelligence")
 *   - note: optional one-line override / context (e.g. backend error message)
 *   - adminHint: override the default admin-action copy
 */

import {
  CAPABILITY_STATE_META,
  CAPABILITY_STATE_TONE_CLASSES,
  type CapabilityState,
} from "@/lib/lab/capability-state-taxonomy";

type CapabilityUnavailableProps = {
  capabilityKey: string;
  title: string;
  state?: CapabilityState;
  moduleLabel?: string;
  note?: string;
  adminHint?: string;
};

const DEFAULT_ADMIN_HINTS: Record<CapabilityState, string> = {
  not_enabled: "Contact admin to enable this capability for the current environment.",
  preview: "Connect the underlying data pipeline to move this surface off fixture data.",
  temporary_error: "Retry in a moment. If this persists, contact platform support.",
  experimental_partial: "Capabilities ship incrementally. Contact admin for roadmap status.",
  archived: "This capability has been retired.",
};

export default function CapabilityUnavailable({
  capabilityKey,
  title,
  state = "not_enabled",
  moduleLabel,
  note,
  adminHint,
}: CapabilityUnavailableProps) {
  const meta = CAPABILITY_STATE_META[state];
  const toneClass = CAPABILITY_STATE_TONE_CLASSES[meta.tone];
  const resolvedAdminHint = adminHint ?? DEFAULT_ADMIN_HINTS[state];

  return (
    <div
      data-testid="capability-unavailable"
      data-capability-key={capabilityKey}
      data-state={state}
      className="min-h-[40vh] px-6 py-12 md:px-10"
    >
      <div className={`mx-auto max-w-2xl rounded-2xl border ${toneClass.border} bg-white p-8 shadow-sm`}>
        {moduleLabel ? (
          <div className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-500">
            {moduleLabel}
          </div>
        ) : null}
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {meta.defaultHeadline} {meta.defaultDetail}
        </p>
        {note ? (
          <p className="mt-2 text-sm leading-7 text-slate-600" data-testid="capability-unavailable-note">
            {note}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full border px-3 py-1 font-medium ${toneClass.pill}`}
            data-testid="capability-state-pill"
          >
            {meta.pillLabel}
          </span>
          <span
            className="rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ backgroundColor: "#f1f5f9", color: "#334155" }}
          >
            {capabilityKey}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
            {resolvedAdminHint}
          </span>
        </div>
      </div>
    </div>
  );
}
