/**
 * format-utils.ts — canonical formatting utilities for Winston
 *
 * Single source of truth for all display-layer formatting.
 * Previously duplicated across 55+ files; consolidated 2026-03-23.
 *
 * Usage:
 *   import { fmtMoney, fmtPct, fmtDate, fmtMultiple } from '@/lib/format-utils';
 */

/**
 * Format a number as compact USD currency: $1.2B / $500M / $12.3K / $45
 * Returns "—" for null/undefined/NaN; "0" for zero.
 */
export function fmtMoney(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (n === 0) return '$0';
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Format a number as exact USD currency with cents: $1,234.56
 * Returns fallback for null/undefined/NaN.
 */
export function fmtMoneyExact(
  value: number | null | undefined,
  fallback = '—',
): string {
  if (value == null) return fallback;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a percentage value.
 * Handles both decimal (0.15 → 15.0%) and already-multiplied (15.0 → 15.0%) inputs.
 * Values with |n| < 1 are treated as decimal fractions and multiplied by 100.
 * Values with |n| >= 1 are treated as already-percent.
 */
export function fmtPct(
  v: number | string | null | undefined,
  decimals = 1,
): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  // Treat values in (-1, 1) exclusive as decimal fractions (0.15 → 15.0%)
  // Values >= 1 or <= -1 are already-percent (15.0 → 15.0%)
  if (Math.abs(n) < 1 && n !== 0) return `${(n * 100).toFixed(decimals)}%`;
  return `${n.toFixed(decimals)}%`;
}

/**
 * Format a value that is always a decimal fraction (e.g., IRR, occupancy rate).
 * Always multiplies by 100. Use when the storage format is known to be decimal.
 */
export function fmtPctFromDecimal(
  v: number | string | null | undefined,
  decimals = 1,
): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

/**
 * Format a percentage that is always already multiplied (e.g., 14.5 → "14.5%").
 * Use when values are stored as percent, not decimal fractions.
 */
export function fmtPctDirect(
  v: number | string | null | undefined,
  decimals = 1,
): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

/**
 * Format an equity multiple: 1.85x
 */
export function fmtMultiple(
  v: number | string | null | undefined,
  fallback = '—',
): string {
  if (v == null) return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return `${n.toFixed(2)}x`;
}

/**
 * Format a date string as "Mar 23, 2026".
 */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a date string as a short date: "03/23/2026"
 */
export function fmtDateShort(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US');
}

/**
 * Format a timestamp as relative time: "2 hours ago"
 */
export function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Format basis points: "+25 bps" or "-10 bps"
 */
export function fmtBps(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(0)} bps`;
}

/**
 * Format a price per square foot: "$45.00/SF"
 */
export function fmtSfPsf(v: number | string | null | undefined): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return `$${n.toFixed(2)}/SF`;
}

/**
 * Format a year number (rounded): "2026"
 */
export function fmtYear(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return String(Math.round(n));
}

/**
 * Format any scalar value to string, returning "—" for empty.
 */
export function fmtText(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString() : '—';
  return String(v);
}

/**
 * Format a number with commas: "1,234,567"
 */
export function fmtNumber(v: number | string | null | undefined, decimals?: number): string {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  if (decimals != null) return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toLocaleString('en-US');
}
