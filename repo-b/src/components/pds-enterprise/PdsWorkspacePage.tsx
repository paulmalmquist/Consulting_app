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

type PdsWorkspaceSection =
  | "performance"
  | "deliveryRisk"
  | "resourceHealth"
  | "forecast"
  | "satisfactionCloseout"
  | "briefing"
  | "reportPacket";

type ModuleNote = {
  label: string;
  title: string;
  body: string;
};

type Props = {
  title: string;
  description: string;
  defaultLens?: PdsV2Lens;
  defaultHorizon?: PdsV2Horizon;
  defaultRolePreset?: PdsV2RolePreset;
  sections: PdsWorkspaceSection[];
  moduleNotes?: ModuleNote[];
  reportPacketType?: string;
};

function ReportPacketPanel({ packet }: { packet: PdsV2ReportPacket }) {
  return (
    <section className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4" data-testid="pds-report-packet-panel">
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
          <article key={`${section.key || section.title || index}`} className="rounded-2xl border border-bm-border/60 bg-[#101922] p-4">
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
    return <div className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-6 text-sm text-bm-muted2">Loading PDS enterprise command center...</div>;
  }

  if (error && !commandCenter) {
    return (
      <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!commandCenter) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-bm-border/70 bg-[radial-gradient(circle_at_top_left,rgba(232,191,104,0.14),transparent_45%),linear-gradient(145deg,#111820,#0b1015)] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-[#c3a15f]">PDS Enterprise OS</p>
            <h2 className="text-3xl font-semibold text-bm-text">{title}</h2>
            <p className="text-sm text-bm-muted2">{description}</p>
          </div>
          <div className="rounded-2xl border border-[#e8bf68]/20 bg-black/10 px-4 py-3 text-sm text-[#eadbb2]">
            Market vs account is a first-class operating switch. Revenue, staffing, client health, and closeout move with the same lens.
          </div>
        </div>
      </section>

      {moduleNotes.length ? (
        <section className="grid gap-3 lg:grid-cols-3">
          {moduleNotes.map((note) => (
            <article key={`${note.label}-${note.title}`} className="rounded-3xl border border-bm-border/70 bg-bm-surface/20 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-bm-muted2">{note.label}</p>
              <h3 className="mt-1 text-lg font-semibold">{note.title}</h3>
              <p className="mt-2 text-sm text-bm-muted2">{note.body}</p>
            </article>
          ))}
        </section>
      ) : null}

      <PdsLensToolbar
        lens={lens}
        horizon={horizon}
        rolePreset={rolePreset}
        generatedAt={commandCenter.generated_at}
        onLensChange={setLens}
        onHorizonChange={setHorizon}
        onRolePresetChange={setRolePreset}
      />

      <PdsMetricStrip metrics={commandCenter.metrics_strip} />

      {sections.includes("performance") || sections.includes("briefing") ? (
        <div className={`grid gap-4 ${sections.includes("performance") && sections.includes("briefing") ? "xl:grid-cols-[1.35fr,0.95fr]" : ""}`}>
          {sections.includes("performance") ? <PdsPerformanceTable table={commandCenter.performance_table} /> : null}
          {sections.includes("briefing") ? <PdsExecutiveBriefingPanel briefing={commandCenter.briefing} /> : null}
        </div>
      ) : null}

      {sections.includes("deliveryRisk") || sections.includes("resourceHealth") ? (
        <div className={`grid gap-4 ${sections.includes("deliveryRisk") && sections.includes("resourceHealth") ? "xl:grid-cols-[1.2fr,1fr]" : ""}`}>
          {sections.includes("deliveryRisk") ? <PdsDeliveryRiskPanel items={commandCenter.delivery_risk} /> : null}
          {sections.includes("resourceHealth") ? (
            <PdsResourceHealthPanel resources={commandCenter.resource_health} timecards={commandCenter.timecard_health} />
          ) : null}
        </div>
      ) : null}

      {sections.includes("forecast") || sections.includes("satisfactionCloseout") ? (
        <div className={`grid gap-4 ${sections.includes("forecast") && sections.includes("satisfactionCloseout") ? "xl:grid-cols-[1.05fr,1fr]" : ""}`}>
          {sections.includes("forecast") ? <PdsForecastPanel points={commandCenter.forecast_points} /> : null}
          {sections.includes("satisfactionCloseout") ? (
            <PdsSatisfactionCloseoutPanel satisfaction={commandCenter.satisfaction} closeout={commandCenter.closeout} />
          ) : null}
        </div>
      ) : null}

      {sections.includes("reportPacket") && reportPacket ? <ReportPacketPanel packet={reportPacket} /> : null}

      {error ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}
