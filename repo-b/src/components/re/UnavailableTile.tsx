"use client";

/**
 * UnavailableTile — Null-state renderer for authoritative KPI values.
 *
 * Authoritative State Lockdown (INV-5): when a fund-level metric cannot
 * be rendered because the authoritative state is incomplete, unreleased,
 * or carries a null_reason, the UI MUST show a user-visible reason
 * string, never "$0", "—", or a numeric fallback.
 *
 * Two forms:
 *   - <UnavailableTile />  — full KPI card form for strip/band layouts
 *   - <UnavailableCell />  — compact inline form for table row cells
 *
 * Both accept a `nullReason` code and map it to a human-readable label.
 * The compact form shows "unavailable" in the cell and the full reason
 * in a tooltip; the full form shows the reason inline.
 */

import * as React from "react";
import { cn } from "@/lib/cn";

// ── Null-reason → display copy map ──────────────────────────────────────────
// Add new reasons here as the backend introduces them. Never render a raw
// code to the user.
const NULL_REASON_COPY: Record<string, { short: string; long: string }> = {
  authoritative_state_not_released: {
    short: "unavailable",
    long: "Snapshot not released",
  },
  authoritative_state_not_found: {
    short: "unavailable",
    long: "No snapshot for this period",
  },
  out_of_scope_requires_waterfall: {
    short: "unavailable",
    long: "Net metrics unavailable — waterfall not defined",
  },
  incomplete_cash_flow_series: {
    short: "unavailable",
    long: "IRR unavailable — incomplete cash flow series",
  },
  period_coherence_violation: {
    short: "unavailable",
    long: "Period mismatch between inputs",
  },
  period_drift: {
    short: "unavailable",
    long: "Period drift vs requested quarter",
  },
  missing_source: {
    short: "unavailable",
    long: "Source data missing",
  },
  ui_contract_violation: {
    short: "unavailable",
    long: "Internal: metric contract violation",
  },
};

function resolveCopy(nullReason: string | null | undefined): { short: string; long: string } {
  if (!nullReason) return { short: "unavailable", long: "No reason provided" };
  return (
    NULL_REASON_COPY[nullReason] ?? {
      short: "unavailable",
      long: nullReason,
    }
  );
}

// ── Full tile (KPI band / strip) ────────────────────────────────────────────

export interface UnavailableTileProps {
  label: string;
  nullReason: string | null | undefined;
  className?: string;
}

export function UnavailableTile({ label, nullReason, className }: UnavailableTileProps) {
  const copy = resolveCopy(nullReason);
  return (
    <div
      className={cn("min-w-0 space-y-2 px-3 py-4 md:py-5 xl:px-6", className)}
      data-testid="unavailable-tile"
      data-null-reason={nullReason ?? "unknown"}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-bm-muted2">{label}</p>
      <p
        className="font-display text-[18px] font-semibold leading-tight text-bm-muted italic"
        title={copy.long}
      >
        {copy.short}
      </p>
      <p className="text-[10px] text-bm-muted2/80 leading-snug">{copy.long}</p>
    </div>
  );
}

// ── Inline table cell form ──────────────────────────────────────────────────

export interface UnavailableCellProps {
  nullReason: string | null | undefined;
  className?: string;
}

export function UnavailableCell({ nullReason, className }: UnavailableCellProps) {
  const copy = resolveCopy(nullReason);
  return (
    <span
      className={cn("text-bm-muted italic tabular-nums", className)}
      title={copy.long}
      data-testid="unavailable-cell"
      data-null-reason={nullReason ?? "unknown"}
    >
      {copy.short}
    </span>
  );
}

// ── Exported constants for tests ────────────────────────────────────────────

export const UNAVAILABLE_TILE_TESTID = "unavailable-tile";
export const UNAVAILABLE_CELL_TESTID = "unavailable-cell";
