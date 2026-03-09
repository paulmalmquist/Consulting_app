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

export function formatCurrency(value: string | number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

export function formatNumber(value: string | number | null | undefined, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(toNumber(value));
}

export function formatPercent(value: string | number | null | undefined, digits = 0): string {
  return `${formatNumber(toNumber(value) * 100, digits)}%`;
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

export function toneClasses(tone?: string): string {
  if (tone === "danger") return "border-red-500/30 bg-red-500/10 text-red-100";
  if (tone === "warn") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
  if (tone === "positive") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  return "border-bm-border/70 bg-bm-surface/30 text-bm-text";
}

export function healthBadgeClasses(status?: string): string {
  if (status === "red") return "bg-red-500/15 text-red-200";
  if (status === "orange") return "bg-orange-400/15 text-orange-200";
  if (status === "yellow") return "bg-amber-400/15 text-amber-200";
  return "bg-emerald-500/15 text-emerald-200";
}

export function reasonLabel(reason: string): string {
  return reason.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}
