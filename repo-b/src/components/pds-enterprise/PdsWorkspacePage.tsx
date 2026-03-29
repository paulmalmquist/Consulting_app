"use client";

import React, { useEffect, useState } from "react";
import {
  buildPdsReportPacket,
  getPdsCommandCenter,
  type PdsV2CommandCenter,
  type PdsV2Horizon,
  type PdsV2Lens,
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
import { publishAssistantPageContext, resetAssistantPageContext } from "@/lib/commandbar/appContextBridge";

export type PdsWorkspaceSection =
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

function ReportPacketPanel({ packet }: { packet: PdsV2ReportPacket }) {
  return (
    <section className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-report-packet-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">Report Packet</p>
          <h3 className="text-xl font-semibold">{packet.title}</h3>
        </div>
        <p className="text-sm text-bm-muted2">Generated from the same snapshot package as the command center.</p>
      </div>
      <p className="mt-4 text-sm text-bm-muted2">{packet.narrative || "Narrative pending."}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {packet.sections.map((section, index) => (
          <article key={`${section.key || section.title || index}`} className="rounded-xl border border-bm-border/60 bg-[#101922] p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-bm-muted2">{String(section.key || "section")}</p>
            <h4 className="mt-1 font-semibold">{String(section.title || "Section")}</h4>
          </article>
        ))}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceView, setPerformanceView] = useState<"chart" | "table">("chart");
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PdsMobilePanel | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [commandCenterPayload, reportPayload] = await Promise.all([
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
        ]);
        if (cancelled) return;
        setCommandCenter(commandCenterPayload);
        setReportPacket(reportPayload);
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
      selected_entities: [],
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
  }, [commandCenter, description, envId, horizon, lens, title]);

  const hasVarianceOrLeaderboard = sections.includes("varianceChart") || sections.includes("leaderboard");
  const mobilePanels = React.useMemo<Array<{ key: PdsMobilePanel; label: string }>>(() => {
    const panels: Array<{ key: PdsMobilePanel; label: string }> = [];
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
      {/* Compressed header row */}
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

      {/* Operating lens + controls */}
      <PdsLensToolbar
        lens={lens}
        horizon={horizon}
        rolePreset={rolePreset}
        generatedAt={commandCenter.generated_at}
        onLensChange={setLens}
        onHorizonChange={setHorizon}
        onRolePresetChange={setRolePreset}
      />

      {/* 1. Critical Issues — first read (what needs attention right now) */}
      {sections.includes("interventionQueue") ? (
        <PdsInterventionQueue commandCenter={commandCenter} />
      ) : null}

      {/* 2. KPI cards — second read (how are we performing) */}
      {sections.includes("performance") ? (
        <PdsMetricStrip metrics={commandCenter.metrics_strip ?? []} />
      ) : (
        <PdsMetricStrip metrics={commandCenter.metrics_strip ?? []} />
      )}

      {/* Signals strip — compact operational context */}
      {sections.includes("signals") ? (
        <PdsSignalsStrip commandCenter={commandCenter} />
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

      {(!isMobileViewport || mobilePanel === "reportPacket") && sections.includes("reportPacket") && reportPacket ? <ReportPacketPanel packet={reportPacket} /> : null}

      {error ? (
        <div className="rounded-xl border border-pds-signalOrange/30 bg-pds-signalOrange/10 px-3 py-2 text-sm text-pds-signalOrange">
          {error}
        </div>
      ) : null}
    </div>
  );
}
