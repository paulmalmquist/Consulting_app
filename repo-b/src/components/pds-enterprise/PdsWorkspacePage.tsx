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

export type PdsWorkspaceSection =
  | "performance"
  | "leaderboard"
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pds-gold/70">{label}</p>
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

  if (loading && !commandCenter) {
    return <div className="rounded-2xl border border-bm-border/70 bg-bm-surface/20 p-4 text-sm text-bm-muted2">Loading PDS enterprise command center...</div>;
  }

  if (error && !commandCenter) {
    return (
      <div className="rounded-2xl border border-pds-signalRed/30 bg-pds-signalRed/10 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!commandCenter) return null;

  return (
    <div className="space-y-3">
      {/* Compressed header row */}
      <section className="rounded-xl border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--pds-gold)/0.10),transparent_40%),linear-gradient(145deg,#111820,#0b1015)] px-4 py-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-baseline gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-bm-text">{title}</h2>
                <span className="rounded-full border border-pds-gold/20 px-2 py-0.5 text-[10px] font-medium text-pds-goldText">
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

      {/* Signals strip */}
      {sections.includes("signals") ? (
        <PdsSignalsStrip commandCenter={commandCenter} />
      ) : null}

      {sections.includes("interventionQueue") ? (
        <PdsInterventionQueue commandCenter={commandCenter} />
      ) : null}

      {/* Financial summary cards */}
      {sections.includes("performance") ? (
        <>
          <PdsSectionHeader label="Financial Signals" title="Revenue, CI, Backlog & Forecast" />
          <PdsMetricStrip metrics={commandCenter.metrics_strip} />
        </>
      ) : (
        <PdsMetricStrip metrics={commandCenter.metrics_strip} />
      )}

      {/* Market leaderboard */}
      {sections.includes("leaderboard") ? (
        <>
          <PdsSectionHeader label="Market Leaderboard" title="Ranked Operating View" />
          <PdsMarketLeaderboard rows={commandCenter.performance_table.rows} />
        </>
      ) : null}

      {/* Legacy performance table (for non-market pages) */}
      {sections.includes("performance") && !sections.includes("leaderboard") ? (
        <>
          <PdsSectionHeader label="Portfolio Performance" title="Market Operating View" />
          <PdsPerformanceTable table={commandCenter.performance_table} />
        </>
      ) : null}

      {sections.includes("deliveryRisk") ? (
        <>
          <PdsSectionHeader label="Delivery Risk" title="Projects Requiring Intervention" />
          <PdsDeliveryRiskPanel items={commandCenter.delivery_risk} />
        </>
      ) : null}

      {sections.includes("resourceHealth") ? (
        <>
          <PdsSectionHeader label="Resource Signals" title="Staffing Pressure & Submission Discipline" />
          <PdsResourceHealthPanel resources={commandCenter.resource_health} timecards={commandCenter.timecard_health} />
        </>
      ) : null}

      {sections.includes("satisfactionCloseout") ? (
        <>
          <PdsSectionHeader label="Client Health" title="Satisfaction & Closeout Status" />
          <PdsSatisfactionCloseoutPanel satisfaction={commandCenter.satisfaction} closeout={commandCenter.closeout} />
        </>
      ) : null}

      {sections.includes("forecast") ? (
        <>
          <PdsSectionHeader label="Forecast" title="Forecast Trend" />
          <PdsForecastPanel points={commandCenter.forecast_points} />
        </>
      ) : null}

      {sections.includes("briefing") ? (
        <>
          <PdsSectionHeader label="AI Executive Briefing" title="Management Intelligence" />
          <PdsExecutiveBriefingPanel briefing={commandCenter.briefing} />
        </>
      ) : null}

      {sections.includes("reportPacket") && reportPacket ? <ReportPacketPanel packet={reportPacket} /> : null}

      {error ? (
        <div className="rounded-xl border border-pds-signalOrange/30 bg-pds-signalOrange/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
