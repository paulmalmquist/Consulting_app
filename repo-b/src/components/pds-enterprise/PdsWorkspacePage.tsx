"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  buildPdsReportPacket,
  createPdsReportExportRun,
  downloadPdsReportExport,
  getPdsCommandCenter,
  listPdsReportExportRuns,
  type PdsV2CommandCenter,
  type PdsV2AlertFilter,
  type PdsV2ReportExportRun,
  type PdsV2Horizon,
  type PdsV2InterventionQueueItem,
  type PdsV2Lens,
  type PdsV2MetricCard,
  type PdsV2ReportPacket,
  type PdsV2RolePreset,
} from "@/lib/bos-api";
import { useDomainEnv } from "@/components/domain/DomainEnvProvider";
import { PdsMetricStrip } from "@/components/pds-enterprise/PdsMetricStrip";
import { PdsLensToolbar } from "@/components/pds-enterprise/PdsLensToolbar";
import { PdsPerformanceTable } from "@/components/pds-enterprise/PdsPerformanceTable";
import { PdsDeliveryRiskPanel } from "@/components/pds-enterprise/PdsDeliveryRiskPanel";
import { PdsResourceHealthPanel } from "@/components/pds-enterprise/PdsResourceHealthPanel";
import { PdsForecastPanel } from "@/components/pds-enterprise/PdsForecastPanel";
import { PdsSatisfactionCloseoutPanel } from "@/components/pds-enterprise/PdsSatisfactionCloseoutPanel";
import { PdsExecutiveBriefingPanel } from "@/components/pds-enterprise/PdsExecutiveBriefingPanel";
import { PdsInterventionQueue } from "@/components/pds-enterprise/PdsInterventionQueue";
import { PdsSignalsStrip } from "@/components/pds-enterprise/PdsSignalsStrip";
import { PdsMarketLeaderboard } from "@/components/pds-enterprise/PdsMarketLeaderboard";
import { PdsVarianceChart } from "@/components/pds-enterprise/PdsVarianceChart";
import { PdsMarketMap, type MapColorMode } from "@/components/pds-enterprise/PdsMarketMap";
import { PdsRankedMarketList } from "@/components/pds-enterprise/PdsRankedMarketList";
import { PdsOperatingBrief } from "@/components/pds-enterprise/PdsOperatingBrief";
import { PdsInsightPanel } from "@/components/pds-enterprise/PdsInsightPanel";
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

export type PdsWorkspaceSection =
  | "operatingPosture"
  | "performance"
  | "leaderboard"
  | "varianceChart"
  | "signals"
  | "deliveryRisk"
  | "resourceHealth"
  | "forecast"
  | "satisfactionCloseout"
  | "briefing"
  | "interventionQueue"
  | "reportPacket";

type ModuleNote = {
  label: string;
  title: string;
  body: string;
};

type PdsMobilePanel =
  | "operatingPosture"
  | "performance"
  | "resourceHealth"
  | "deliveryRisk"
  | "forecast"
  | "satisfactionCloseout"
  | "briefing"
  | "reportPacket";

type Props = {
  title: string;
  description?: string;
  defaultLens?: PdsV2Lens;
  defaultHorizon?: PdsV2Horizon;
  defaultRolePreset?: PdsV2RolePreset;
  sections: PdsWorkspaceSection[];
  moduleNotes?: ModuleNote[];
  reportPacketType?: string;
};

function PdsSectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mt-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">{label}</p>
      <h3 className="text-base font-semibold text-bm-text">{title}</h3>
    </div>
  );
}

function uniqueTopReasons(filters: PdsV2AlertFilter[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const filter of filters) {
    for (const reason of filter.reason_codes || []) {
      const normalized = reason.replace(/_/g, " ").toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      labels.push(normalized);
      if (labels.length >= 3) return labels;
    }
  }
  return labels;
}

function OperatingPosturePanel({ commandCenter }: { commandCenter: PdsV2CommandCenter }) {
  const atRiskProjects = commandCenter.delivery_risk.filter((item) => item.severity === "red" || item.severity === "critical").length;
  const totalVariance = commandCenter.performance_table.rows.reduce((sum, row) => sum + Number(row.fee_variance || 0), 0);
  const topDrivers = uniqueTopReasons(commandCenter.alert_filters || []);

  return (
    <section className="rounded-[24px] border border-bm-border/70 bg-bm-surface/20 p-5" data-testid="pds-operating-posture">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-bm-muted2">Operating Posture</p>
          <h3 className="mt-1 text-xl font-semibold text-bm-text">Are we in trouble?</h3>
        </div>
        <p className="text-xs text-bm-muted2">Three numbers, then the queue.</p>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-pds-signalRed/25 bg-pds-signalRed/10 p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">At-Risk Projects</p>
          <p className="mt-1 text-3xl font-semibold text-bm-text">{atRiskProjects}</p>
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Total Variance</p>
          <p className={`mt-1 text-3xl font-semibold ${totalVariance < 0 ? "text-pds-signalRed" : "text-bm-text"}`}>
            {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(totalVariance)}
          </p>
        </div>
        <div className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4">
          <p className="text-[10px] uppercase tracking-[0.14em] text-bm-muted2">Top 3 Drivers</p>
          <div className="mt-2 space-y-1.5">
            {topDrivers.length > 0 ? topDrivers.map((driver) => (
              <p key={driver} className="text-sm text-bm-text capitalize">{driver}</p>
            )) : <p className="text-sm text-bm-muted2">No concentrated drivers surfaced.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatReportRunTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ReportPacketPanel({
  packet,
  exportError,
  exportInFlight,
  runs,
  onExport,
  onDownloadRun,
}: {
  packet: PdsV2ReportPacket;
  exportError: string | null;
  exportInFlight: "pdf" | "xlsx" | null;
  runs: PdsV2ReportExportRun[];
  onExport: (format: "pdf" | "xlsx") => void;
  onDownloadRun: (runId: string, format: "pdf" | "xlsx", title: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-report-packet-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Report Packet</p>
          <h3 className="text-xl font-semibold">{packet.title}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-bm-muted2">Generated from the same snapshot package as the command center.</p>
          <button
            type="button"
            onClick={() => onExport("pdf")}
            disabled={exportInFlight !== null}
            className="rounded-lg border border-bm-border/70 bg-bm-surface/40 px-3 py-1.5 text-xs font-medium text-bm-text disabled:opacity-60"
          >
            {exportInFlight === "pdf" ? "Exporting PDF..." : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={() => onExport("xlsx")}
            disabled={exportInFlight !== null}
            className="rounded-lg border border-bm-border/70 bg-bm-surface/40 px-3 py-1.5 text-xs font-medium text-bm-text disabled:opacity-60"
          >
            {exportInFlight === "xlsx" ? "Exporting XLSX..." : "Export XLSX"}
          </button>
        </div>
      </div>
      <p className="mt-4 text-sm text-bm-muted2">{packet.narrative || "Narrative pending."}</p>
      {exportError ? <p className="mt-3 text-sm text-pds-signalRed">{exportError}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {packet.sections.map((section, index) => (
          <article key={`${section.key || section.title || index}`} className="rounded-xl border border-bm-border/60 bg-[#101922] p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">{String(section.key || "section")}</p>
            <h4 className="mt-1 font-semibold">{String(section.title || "Section")}</h4>
          </article>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-bm-border/60 bg-[#101922] p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">Recent Exports</p>
            <h4 className="mt-1 font-semibold">Saved Report Runs</h4>
          </div>
          <p className="text-xs text-bm-muted2">Runs are generated from the saved packet and downloadable on demand.</p>
        </div>
        <div className="mt-3 space-y-2">
          {runs.length === 0 ? (
            <p className="text-sm text-bm-muted2">No saved exports yet. Generate the first PDF or XLSX from this packet.</p>
          ) : (
            runs.map((run) => (
              <div key={run.report_run_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bm-border/50 bg-bm-surface/20 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-bm-text">{run.title}</p>
                  <p className="text-xs text-bm-muted2">
                    {run.packet_type.replace(/_/g, " ")} • {formatReportRunTime(run.created_at)} • {run.horizon}
                  </p>
                </div>
                <div className="flex gap-2">
                  {run.available_formats.includes("pdf") ? (
                    <button
                      type="button"
                      onClick={() => onDownloadRun(run.report_run_id, "pdf", run.title)}
                      className="rounded-lg border border-bm-border/60 px-3 py-1.5 text-xs font-medium text-bm-text"
                    >
                      PDF
                    </button>
                  ) : null}
                  {run.available_formats.includes("xlsx") ? (
                    <button
                      type="button"
                      onClick={() => onDownloadRun(run.report_run_id, "xlsx", run.title)}
                      className="rounded-lg border border-bm-border/60 px-3 py-1.5 text-xs font-medium text-bm-text"
                    >
                      XLSX
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function PdsWorkspacePage({
  title,
  description,
  defaultLens = "market",
  defaultHorizon = "YTD",
  defaultRolePreset = "executive",
  sections,
  moduleNotes = [],
  reportPacketType,
}: Props) {
  const { envId, businessId } = useDomainEnv();
  const [lens, setLens] = useState<PdsV2Lens>(defaultLens);
  const [horizon, setHorizon] = useState<PdsV2Horizon>(defaultHorizon);
  const [rolePreset, setRolePreset] = useState<PdsV2RolePreset>(defaultRolePreset);
  const [commandCenter, setCommandCenter] = useState<PdsV2CommandCenter | null>(null);
  const [reportPacket, setReportPacket] = useState<PdsV2ReportPacket | null>(null);
  const [reportRuns, setReportRuns] = useState<PdsV2ReportExportRun[]>([]);
  const [reportExportError, setReportExportError] = useState<string | null>(null);
  const [reportExportInFlight, setReportExportInFlight] = useState<"pdf" | "xlsx" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceView, setPerformanceView] = useState<"chart" | "table">("chart");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PdsMobilePanel | null>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [activeFilterKey, setActiveFilterKey] = useState<string | null>(null);
  const [selectedInterventionId, setSelectedInterventionId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [mapColorMode, setMapColorMode] = useState<MapColorMode>("revenue_variance");
  const [focusSource, setFocusSource] = useState<"brief" | "chip" | "kpi" | "map" | "list" | "queue">("brief");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [commandCenterPayload, reportPayload, reportRunsPayload] = await Promise.all([
          getPdsCommandCenter(envId, {
            business_id: businessId || undefined,
            lens,
            horizon,
            role_preset: rolePreset,
          }),
          reportPacketType
            ? buildPdsReportPacket({
                env_id: envId,
                business_id: businessId || undefined,
                packet_type: reportPacketType,
                lens,
                horizon,
                role_preset: rolePreset,
              })
            : Promise.resolve(null),
          reportPacketType
            ? listPdsReportExportRuns(envId, {
                business_id: businessId || undefined,
                packet_type: reportPacketType,
                limit: 6,
              })
            : Promise.resolve({ runs: [] }),
        ]);
        if (cancelled) return;
        setCommandCenter(commandCenterPayload);
        setReportPacket(reportPayload);
        setReportRuns(reportRunsPayload.runs);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load PDS command center");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [businessId, envId, horizon, lens, rolePreset, reportPacketType]);

  useEffect(() => {
    publishAssistantPageContext({
      route: envId ? `/lab/env/${envId}/pds` : null,
      surface: "pds_workspace",
      active_module: "pds",
      page_entity_type: "environment",
      page_entity_id: envId,
      page_entity_name: title,
      selected_entities: selectedEntityId ? [{ entity_id: selectedEntityId, entity_type: lens === "account" ? "account" : "market" }] : [],
      visible_data: {
        accounts: (commandCenter?.performance_table.rows || []).map((row) => ({
          entity_type: lens === "account" ? "account" : "market",
          entity_id: row.entity_id,
          name: row.entity_label,
          metadata: {
            health_status: row.health_status,
            owner_label: row.owner_label,
            fee_variance: row.fee_variance,
          },
        })),
        metrics: {
          lens,
          horizon,
          performance_rows: commandCenter?.performance_table.rows.length || 0,
          risk_items: commandCenter?.delivery_risk.length || 0,
        },
        notes: [description || "PDS enterprise command center"],
      },
    });
    return () => resetAssistantPageContext();
  }, [commandCenter, description, envId, horizon, lens, selectedEntityId, title]);

  useEffect(() => {
    if (!commandCenter) return;
    if (!selectedMarketId) {
      setSelectedMarketId(commandCenter.map_summary.focus_market_id || commandCenter.map_summary.points[0]?.market_id || null);
    }
  }, [commandCenter, selectedMarketId]);

  const hasVarianceOrLeaderboard = sections.includes("varianceChart") || sections.includes("leaderboard");
  const mobilePanels = React.useMemo<Array<{ key: PdsMobilePanel; label: string }>>(() => {
    const panels: Array<{ key: PdsMobilePanel; label: string }> = [];
    if (sections.includes("operatingPosture")) panels.push({ key: "operatingPosture", label: "Posture" });
    if (hasVarianceOrLeaderboard || sections.includes("performance")) panels.push({ key: "performance", label: "Performance" });
    if (sections.includes("resourceHealth")) panels.push({ key: "resourceHealth", label: "Resources" });
    if (sections.includes("deliveryRisk")) panels.push({ key: "deliveryRisk", label: "Risk" });
    if (sections.includes("forecast")) panels.push({ key: "forecast", label: "Forecast" });
    if (sections.includes("satisfactionCloseout")) panels.push({ key: "satisfactionCloseout", label: "Client" });
    if (sections.includes("briefing")) panels.push({ key: "briefing", label: "Briefing" });
    if (sections.includes("reportPacket") && reportPacket) panels.push({ key: "reportPacket", label: "Packet" });
    return panels;
  }, [hasVarianceOrLeaderboard, reportPacket, sections]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!mobilePanels.length) {
      setMobilePanel(null);
      return;
    }
    if (!mobilePanel || !mobilePanels.some((panel) => panel.key === mobilePanel)) {
      setMobilePanel(mobilePanels[0].key);
    }
  }, [mobilePanel, mobilePanels]);

  const activeFilter = useMemo<PdsV2AlertFilter | null>(
    () => commandCenter?.alert_filters.find((item) => item.key === activeFilterKey) || null,
    [activeFilterKey, commandCenter],
  );
  const selectedMarketPoint = useMemo(
    () => commandCenter?.map_summary.points.find((point) => point.market_id === selectedMarketId) || null,
    [commandCenter, selectedMarketId],
  );
  const selectedIntervention = useMemo(
    () => commandCenter?.intervention_queue.find((item) => item.intervention_id === selectedInterventionId) || null,
    [commandCenter, selectedInterventionId],
  );
  const filteredInterventions = useMemo(() => {
    if (!commandCenter) return [];
    let items = [...commandCenter.intervention_queue];
    if (activeFilter) {
      items = items.filter((item) => activeFilter.entity_ids.includes(item.entity_id));
    }
    if (selectedMarketId) {
      const marketFirst = items.filter((item) => item.entity_type === "market" && item.entity_id === selectedMarketId);
      const rest = items.filter((item) => !(item.entity_type === "market" && item.entity_id === selectedMarketId));
      items = [...marketFirst, ...rest];
    }
    return items;
  }, [activeFilter, commandCenter, selectedMarketId]);
  const focusLabel =
    selectedIntervention?.entity_label ||
    selectedMarketPoint?.name ||
    commandCenter?.operating_brief.focus_label ||
    "Portfolio";
  const insightPanel = useMemo(() => {
    if (!commandCenter) return null;
    if (selectedIntervention) {
      return {
        ...commandCenter.insight_panel,
        focus_label: selectedIntervention.entity_label,
        status: selectedIntervention.severity,
        what: selectedIntervention.issue_summary,
        why: selectedIntervention.cause_summary,
        consequence: selectedIntervention.expected_impact || commandCenter.insight_panel.consequence,
        action: selectedIntervention.recommended_action,
        owner: selectedIntervention.owner_label || commandCenter.insight_panel.owner,
        reason_codes: selectedIntervention.reason_codes,
      };
    }
    if (activeFilter) {
      return {
        ...commandCenter.insight_panel,
        focus_label: activeFilter.label,
        status: activeFilter.severity,
        what: activeFilter.label,
        why: activeFilter.description || commandCenter.insight_panel.why,
        consequence: `This focus currently affects ${activeFilter.count} entities on the homepage.`,
        action: commandCenter.operating_brief.recommended_actions[0] || commandCenter.insight_panel.action,
        reason_codes: activeFilter.reason_codes,
      };
    }
    if (selectedMarketPoint) {
      return {
        ...commandCenter.insight_panel,
        focus_label: selectedMarketPoint.name,
        what: `${selectedMarketPoint.name} is ${selectedMarketPoint.variance_pct} vs plan with ${selectedMarketPoint.red_projects} red projects.`,
        why: `${selectedMarketPoint.staffing_pressure_count} staffing risks and ${selectedMarketPoint.closeout_risk_count} closeout blockers are concentrated here.`,
        consequence: `${selectedMarketPoint.client_risk_accounts} client risk accounts and ${selectedMarketPoint.delinquent_timecards} delinquent timecards are reducing recovery speed.`,
      };
    }
    return commandCenter.insight_panel;
  }, [activeFilter, commandCenter, selectedIntervention, selectedMarketPoint]);

  async function triggerReportDownload(runId: string, format: "pdf" | "xlsx", runTitle: string) {
    const blob = await downloadPdsReportExport({
      env_id: envId,
      business_id: businessId || undefined,
      report_run_id: runId,
      format,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${runTitle.replace(/\s+/g, "_")}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleCreateExport(format: "pdf" | "xlsx") {
    if (!reportPacketType) return;
    setReportExportInFlight(format);
    setReportExportError(null);
    try {
      const run = await createPdsReportExportRun({
        env_id: envId,
        business_id: businessId || undefined,
        packet_type: reportPacketType,
        lens,
        horizon,
        role_preset: rolePreset,
        formats: [format],
      });
      setReportRuns((current) => [run, ...current.filter((item) => item.report_run_id !== run.report_run_id)].slice(0, 6));
      await triggerReportDownload(run.report_run_id, format, run.title);
    } catch (exportError) {
      setReportExportError(exportError instanceof Error ? exportError.message : "Failed to export report packet");
    } finally {
      setReportExportInFlight(null);
    }
  }

  async function handleDownloadRun(runId: string, format: "pdf" | "xlsx", runTitle: string) {
    setReportExportError(null);
    try {
      await triggerReportDownload(runId, format, runTitle);
    } catch (downloadError) {
      setReportExportError(downloadError instanceof Error ? downloadError.message : "Failed to download report export");
    }
  }

  if (loading && !commandCenter) {
    return <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">Loading PDS enterprise command center...</div>;
  }

  if (error && !commandCenter) {
    return (
      <div className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-4 text-sm text-pds-signalRed">
        {error}
      </div>
    );
  }

  if (!commandCenter) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-accent)/0.08),transparent_40%)] bg-bm-surface/[0.92] px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-baseline gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-bm-text">{title}</h2>
                <span className="rounded-full border border-pds-accent/20 px-2 py-0.5 text-[10px] font-medium text-pds-accentText">
                  PDS Enterprise OS
                </span>
              </div>
              {description ? <p className="text-xs text-bm-muted2 mt-0.5">{description}</p> : null}
            </div>
          </div>
          {moduleNotes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {moduleNotes.map((note) => (
                <div key={`${note.label}-${note.title}`} className="rounded-lg border border-bm-border/50 bg-bm-surface/15 px-3 py-1.5 text-xs text-bm-muted2">
                  <span className="font-medium text-bm-text">{note.title}</span> — {note.body}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <PdsOperatingBrief brief={commandCenter.operating_brief} />

      {sections.includes("operatingPosture") ? <OperatingPosturePanel commandCenter={commandCenter} /> : null}

      <PdsLensToolbar
        lens={lens}
        horizon={horizon}
        rolePreset={rolePreset}
        generatedAt={commandCenter.generated_at}
        onLensChange={setLens}
        onHorizonChange={setHorizon}
        onRolePresetChange={setRolePreset}
      />

      <section className="rounded-2xl border border-bm-border/60 bg-bm-surface/15 px-4 py-3" data-testid="pds-active-state">
        <p className="text-xs text-bm-muted2">
          Viewing: <span className="font-semibold text-bm-text">{lens.replace(/_/g, " ")}</span>
          {" · "}Period: <span className="font-semibold text-bm-text">{horizon}</span>
          {" · "}Lens: <span className="font-semibold text-bm-text">{rolePreset.replace(/_/g, " ")}</span>
          {" · "}Focus: <span className="font-semibold text-bm-text">{focusLabel}</span>
          {" · "}Source: <span className="font-semibold text-bm-text">{focusSource}</span>
        </p>
      </section>

      {sections.includes("signals") ? (
        <PdsSignalsStrip
          filters={commandCenter.alert_filters ?? []}
          activeFilterKey={activeFilterKey}
        onFilterSelect={(filter) => {
          setActiveFilterKey((current) => (current === filter.key ? null : filter.key));
            setSelectedInterventionId(null);
            setSelectedEntityId(null);
            setFocusSource("chip");
          }}
        />
      ) : null}

      {sections.includes("performance") || sections.includes("leaderboard") || sections.includes("varianceChart") || sections.includes("resourceHealth") || sections.includes("deliveryRisk") || sections.includes("satisfactionCloseout") || sections.includes("forecast") ? (
        <PdsMetricStrip
          metrics={commandCenter.metrics_strip ?? []}
          activeFilterKey={activeFilterKey}
          onMetricSelect={(metric: PdsV2MetricCard) => {
            if (!metric.filter_key) return;
            const nextFilterKey = metric.filter_key ?? null;
            setActiveFilterKey((current) => (current === nextFilterKey ? null : nextFilterKey));
            setSelectedInterventionId(null);
            setSelectedEntityId(null);
            setFocusSource("kpi");
          }}
        />
      ) : null}

      {(sections.includes("performance") || sections.includes("leaderboard") || sections.includes("varianceChart")) ? (
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)_minmax(320px,1fr)]">
        <div className="rounded-[24px] border border-bm-border/70 bg-bm-surface/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <PdsSectionHeader label="Geography" title="Where performance is slipping" />
            <div className="flex flex-wrap gap-1.5">
              {(["revenue_variance", "staffing_pressure", "backlog", "closeout_risk"] as MapColorMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setMapColorMode(mode)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${
                    mapColorMode === mode
                      ? "border-pds-accent/35 bg-pds-accent/10 text-pds-accentText"
                      : "border-bm-border/60 bg-bm-surface/10 text-bm-muted2"
                  }`}
                >
                  {mode.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[420px]">
            <PdsMarketMap
              points={commandCenter.map_summary.points}
              selectedMarketId={selectedMarketId}
              colorMode={mapColorMode}
              onMarketClick={(marketId) => {
                setSelectedMarketId(marketId);
                setSelectedInterventionId(null);
                setSelectedEntityId(marketId);
                setFocusSource("map");
              }}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-bm-border/70 bg-bm-surface/20 p-4">
          <PdsRankedMarketList
            rows={commandCenter.performance_table.rows ?? []}
            selectedMarketId={selectedMarketId}
            activeFilterKey={activeFilterKey}
            onMarketClick={(marketId) => {
              setSelectedMarketId(marketId);
              setSelectedInterventionId(null);
              setSelectedEntityId(marketId);
              setFocusSource("list");
            }}
          />
        </div>

        {insightPanel ? <PdsInsightPanel panel={insightPanel} /> : null}
      </section>
      ) : null}

      {sections.includes("interventionQueue") ? (
        <PdsInterventionQueue
          items={filteredInterventions}
          activeFilterKey={activeFilterKey}
          onInterventionSelect={(item: PdsV2InterventionQueueItem) => {
            setSelectedInterventionId(item.intervention_id);
            setSelectedEntityId(item.entity_id);
            setFocusSource("queue");
          }}
        />
      ) : null}

      {isMobileViewport && mobilePanels.length > 1 ? (
        <section className="flex gap-2 overflow-x-auto pb-1" data-testid="pds-mobile-panel-tabs">
          {mobilePanels.map((panel) => (
            <button
              key={panel.key}
              type="button"
              onClick={() => setMobilePanel(panel.key)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                mobilePanel === panel.key
                  ? "border-pds-accent/35 bg-pds-accent/10 text-pds-accentText"
                  : "border-bm-border/60 bg-bm-surface/18 text-bm-muted2"
              }`}
            >
              {panel.label}
            </button>
          ))}
        </section>
      ) : null}

      {/* 3. Performance Visual — chart/table toggle */}
      {(!isMobileViewport || mobilePanel === "performance") && hasVarianceOrLeaderboard ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <PdsSectionHeader label="Market Analysis" title="Operating Performance by Market" />
            <div className="flex gap-1.5">
              <button
                onClick={() => setPerformanceView("chart")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  performanceView === "chart"
                    ? "bg-pds-accent/15 text-pds-accentText border-pds-accent/30"
                    : "border-transparent text-bm-muted2 hover:text-bm-text"
                }`}
              >
                Chart
              </button>
              <button
                onClick={() => setPerformanceView("table")}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  performanceView === "table"
                    ? "bg-pds-accent/15 text-pds-accentText border-pds-accent/30"
                    : "border-transparent text-bm-muted2 hover:text-bm-text"
                }`}
              >
                Table
              </button>
            </div>
          </div>
          {performanceView === "chart" ? (
            <PdsVarianceChart rows={commandCenter.performance_table?.rows ?? []} />
          ) : (
            <PdsMarketLeaderboard rows={commandCenter.performance_table?.rows ?? []} />
          )}
        </>
      ) : null}

      {/* Legacy performance table (for non-market pages without chart/leaderboard) */}
      {(!isMobileViewport || mobilePanel === "performance") && sections.includes("performance") && !hasVarianceOrLeaderboard && commandCenter.performance_table ? (
        <>
          <PdsSectionHeader label="Portfolio Performance" title="Market Operating View" />
          <PdsPerformanceTable table={commandCenter.performance_table} />
        </>
      ) : null}

      {/* 4. Root Cause — staffing & submission issues (promoted position) */}
      {(!isMobileViewport || mobilePanel === "resourceHealth") && sections.includes("resourceHealth") ? (
        <PdsResourceHealthPanel resources={commandCenter.resource_health ?? []} timecards={commandCenter.timecard_health ?? []} />
      ) : null}

      {/* Delivery Risk — projects requiring intervention */}
      {(!isMobileViewport || mobilePanel === "deliveryRisk") && sections.includes("deliveryRisk") ? (
        <>
          <PdsSectionHeader label="Delivery Risk" title="Projects Requiring Intervention" />
          <PdsDeliveryRiskPanel items={commandCenter.delivery_risk ?? []} />
        </>
      ) : null}

      {/* Client Health */}
      {(!isMobileViewport || mobilePanel === "satisfactionCloseout") && sections.includes("satisfactionCloseout") ? (
        <>
          <PdsSectionHeader label="Client Health" title="Satisfaction & Closeout Status" />
          <PdsSatisfactionCloseoutPanel satisfaction={commandCenter.satisfaction ?? []} closeout={commandCenter.closeout ?? []} />
        </>
      ) : null}

      {/* Forecast */}
      {(!isMobileViewport || mobilePanel === "forecast") && sections.includes("forecast") ? (
        <>
          <PdsSectionHeader label="Forecast" title="Forecast Trend" />
          <PdsForecastPanel points={commandCenter.forecast_points ?? []} />
        </>
      ) : null}

      {/* Exec Briefing */}
      {(!isMobileViewport || mobilePanel === "briefing") && sections.includes("briefing") && commandCenter.briefing ? (
        <>
          <PdsSectionHeader label="Exec Briefing" title="Management Intelligence" />
          <PdsExecutiveBriefingPanel briefing={commandCenter.briefing} />
        </>
      ) : null}

      {(!isMobileViewport || mobilePanel === "reportPacket") && sections.includes("reportPacket") && reportPacket ? (
        <ReportPacketPanel
          packet={reportPacket}
          exportError={reportExportError}
          exportInFlight={reportExportInFlight}
          runs={reportRuns}
          onExport={handleCreateExport}
          onDownloadRun={handleDownloadRun}
        />
      ) : null}

      {error ? (
        <div className="rounded-xl border border-pds-signalOrange/30 bg-pds-signalOrange/10 px-3 py-2 text-sm text-pds-signalOrange">
          {error}
        </div>
      ) : null}
    </div>
  );
}
