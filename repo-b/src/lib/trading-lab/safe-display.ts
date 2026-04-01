/**
 * Safe display utilities for the Decision Engine.
 * Prevents NaN, null, undefined from ever reaching the UI.
 */

/** Display a numeric value or "Not available" */
export function safeNum(
  value: unknown,
  formatter?: (n: number) => string,
): string {
  if (value == null) return "Not available";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "Not available";
  return formatter ? formatter(n) : String(n);
}

/** Display a percentage or "Not available" */
export function safePct(value: unknown, decimals = 0): string {
  if (value == null) return "Not available";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "Not available";
  return `${n.toFixed(decimals)}%`;
}

/** Display a score (0–1 range) or "Not available" */
export function safeScore(value: unknown, decimals = 2): string {
  if (value == null) return "Not available";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "Not available";
  return n.toFixed(decimals);
}

/** Check if a value is valid (not null, undefined, NaN) */
export function isValid(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number" && !Number.isFinite(value)) return false;
  return true;
}

/** Check if an array has real data */
export function hasData<T>(arr: T[] | null | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

/** Safe string display */
export function safeStr(value: unknown, fallback = "Not available"): string {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s.length > 0 ? s : fallback;
}

/** Validate scenario probabilities sum to ~100% */
export function scenariosValid(bull: number, base: number, bear: number): boolean {
  if (!Number.isFinite(bull) || !Number.isFinite(base) || !Number.isFinite(bear)) return false;
  const sum = bull + base + bear;
  return sum >= 95 && sum <= 105; // Allow small rounding tolerance
}
