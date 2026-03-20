import type { PdsV2Horizon, PdsV2Lens, PdsV2RolePreset } from "@/lib/bos-api";

export const PDS_LENSES: Array<{ key: PdsV2Lens; label: string }> = [
  { key: "market", label: "Market" },
  { key: "account", label: "Account" },
  { key: "project", label: "Project" },
  { key: "resource", label: "Resource" },
];

export const PDS_HORIZONS: Array<{ key: PdsV2Horizon; label: string }> = [
  { key: "MTD", label: "MTD" },
  { key: "QTD", label: "QTD" },
  { key: "YTD", label: "YTD" },
  { key: "Forecast", label: "Forecast" },
];

export const PDS_ROLE_PRESETS: Array<{ key: PdsV2RolePreset; label: string }> = [
  { key: "executive", label: "Executive" },
  { key: "market_leader", label: "Market Leader" },
  { key: "account_director", label: "Account Director" },
  { key: "project_lead", label: "Project Lead" },
];

export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function safeDivide(a: number, b: number, fallback = 0): number {
  if (b === 0 || !Number.isFinite(b)) return fallback;
  const result = a / b;
  return Number.isFinite(result) ? result : fallback;
}

export function formatCurrency(value: string | number | null | undefined): string {
  const num = toNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

export function formatNumber(value: string | number | null | undefined, digits = 0): string {
  const num = toNumber(value);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(num);
}

export function formatPercent(value: string | number | null | undefined, digits = 0): string {
  const num = toNumber(value);
  return `${formatNumber(num * 100, digits)}%`;
}

/** Format a value that is already a percentage (e.g. 35.11 → "35%"), not a ratio. */
export function formatPercentRaw(value: string | number | null | undefined, digits = 0): string {
  const num = toNumber(value);
  return `${formatNumber(num, digits)}%`;
}

export function formatDate(value?: string | null): string {
  if (!value) return "No date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

/** Diagnostic card style: neutral base, severity communicated via accent stripe only. */
export function toneClasses(tone?: string): string {
  if (tone === "danger") return "border-pds-signalRed/20 bg-pds-card/30 text-bm-text";
  if (tone === "warn") return "border-pds-signalOrange/20 bg-pds-card/30 text-bm-text";
  if (tone === "positive") return "border-pds-signalGreen/20 bg-pds-card/30 text-bm-text";
  return "border-pds-divider bg-pds-card/30 text-bm-text";
}

export function accentStripeClass(tone?: string): string {
  if (tone === "danger") return "bg-pds-signalRed";
  if (tone === "warn") return "bg-pds-signalOrange";
  if (tone === "positive") return "bg-pds-signalGreen";
  return "bg-pds-gold/40";
}

export function signalDotClass(status?: string): string {
  if (status === "red") return "bg-pds-signalRed";
  if (status === "orange") return "bg-pds-signalOrange";
  if (status === "yellow") return "bg-pds-signalYellow";
  return "bg-pds-signalGreen";
}

export function healthBadgeClasses(status?: string): string {
  if (status === "red") return "bg-pds-signalRed/15 text-pds-signalRed";
  if (status === "orange") return "bg-pds-signalOrange/15 text-pds-signalOrange";
  if (status === "yellow") return "bg-pds-signalYellow/15 text-pds-signalYellow";
  return "bg-pds-signalGreen/15 text-pds-signalGreen";
}

export function reasonLabel(reason: string): string {
  return reason.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
