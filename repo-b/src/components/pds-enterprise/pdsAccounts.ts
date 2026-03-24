"use client";

import type {
  PdsV2AccountActionItem,
  PdsV2AccountDashboardRow,
} from "@/lib/bos-api";
import { toNumber } from "@/components/pds-enterprise/pdsEnterprise";

export type AccountAlertKey = "at_risk" | "missing_plan" | "staffing_issues";
export type AccountHealthBand = "healthy" | "watch" | "at_risk";
export type AccountSortKey = "priority" | "health" | "plan" | "revenue";

export const ACCOUNT_SORT_OPTIONS: Array<{ key: AccountSortKey; label: string }> = [
  { key: "priority", label: "Priority" },
  { key: "health", label: "Health" },
  { key: "plan", label: "Vs Plan" },
  { key: "revenue", label: "Revenue" },
];

export function bandLabel(band: AccountHealthBand): string {
  if (band === "at_risk") return "At Risk";
  if (band === "watch") return "Watch";
  return "Healthy";
}

export function coerceAlertKey(value?: string | null): AccountAlertKey | null {
  if (value === "at_risk" || value === "missing_plan" || value === "staffing_issues") return value;
  return null;
}

export function coerceHealthBand(value?: string | null): AccountHealthBand | null {
  if (value === "healthy" || value === "watch" || value === "at_risk") return value;
  return null;
}

export function coerceSortKey(value?: string | null): AccountSortKey {
  if (value === "health" || value === "plan" || value === "revenue") return value;
  return "priority";
}

export function bandStatus(band: AccountHealthBand): "green" | "amber" | "red" {
  if (band === "at_risk") return "red";
  if (band === "watch") return "amber";
  return "green";
}

export function bandBadgeClass(band: AccountHealthBand): string {
  if (band === "at_risk") return "bg-pds-signalRed/12 text-pds-signalRed border-pds-signalRed/25";
  if (band === "watch") return "bg-pds-signalOrange/12 text-pds-signalOrange border-pds-signalOrange/25";
  return "bg-pds-signalGreen/12 text-pds-signalGreen border-pds-signalGreen/25";
}

export function issueLabel(issueCode?: string | null): string {
  if (!issueCode) return "Stable";
  return issueCode.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function matchesAlert(row: PdsV2AccountDashboardRow, alert?: string | null): boolean {
  if (!alert) return true;
  if (alert === "at_risk") return row.health_score < 55;
  if (alert === "missing_plan") return toNumber(row.fee_plan) > 0 && toNumber(row.plan_variance_pct) < -10;
  if (alert === "staffing_issues") {
    return row.staffing_score < 60 || toNumber(row.timecard_compliance_pct) < 90;
  }
  return true;
}

export function matchesHealthBand(row: PdsV2AccountDashboardRow, healthBand?: string | null): boolean {
  if (!healthBand) return true;
  return row.health_band === healthBand;
}

export function filterAccounts(
  accounts: PdsV2AccountDashboardRow[],
  filters: { alert?: string | null; healthBand?: string | null },
): PdsV2AccountDashboardRow[] {
  return accounts.filter((row) => matchesAlert(row, filters.alert) && matchesHealthBand(row, filters.healthBand));
}

export function sortAccounts(
  accounts: PdsV2AccountDashboardRow[],
  sortKey: AccountSortKey,
  actions: PdsV2AccountActionItem[],
): PdsV2AccountDashboardRow[] {
  const actionOrder = new Map(actions.map((action, index) => [action.account_id, index]));
  return [...accounts].sort((left, right) => {
    if (sortKey === "priority") {
      const leftPriority = actionOrder.has(left.account_id) ? actionOrder.get(left.account_id)! : Number.MAX_SAFE_INTEGER;
      const rightPriority = actionOrder.has(right.account_id) ? actionOrder.get(right.account_id)! : Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return toNumber(left.health_score) - toNumber(right.health_score);
    }
    if (sortKey === "health") {
      return toNumber(left.health_score) - toNumber(right.health_score);
    }
    if (sortKey === "plan") {
      return toNumber(left.plan_variance_pct) - toNumber(right.plan_variance_pct);
    }
    return toNumber(right.ytd_revenue) - toNumber(left.ytd_revenue);
  });
}

export function defaultSelectedAccountId(
  accounts: PdsV2AccountDashboardRow[],
  actions: PdsV2AccountActionItem[],
): string | null {
  const visibleIds = new Set(accounts.map((row) => row.account_id));
  const firstAction = actions.find((action) => visibleIds.has(action.account_id));
  if (firstAction) return firstAction.account_id;
  return accounts[0]?.account_id ?? null;
}

export function buildAccountsQueryString(
  searchParams: URLSearchParams | { toString(): string } | string,
  updates: Record<string, string | null | undefined>,
): string {
  const next =
    typeof searchParams === "string"
      ? new URLSearchParams(searchParams)
      : new URLSearchParams(searchParams.toString());

  Object.entries(updates).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      next.delete(key);
      return;
    }
    next.set(key, value);
  });

  return next.toString();
}
