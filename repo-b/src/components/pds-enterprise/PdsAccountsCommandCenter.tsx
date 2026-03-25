"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { PdsMetricStrip } from "@/components/pds-enterprise/PdsMetricStrip";
import { RagBadge } from "@/components/pds-enterprise/RagBadge";
import {
  ACCOUNT_SORT_OPTIONS,
  bandBadgeClass,
  bandLabel,
  bandStatus,
  buildAccountsQueryString,
  coerceAlertKey,
  coerceHealthBand,
  coerceSortKey,
  defaultSelectedAccountId,
  filterAccounts,
  issueLabel,
  sortAccounts,
  type AccountHealthBand,
} from "@/components/pds-enterprise/pdsAccounts";
import {
  PDS_HORIZONS,
  PDS_ROLE_PRESETS,
  formatCurrency,
  formatNumber,
  formatPercentRaw,
  toNumber,
} from "@/components/pds-enterprise/pdsEnterprise";
import {
  getPdsAccountPreview,
  getPdsCommandCenter,
  type PdsV2AccountDashboardRow,
  type PdsV2AccountPreview,
  type PdsV2CommandCenter,
  type PdsV2Horizon,
  type PdsV2RolePreset,
} from "@/lib/bos-api";

const HEALTH_BANDS: AccountHealthBand[] = ["healthy", "watch", "at_risk"];

const TREND_META: Record<
  "improving" | "stable" | "deteriorating",
  { glyph: string; label: string; className: string }
> = {
  improving: { glyph: "^", label: "Improving", className: "text-pds-signalGreen" },
  stable: { glyph: ">", label: "Stable", className: "text-bm-muted2" },
  deteriorating: { glyph: "v", label: "Deteriorating", className: "text-pds-signalRed" },
};

function alertCardClasses(tone?: string, active = false): string {
  if (tone === "danger") {
    return active
      ? "border-pds-signalRed/40 bg-pds-signalRed/[0.09]"
      : "border-pds-signalRed/20 bg-pds-signalRed/[0.05]";
  }
  if (tone === "warn") {
    return active
      ? "border-pds-signalOrange/40 bg-pds-signalOrange/[0.09]"
      : "border-pds-signalOrange/20 bg-pds-signalOrange/[0.05]";
  }
  return active ? "border-pds-accent/40 bg-pds-accent/[0.08]" : "border-bm-border/70 bg-bm-surface/20";
}

function healthBarClass(band: AccountHealthBand): string {
  if (band === "at_risk") return "bg-pds-signalRed";
  if (band === "watch") return "bg-pds-signalOrange";
  return "bg-pds-signalGreen";
}

function formatSignedPercent(value: string | number | null | undefined, digits = 1): string {
  const amount = toNumber(value);
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${formatPercentRaw(amount, digits)}`;
}

function optionalPercent(value: string | number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || value === "") return "-";
  return formatPercentRaw(value, digits);
}

function optionalNumber(value: string | number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || value === "") return "-";
  return formatNumber(value, digits);
}

function trendSummary(trend: "improving" | "stable" | "deteriorating"): string {
  const meta = TREND_META[trend];
  return `${meta.glyph} ${meta.label}`;
}

function rowIssueSummary(row: Pick<PdsV2AccountDashboardRow, "reason_codes" | "primary_issue_code">): string {
  if (row.reason_codes.length > 0) return row.reason_codes.slice(0, 2).map(issueLabel).join(" / ");
  if (row.primary_issue_code) return issueLabel(row.primary_issue_code);
  return "No active issues";
}

function severityToRag(status?: string): "green" | "amber" | "red" | "unknown" {
  if (status === "red") return "red";
  if (status === "orange" || status === "yellow") return "amber";
  if (status === "green") return "green";
  return "unknown";
}

function SectionHeader({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">{label}</p>
      <div className="space-y-0.5">
        <h3 className="text-base font-semibold text-bm-text">{title}</h3>
        {subtitle ? <p className="text-sm text-bm-muted2">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-bm-border/70 bg-bm-surface/10 p-6 text-sm text-bm-muted2">
      <p className="font-medium text-bm-text">{title}</p>
      <p className="mt-1">{body}</p>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  toneClass = "text-bm-text",
}: {
  label: string;
  value: string;
  toneClass?: string;
}) {
  return (
    <div className="rounded-xl border border-bm-border/60 bg-[#101922] p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function AccountPreviewPanel({
  selectedRow,
  preview,
  loading,
  error,
  onClose,
}: {
  selectedRow: PdsV2AccountDashboardRow | null;
  preview: PdsV2AccountPreview | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  if (!selectedRow && !preview && !loading && !error) {
    return <EmptyState title="Select an account" body="Choose an account from alerts, rankings, or action items to open its inline preview." />;
  }

  const accountName = preview?.account_name ?? selectedRow?.account_name ?? "Account";
  const ownerName = preview?.owner_name ?? selectedRow?.owner_name ?? "Unassigned";
  const healthBand = preview?.health_band ?? selectedRow?.health_band ?? "watch";
  const healthScore = preview?.health_score ?? selectedRow?.health_score ?? 0;
  const trend = preview?.trend ?? selectedRow?.trend ?? "stable";
  const issueText =
    preview?.primary_issue_code
      ? issueLabel(preview.primary_issue_code)
      : selectedRow?.primary_issue_code
        ? issueLabel(selectedRow.primary_issue_code)
        : "Stable";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Account Preview</p>
          <h3 className="text-xl font-semibold text-bm-text">{accountName}</h3>
          <p className="text-sm text-bm-muted2">Owner: {ownerName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-bm-border/60 px-3 py-1.5 text-xs font-medium text-bm-muted2 transition hover:border-bm-border hover:text-bm-text"
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${bandBadgeClass(healthBand)}`}>
          {bandLabel(healthBand)}
        </span>
        <RagBadge status={bandStatus(healthBand)} label={`Health ${healthScore}`} />
        <span className={`rounded-full border border-bm-border/60 px-2.5 py-1 text-[11px] font-medium ${TREND_META[trend].className}`}>
          {trendSummary(trend)}
        </span>
        <span className="rounded-full border border-bm-border/60 px-2.5 py-1 text-[11px] font-medium text-bm-muted2">
          {issueText}
        </span>
      </div>

      {error ? (
        <div className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-4 text-sm text-pds-signalRed">{error}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <PreviewMetric label="Revenue YTD" value={formatCurrency(preview?.ytd_revenue ?? selectedRow?.ytd_revenue ?? 0)} />
        <PreviewMetric
          label="Vs Plan"
          value={formatSignedPercent(preview?.plan_variance_pct ?? selectedRow?.plan_variance_pct ?? 0)}
          toneClass={toNumber(preview?.plan_variance_pct ?? selectedRow?.plan_variance_pct ?? 0) < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}
        />
      </div>

      {loading && !preview ? (
        <div className="rounded-2xl border border-bm-border/60 bg-bm-surface/15 p-4 text-sm text-bm-muted2">Loading account detail...</div>
      ) : null}

      {preview ? (
        <>
          <section className="space-y-3 rounded-2xl border border-bm-border/70 bg-bm-surface/18 p-4">
            <SectionHeader label="Score Breakdown" title="Account Health Composition" subtitle="Composite score out of 100." />
            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewMetric label="Revenue Score" value={formatNumber(preview.score_breakdown.revenue_score, 0)} />
              <PreviewMetric label="Staffing Score" value={formatNumber(preview.score_breakdown.staffing_score, 0)} />
              <PreviewMetric label="Timecard Score" value={formatNumber(preview.score_breakdown.timecard_score, 0)} />
              <PreviewMetric label="Client Score" value={formatNumber(preview.score_breakdown.client_score, 0)} />
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-bm-border/70 bg-bm-surface/18 p-4">
            <SectionHeader label="Operating Detail" title="Staffing, Timecards, and Satisfaction" />
            <div className="grid gap-3 sm:grid-cols-2">
              <PreviewMetric label="Utilization" value={optionalPercent(preview.team_utilization_pct)} />
              <PreviewMetric label="Timecard Compliance" value={optionalPercent(preview.timecard_compliance_pct)} />
              <PreviewMetric label="Staffing Score" value={formatNumber(preview.staffing_score, 0)} />
              <PreviewMetric label="Satisfaction" value={optionalNumber(preview.satisfaction_score)} />
            </div>
            <div className="grid gap-3 text-sm text-bm-muted2 sm:grid-cols-2">
              <div className="rounded-xl border border-bm-border/60 bg-[#101922] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Capacity Pressure</p>
                <p className="mt-1 text-sm text-bm-text">
                  {preview.overloaded_resources} overloaded / {preview.staffing_gap_resources} gaps
                </p>
              </div>
              <div className="rounded-xl border border-bm-border/60 bg-[#101922] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Client Trend</p>
                <p className="mt-1 text-sm text-bm-text">{formatSignedPercent(preview.satisfaction_trend_delta ?? 0, 1)}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-bm-border/70 bg-bm-surface/18 p-4">
            <SectionHeader label="Action Required" title="Recommended Intervention" />
            <div className="rounded-xl border border-pds-accent/20 bg-pds-accent/[0.08] p-4">
              <p className="text-sm font-medium text-bm-text">{preview.recommended_action || "Monitor weekly for new issues."}</p>
              <p className="mt-1 text-sm text-bm-muted2">
                Impact: {preview.impact_label || "No quantified impact available"} / Owner: {preview.recommended_owner || ownerName}
              </p>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-bm-border/70 bg-bm-surface/18 p-4">
            <SectionHeader label="Project Risks" title="Top Active Project Risks" />
            {preview.top_project_risks.length > 0 ? (
              <div className="space-y-3">
                {preview.top_project_risks.map((risk) => (
                  <a
                    key={risk.project_id}
                    href={risk.href}
                    className="block rounded-xl border border-bm-border/60 bg-[#101922] p-3 transition hover:border-bm-border hover:bg-[#15202b]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium text-bm-text">{risk.project_name}</p>
                        <p className="text-sm text-bm-muted2">{risk.issue_summary}</p>
                      </div>
                      <RagBadge status={severityToRag(risk.severity)} label={formatNumber(risk.risk_score, 0)} />
                    </div>
                    {risk.recommended_action ? (
                      <p className="mt-2 text-xs text-bm-muted2">Next: {risk.recommended_action}</p>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState title="No project risks surfaced" body="This account does not have an active project watchlist in the latest snapshot." />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function AccountsToolbar({
  horizon,
  rolePreset,
  generatedAt,
  onHorizonChange,
  onRolePresetChange,
}: {
  horizon: PdsV2Horizon;
  rolePreset: PdsV2RolePreset;
  generatedAt?: string;
  onHorizonChange: (value: PdsV2Horizon) => void;
  onRolePresetChange: (value: PdsV2RolePreset) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Operating Lens</p>
        <h2 className="text-base font-semibold text-bm-text">Account Command Center</h2>
        <p className="mt-1 text-sm text-bm-muted2">Which accounts need attention, why they matter, and what action is required next.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-bm-border/50 bg-bm-surface/15 p-0.5">
          {PDS_HORIZONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onHorizonChange(item.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                horizon === item.key
                  ? "border border-pds-accent/30 bg-pds-accent/15 text-pds-accentText"
                  : "border border-transparent text-bm-muted2 hover:text-bm-text"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <select
          value={rolePreset}
          onChange={(event) => onRolePresetChange(event.target.value as PdsV2RolePreset)}
          className="rounded-lg border border-bm-border/50 bg-bm-surface/15 px-3 py-1.5 text-xs font-medium text-bm-text outline-none"
          aria-label="Role Preset"
        >
          {PDS_ROLE_PRESETS.filter((preset) => preset.key !== "market_leader" && preset.key !== "business_line_leader").map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>

        <span className="text-[11px] text-bm-muted2">
          {generatedAt ? `Updated ${new Date(generatedAt).toLocaleString()}` : "Latest snapshot"}
        </span>
      </div>
    </section>
  );
}

export function PdsAccountsCommandCenter() {
  const { envId, businessId } = useDomainEnv();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [horizon, setHorizon] = useState<PdsV2Horizon>("YTD");
  const [rolePreset, setRolePreset] = useState<PdsV2RolePreset>("account_director");
  const [commandCenter, setCommandCenter] = useState<PdsV2CommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PdsV2AccountPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const alert = coerceAlertKey(searchParams.get("alert"));
  const healthBand = coerceHealthBand(searchParams.get("health_band"));
  const sortKey = coerceSortKey(searchParams.get("sort"));
  const selectedAccountId = searchParams.get("selected_account");
  const searchParamString = searchParams.toString();

  function replaceUrlState(updates: Record<string, string | null | undefined>) {
    const nextQuery = buildAccountsQueryString(searchParams, updates);
    const nextHref = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const currentHref = searchParamString ? `${pathname}?${searchParamString}` : pathname;
    if (nextHref === currentHref) return;
    router.replace(nextHref, { scroll: false });
  }

  useEffect(() => {
    if (!envId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await getPdsCommandCenter(envId, {
          business_id: businessId || undefined,
          lens: "account",
          horizon,
          role_preset: rolePreset,
        });
        if (cancelled) return;
        setCommandCenter(payload);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load Accounts command center");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, horizon, rolePreset]);

  const dashboard = commandCenter?.account_dashboard ?? null;
  const filteredAccounts = dashboard ? filterAccounts(dashboard.accounts, { alert, healthBand }) : [];
  const orderedAccounts = dashboard ? sortAccounts(filteredAccounts, sortKey, dashboard.actions) : [];
  const visibleAccountIds = new Set(orderedAccounts.map((row) => row.account_id));
  const visibleActions = dashboard?.actions.filter((action) => visibleAccountIds.has(action.account_id)) ?? [];
  const rankedAccounts = orderedAccounts.slice(0, 10);
  const topPerforming = [...filteredAccounts]
    .sort((left, right) => {
      const byPlan = toNumber(right.plan_variance_pct) - toNumber(left.plan_variance_pct);
      if (byPlan !== 0) return byPlan;
      return toNumber(right.ytd_revenue) - toNumber(left.ytd_revenue);
    })
    .slice(0, 5);
  const mostAtRisk = [...filteredAccounts]
    .sort((left, right) => {
      const byHealth = toNumber(left.health_score) - toNumber(right.health_score);
      if (byHealth !== 0) return byHealth;
      return toNumber(left.plan_variance_pct) - toNumber(right.plan_variance_pct);
    })
    .slice(0, 5);
  const selectedRow = orderedAccounts.find((row) => row.account_id === selectedAccountId) ?? null;

  useEffect(() => {
    if (!dashboard) return;

    if (orderedAccounts.length === 0) {
      if (selectedAccountId) replaceUrlState({ selected_account: null });
      return;
    }

    if (selectedAccountId && visibleAccountIds.has(selectedAccountId)) return;

    const nextSelectedAccountId = defaultSelectedAccountId(orderedAccounts, dashboard.actions);
    if (nextSelectedAccountId) {
      replaceUrlState({ selected_account: nextSelectedAccountId });
    }
  }, [dashboard, orderedAccounts, searchParamString, selectedAccountId]);

  useEffect(() => {
    if (!envId || !selectedAccountId) {
      setPreview(null);
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    const activeAccountId = selectedAccountId;
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const payload = await getPdsAccountPreview(envId, activeAccountId, {
          business_id: businessId || undefined,
          horizon,
        });
        if (cancelled) return;
        setPreview(payload);
      } catch (loadError) {
        if (cancelled) return;
        setPreview(null);
        setPreviewError(loadError instanceof Error ? loadError.message : "Failed to load account preview");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, horizon, selectedAccountId]);

  if (!envId) {
    return <EmptyState title="Environment unavailable" body="The Accounts workspace needs an active environment binding before it can load." />;
  }

  if (loading && !commandCenter) {
    return (
      <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">
        Loading Accounts command center...
      </div>
    );
  }

  if (error && !commandCenter) {
    return (
      <div className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-4 text-sm text-pds-signalRed">
        {error}
      </div>
    );
  }

  if (!commandCenter || !dashboard) return null;

  return (
    <div className="space-y-5" data-testid="pds-accounts-command-center">
      <section className="rounded-xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_40%)] bg-bm-surface/[0.92] px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-bm-text">Accounts</h1>
              <span className="rounded-full border border-pds-accent/20 px-2 py-0.5 text-[10px] font-medium text-pds-accentText">
                PDS Enterprise OS
              </span>
            </div>
            <p className="mt-0.5 text-xs text-bm-muted2">
              Account health, plan variance, staffing pressure, and intervention paths on one operating surface.
            </p>
          </div>
          <div className="rounded-lg border border-bm-border/50 bg-bm-surface/15 px-3 py-2 text-xs text-bm-muted2">
            The page answers one question: which accounts matter right now, why, and what do we do about them?
          </div>
        </div>
      </section>

      <AccountsToolbar
        horizon={horizon}
        rolePreset={rolePreset}
        generatedAt={commandCenter.generated_at}
        onHorizonChange={setHorizon}
        onRolePresetChange={setRolePreset}
      />

      <section className="grid gap-3 lg:grid-cols-3" data-testid="pds-account-alerts">
        {dashboard.alerts.map((item) => {
          const isActive = alert === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => replaceUrlState({ alert: isActive ? null : item.key })}
              className={`rounded-2xl border p-4 text-left transition hover:translate-y-[-1px] hover:border-bm-border ${alertCardClasses(item.tone, isActive)}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Account Alert</p>
              <p className="mt-2 text-3xl font-semibold text-bm-text">{formatNumber(item.count, 0)}</p>
              <p className="mt-1 text-sm font-medium text-bm-text">{item.label}</p>
              <p className="mt-2 text-sm text-bm-muted2">{item.description || "Filter this page to the flagged accounts."}</p>
              <p className="mt-3 text-xs font-medium text-bm-muted2">{isActive ? "Filter active" : "Click to filter page"}</p>
            </button>
          );
        })}
      </section>

      <PdsMetricStrip metrics={commandCenter.metrics_strip ?? []} />

      {(alert || healthBand || sortKey !== "priority") ? (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-bm-border/60 bg-bm-surface/12 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-bm-muted2">Active view:</span>
            {alert ? <span className="rounded-full border border-bm-border/60 px-2 py-1 text-bm-text">{issueLabel(alert)}</span> : null}
            {healthBand ? <span className={`rounded-full border px-2 py-1 ${bandBadgeClass(healthBand)}`}>{bandLabel(healthBand)}</span> : null}
            {sortKey !== "priority" ? (
              <span className="rounded-full border border-bm-border/60 px-2 py-1 text-bm-text">
                Sorted by {ACCOUNT_SORT_OPTIONS.find((option) => option.key === sortKey)?.label}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => replaceUrlState({ alert: null, health_band: null, sort: null })}
            className="rounded-lg border border-bm-border/60 px-3 py-1.5 text-xs font-medium text-bm-muted2 transition hover:border-bm-border hover:text-bm-text"
          >
            Clear filters
          </button>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-12">
            <section className="space-y-4 rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4 xl:col-span-8" data-testid="pds-account-health-overview">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <SectionHeader
                  label="Account Health Overview"
                  title="Health distribution and ranked intervention list"
                  subtitle="Use the distribution chips to focus the page, then select an account to open the preview."
                />
                <div className="flex flex-wrap gap-1.5">
                  {ACCOUNT_SORT_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => replaceUrlState({ sort: option.key === "priority" ? null : option.key })}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        sortKey === option.key
                          ? "border-pds-accent/30 bg-pds-accent/15 text-pds-accentText"
                          : "border-bm-border/60 text-bm-muted2 hover:border-bm-border hover:text-bm-text"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                {HEALTH_BANDS.map((band) => {
                  const isActive = healthBand === band;
                  const count = dashboard.distribution[band] ?? 0;
                  return (
                    <button
                      key={band}
                      type="button"
                      onClick={() => replaceUrlState({ health_band: isActive ? null : band })}
                      className={`rounded-2xl border p-3 text-left transition hover:border-bm-border ${
                        isActive ? `${bandBadgeClass(band)} border` : "border-bm-border/60 bg-[#101922] text-bm-text"
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">Health Band</p>
                      <p className="mt-2 text-2xl font-semibold">{formatNumber(count, 0)}</p>
                      <p className="mt-1 text-sm font-medium">{bandLabel(band)}</p>
                    </button>
                  );
                })}
              </div>

              {rankedAccounts.length > 0 ? (
                <div className="space-y-3">
                  {rankedAccounts.map((account) => {
                    const isSelected = selectedAccountId === account.account_id;
                    return (
                      <button
                        key={account.account_id}
                        type="button"
                        onClick={() => replaceUrlState({ selected_account: account.account_id })}
                        className={`w-full rounded-2xl border p-4 text-left transition hover:border-bm-border hover:bg-[#15202b] ${
                          isSelected
                            ? "border-pds-accent/30 bg-pds-accent/[0.08]"
                            : "border-bm-border/60 bg-[#101922]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium text-bm-text">{account.account_name}</p>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${bandBadgeClass(account.health_band)}`}>
                                {bandLabel(account.health_band)}
                              </span>
                            </div>
                            <p className="text-sm text-bm-muted2">{rowIssueSummary(account)}</p>
                          </div>

                          <div className="text-right">
                            <p className="text-lg font-semibold text-bm-text">{formatNumber(account.health_score, 0)}</p>
                            <p className={`text-xs font-medium ${TREND_META[account.trend].className}`}>
                              {trendSummary(account.trend)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-bm-border/50">
                            <div
                              className={`h-full rounded-full ${healthBarClass(account.health_band)}`}
                              style={{ width: `${Math.max(6, Math.min(100, toNumber(account.health_score)))}%` }}
                            />
                          </div>
                          <div className={`w-16 text-right text-xs font-semibold tabular-nums ${toNumber(account.plan_variance_pct) < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}`}>
                            {formatSignedPercent(account.plan_variance_pct)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No accounts match the active filters" body="Clear the current alert or health-band filter to repopulate the health ranking." />
              )}
            </section>

            <section className="space-y-4 rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4 xl:col-span-4" data-testid="pds-account-action-required">
              <SectionHeader
                label="Action Required"
                title="Accounts to act on today"
                subtitle="Severity first, then impact."
              />

              {visibleActions.length > 0 ? (
                <div className="space-y-3">
                  {visibleActions.map((action) => (
                    <button
                      key={action.account_id}
                      type="button"
                      onClick={() => replaceUrlState({ selected_account: action.account_id })}
                      className={`w-full rounded-2xl border p-4 text-left transition hover:border-bm-border hover:bg-[#15202b] ${
                        selectedAccountId === action.account_id
                          ? "border-pds-accent/30 bg-pds-accent/[0.08]"
                          : "border-bm-border/60 bg-[#101922]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-medium text-bm-text">{action.account_name}</p>
                          <p className="text-sm text-bm-muted2">{action.issue}</p>
                        </div>
                        <RagBadge status={bandStatus(action.health_band)} label={`Health ${action.health_score}`} />
                      </div>
                      <p className="mt-3 text-sm text-bm-text">{action.impact_label}</p>
                      <p className="mt-2 text-xs text-bm-muted2">
                        Action: {action.recommended_action} / Owner: {action.recommended_owner || action.owner_name || "Account lead"}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No immediate interventions" body="The current filter set does not surface any accounts that need action." />
              )}
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className="space-y-4 rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-top-performing-accounts">
              <SectionHeader label="Top Accounts" title="Top Performing" subtitle="Highest plan attainment, tie-broken by revenue." />
              {topPerforming.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-bm-border/60">
                  <div className="grid grid-cols-[minmax(0,1.3fr)_0.8fr_0.7fr_0.9fr] gap-3 bg-[#101922] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
                    <span>Account</span>
                    <span>Revenue</span>
                    <span>Vs Plan</span>
                    <span>Owner</span>
                  </div>
                  {topPerforming.map((row) => (
                    <button
                      key={row.account_id}
                      type="button"
                      onClick={() => replaceUrlState({ selected_account: row.account_id })}
                      className="grid w-full grid-cols-[minmax(0,1.3fr)_0.8fr_0.7fr_0.9fr] gap-3 border-t border-bm-border/60 bg-bm-surface/10 px-4 py-3 text-left text-sm transition hover:bg-[#15202b]"
                    >
                      <span className="min-w-0 truncate font-medium text-bm-text">{row.account_name}</span>
                      <span className="text-bm-text">{formatCurrency(row.ytd_revenue)}</span>
                      <span className={toNumber(row.plan_variance_pct) < 0 ? "text-pds-signalRed" : "text-pds-signalGreen"}>
                        {formatSignedPercent(row.plan_variance_pct)}
                      </span>
                      <span className="truncate text-bm-muted2">{row.owner_name || "Unassigned"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No top performers in view" body="Try clearing the active filter to restore the leaderboard." />
              )}
            </section>

            <section className="space-y-4 rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-most-at-risk-accounts">
              <SectionHeader label="Top Accounts" title="Most At Risk" subtitle="Lowest health scores and clearest intervention cases." />
              {mostAtRisk.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-bm-border/60">
                  <div className="grid grid-cols-[minmax(0,1.1fr)_0.6fr_1.2fr_0.9fr] gap-3 bg-[#101922] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-bm-muted2">
                    <span>Account</span>
                    <span>Health</span>
                    <span>Issues</span>
                    <span>Impact</span>
                  </div>
                  {mostAtRisk.map((row) => (
                    <button
                      key={row.account_id}
                      type="button"
                      onClick={() => replaceUrlState({ selected_account: row.account_id })}
                      className="grid w-full grid-cols-[minmax(0,1.1fr)_0.6fr_1.2fr_0.9fr] gap-3 border-t border-bm-border/60 bg-bm-surface/10 px-4 py-3 text-left text-sm transition hover:bg-[#15202b]"
                    >
                      <span className="min-w-0 truncate font-medium text-bm-text">{row.account_name}</span>
                      <span className="text-bm-text">{formatNumber(row.health_score, 0)}</span>
                      <span className="min-w-0 truncate text-bm-muted2">{rowIssueSummary(row)}</span>
                      <span className="min-w-0 truncate text-bm-muted2">{row.impact_label || "-"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <EmptyState title="No risk list in view" body="The current filter set removed all at-risk accounts from this section." />
              )}
            </section>
          </div>
        </div>

        <aside className="hidden xl:block" data-testid="pds-account-preview-desktop">
          <section className="sticky top-6 rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4">
            <AccountPreviewPanel
              selectedRow={selectedRow}
              preview={preview}
              loading={previewLoading}
              error={previewError}
              onClose={() => replaceUrlState({ selected_account: null })}
            />
          </section>
        </aside>
      </div>

      {selectedAccountId ? (
        <div
          className="fixed inset-0 z-40 bg-black/45 xl:hidden"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) replaceUrlState({ selected_account: null });
          }}
          data-testid="pds-account-preview-mobile"
        >
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[28px] border border-bm-border/70 bg-[#08111a] p-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-bm-border/80" />
            <AccountPreviewPanel
              selectedRow={selectedRow}
              preview={preview}
              loading={previewLoading}
              error={previewError}
              onClose={() => replaceUrlState({ selected_account: null })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
