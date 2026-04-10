"use client";

/**
 * TrustChip — Authoritative State Lockdown UI badge.
 *
 * Renders next to a KPI value to disclose where the value came from.
 * Per docs/SYSTEM_RULES_AUTHORITATIVE_STATE.md (Invariant 3), every
 * authoritative value must visibly carry its snapshot version and trust
 * status so the user can verify lineage at a glance.
 *
 * Variants:
 *   - released  — green pill, "released" + short snapshot version hash
 *   - verified  — amber pill, "verified" (not yet released)
 *   - missing   — red pill, "no snapshot"
 *   - drift     — red pill, "period drift"
 */

import type { LockState } from "@/hooks/useAuthoritativeState";

export interface TrustChipProps {
  lockState: LockState;
  snapshotVersion?: string | null;
  trustStatus?: string | null;
  className?: string;
}

function shortVersion(version: string | null | undefined): string {
  if (!version) return "—";
  // meridian-20260410T023425Z-ab1e6999 → ab1e6999
  const parts = version.split("-");
  return parts[parts.length - 1] || version;
}

const STYLE_BY_STATE: Record<LockState, { bg: string; fg: string; label: string }> = {
  loading: { bg: "bg-slate-200", fg: "text-slate-700", label: "loading" },
  released: { bg: "bg-emerald-100", fg: "text-emerald-800", label: "released" },
  verified: { bg: "bg-amber-100", fg: "text-amber-800", label: "verified" },
  not_released: { bg: "bg-rose-100", fg: "text-rose-800", label: "not released" },
  not_found: { bg: "bg-rose-100", fg: "text-rose-800", label: "not found" },
  period_drift: { bg: "bg-rose-100", fg: "text-rose-800", label: "period drift" },
  error: { bg: "bg-rose-100", fg: "text-rose-800", label: "error" },
};

export function TrustChip({
  lockState,
  snapshotVersion,
  trustStatus,
  className,
}: TrustChipProps) {
  const style = STYLE_BY_STATE[lockState] ?? STYLE_BY_STATE.error;
  const title = [
    `lockState: ${lockState}`,
    snapshotVersion ? `snapshot: ${snapshotVersion}` : null,
    trustStatus ? `trust: ${trustStatus}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.bg} ${style.fg} ${className ?? ""}`}
    >
      <span>{style.label}</span>
      {lockState === "released" && (
        <span className="font-mono normal-case opacity-70">{shortVersion(snapshotVersion)}</span>
      )}
    </span>
  );
}
