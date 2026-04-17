// Capability / environment state taxonomy — single source of truth.
//
// Goal: unify the product language across every "thing is not fully working"
// surface so users (and telemetry) see one consistent vocabulary.
//
// The same taxonomy drives:
//   - CapabilityUnavailable component (per-capability states)
//   - EnvLifecyclePill component (per-environment lifecycle)
//   - DomainPreviewState visual parity (experimental modules)
//
// Never improvise new state labels. If a new state is required, add it here
// first and propagate.

export const CAPABILITY_STATES = [
  "not_enabled",
  "preview",
  "temporary_error",
  "experimental_partial",
  "archived",
] as const;

export type CapabilityState = (typeof CAPABILITY_STATES)[number];

export type CapabilityStateTone = "slate" | "amber" | "red" | "violet" | "muted";

interface CapabilityStateMeta {
  pillLabel: string;
  tone: CapabilityStateTone;
  defaultHeadline: string;
  defaultDetail: string;
}

export const CAPABILITY_STATE_META: Record<CapabilityState, CapabilityStateMeta> = {
  not_enabled: {
    pillLabel: "Not enabled in this environment",
    tone: "slate",
    defaultHeadline: "Not available in the current environment.",
    defaultDetail:
      "This surface is scaffolded but the underlying capability is not enabled for this environment.",
  },
  preview: {
    pillLabel: "Preview — synthetic fixture data",
    tone: "amber",
    defaultHeadline: "Preview — rendering synthetic fixture data.",
    defaultDetail:
      "This surface is rendering demo data so the shape of the product is visible. The underlying data pipeline is not yet connected.",
  },
  temporary_error: {
    pillLabel: "Temporarily unavailable",
    tone: "red",
    defaultHeadline: "Temporarily unavailable.",
    defaultDetail:
      "A transient backend or network failure prevented this capability from loading. Retry in a moment.",
  },
  experimental_partial: {
    pillLabel: "Experimental — partial capability",
    tone: "violet",
    defaultHeadline: "Experimental — partial capability.",
    defaultDetail:
      "This module is real but incomplete. Some features are stubbed while the capability is being built out.",
  },
  archived: {
    pillLabel: "Archived",
    tone: "muted",
    defaultHeadline: "Archived.",
    defaultDetail: "This capability has been retired and is read-only.",
  },
};

export function capabilityStateMeta(state: CapabilityState): CapabilityStateMeta {
  return CAPABILITY_STATE_META[state];
}

export const CAPABILITY_STATE_TONE_CLASSES: Record<CapabilityStateTone, { pill: string; border: string; bg: string; text: string }> = {
  slate: {
    pill: "bg-slate-100 text-slate-600 border-slate-200",
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-700",
  },
  amber: {
    pill: "bg-amber-100 text-amber-800 border-amber-200",
    border: "border-amber-300",
    bg: "bg-amber-50",
    text: "text-amber-900",
  },
  red: {
    pill: "bg-red-100 text-red-800 border-red-200",
    border: "border-red-300",
    bg: "bg-red-50",
    text: "text-red-900",
  },
  violet: {
    pill: "bg-violet-100 text-violet-800 border-violet-200",
    border: "border-violet-300",
    bg: "bg-violet-50",
    text: "text-violet-900",
  },
  muted: {
    pill: "bg-slate-100 text-slate-500 border-slate-200",
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-500",
  },
};
