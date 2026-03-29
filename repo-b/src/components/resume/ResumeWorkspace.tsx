"use client";

import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { fmtMoney, fmtPct, fmtMultiple } from "@/lib/format-utils";
import {
  publishAssistantEnvironmentContext,
  publishAssistantPageContext,
  resetAssistantPageContext,
} from "@/lib/commandbar/appContextBridge";
import { computeResumeScenario } from "./modelingMath";
import { deriveResumeBiSlice } from "./biMath";
import ResumeTimelineModule from "./ResumeTimelineModule";
import ResumeArchitectureModule from "./ResumeArchitectureModule";
import ResumeModelingModule from "./ResumeModelingModule";
import ResumeBiModule from "./ResumeBiModule";
import ResumeContextRail from "./ResumeContextRail";
import ResumeAssistantDock from "./ResumeAssistantDock";
import ResumeModuleBoundary from "./ResumeModuleBoundary";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import type { ResumeWorkspaceViewModel } from "@/lib/resume/workspace";

const MODULE_LABELS = {
  timeline: "Timeline",
  architecture: "Architecture",
  modeling: "Modeling",
  bi: "BI Dashboard",
} as const;

export default function ResumeWorkspace({
  envId,
  businessId,
  workspace,
}: {
  envId: string;
  businessId: string | null;
  workspace: ResumeWorkspaceViewModel;
}) {
  const {
    activeModule,
    setActiveModule,
    initialize,
    modelInputs,
    selectedBiEntityId,
    biFilters,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      activeModule: state.activeModule,
      setActiveModule: state.setActiveModule,
      initialize: state.initialize,
      modelInputs: state.modelInputs,
      selectedBiEntityId: state.selectedBiEntityId,
      biFilters: state.biFilters,
    })),
  );

  useEffect(() => {
    initialize(workspace);
  }, [workspace, initialize]);

  const modelOutputs = useMemo(
    () => computeResumeScenario(modelInputs, workspace.modeling.assumptions),
    [modelInputs, workspace.modeling.assumptions],
  );

  const biSlice = useMemo(
    () =>
      deriveResumeBiSlice(workspace.bi, selectedBiEntityId || workspace.bi.root_entity_id, {
        market: biFilters.market,
        propertyType: biFilters.propertyType,
        period: biFilters.period,
      }),
    [workspace.bi, selectedBiEntityId, biFilters.market, biFilters.propertyType, biFilters.period],
  );

  const assistantMetrics = useMemo(() => {
    const metrics: Record<string, string | number> = {};
    if (activeModule === "modeling") {
      metrics.irr = fmtPct(modelOutputs.irr);
      metrics.tvpi = fmtMultiple(modelOutputs.tvpi);
      metrics.lp_distribution = fmtMoney(modelOutputs.lpDistribution);
      metrics.gp_distribution = fmtMoney(modelOutputs.gpDistribution);
      return metrics;
    }
    if (activeModule === "bi") {
      metrics.portfolio_value = fmtMoney(biSlice.kpis.portfolio_value);
      metrics.noi = fmtMoney(biSlice.kpis.noi);
      metrics.occupancy = fmtPct(biSlice.kpis.occupancy);
      metrics.irr = fmtPct(biSlice.kpis.irr);
      return metrics;
    }
    return metrics;
  }, [activeModule, modelOutputs, biSlice]);

  useEffect(() => {
    publishAssistantEnvironmentContext({
      active_environment_id: envId,
      active_business_id: businessId ?? undefined,
    });
    publishAssistantPageContext({
      route: `/lab/env/${envId}/resume`,
      surface: "resume_workspace",
      active_module: "resume",
      page_entity_type: "environment",
      page_entity_id: envId,
      page_entity_name: workspace.identity.name,
      selected_entities: [
        {
          entity_type: "resume_workspace",
          entity_id: envId,
          name: workspace.identity.name,
          source: "page",
          metadata: {
            active_panel: activeModule,
          },
        },
      ],
      visible_data: {
        metrics: assistantMetrics,
        notes: [`Active resume panel: ${MODULE_LABELS[activeModule]}`],
      },
    });
    return () => resetAssistantPageContext();
  }, [activeModule, assistantMetrics, businessId, envId, workspace.identity.name]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-bm-border/60 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.22),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_32px_80px_-50px_rgba(10,18,24,0.95)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.16),transparent_26%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="bm-section-label">{workspace.identity.name}</p>
            <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">{workspace.identity.title}</h1>
            <p className="mt-4 text-lg text-bm-muted">{workspace.identity.tagline}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-bm-muted">{workspace.identity.summary}</p>
            {workspace.identity.badges.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {workspace.identity.badges.map((badge) => (
                  <span key={badge} className="rounded-full border border-bm-border/35 bg-white/5 px-3 py-1.5 text-xs text-bm-muted2">
                    {badge}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {workspace.identity.metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4 backdrop-blur-sm">
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                {metric.detail ? <p className="mt-2 text-xs text-bm-muted">{metric.detail}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2">
          {(Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).map((module) => (
            <button
              key={module}
              type="button"
              onClick={() => setActiveModule(module)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeModule === module
                  ? "bg-white/14 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
                  : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
              }`}
            >
              {MODULE_LABELS[module]}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          {activeModule === "timeline" ? (
            <ResumeModuleBoundary
              boundaryId="resume-timeline"
              eyebrow="Timeline"
              title="Timeline temporarily unavailable"
              message="The career arc could not render, but the rest of the visual resume is still available."
              resetKey={`${envId}-${activeModule}-${workspace.timeline.roles.length}-${workspace.timeline.milestones.length}`}
            >
              <ResumeTimelineModule timeline={workspace.timeline} />
            </ResumeModuleBoundary>
          ) : null}
          {activeModule === "architecture" ? (
            <ResumeModuleBoundary
              boundaryId="resume-architecture"
              eyebrow="Architecture"
              title="Visualization failed to render"
              message="The architecture map could not render in this session. The rest of the visual resume is still available."
              resetKey={`${envId}-${activeModule}-${workspace.architecture.nodes.length}-${workspace.architecture.edges.length}`}
            >
              <ResumeArchitectureModule architecture={workspace.architecture} />
            </ResumeModuleBoundary>
          ) : null}
          {activeModule === "modeling" ? (
            <ResumeModuleBoundary
              boundaryId="resume-modeling"
              eyebrow="Modeling"
              title="Visualization failed to render"
              message="The modeling view hit a rendering issue, but the rest of the visual resume is still available."
              resetKey={`${envId}-${activeModule}-${workspace.modeling.presets.length}-${modelOutputs.annualCashFlows.length}`}
            >
              <ResumeModelingModule modeling={workspace.modeling} outputs={modelOutputs} />
            </ResumeModuleBoundary>
          ) : null}
          {activeModule === "bi" ? (
            <ResumeModuleBoundary
              boundaryId="resume-bi"
              eyebrow="BI Module"
              title="Visualization failed to render"
              message="The analytics slice could not render cleanly, but the rest of the visual resume is still available."
              resetKey={`${envId}-${activeModule}-${workspace.bi.entities.length}-${workspace.bi.periods.length}`}
            >
              <ResumeBiModule bi={workspace.bi} />
            </ResumeModuleBoundary>
          ) : null}
        </div>

        <div className="space-y-6">
          <ResumeModuleBoundary
            boundaryId="resume-context-rail"
            eyebrow="Context Rail"
            title="Resume data unavailable"
            message="The supporting narrative rail could not render, but the main resume modules remain available."
            resetKey={`${envId}-${activeModule}-${biSlice.entity.entity_id}`}
          >
            <ResumeContextRail
              timeline={workspace.timeline}
              architecture={workspace.architecture}
              stories={workspace.stories}
              modelingOutputs={modelOutputs}
              biEntity={biSlice.entity}
            />
          </ResumeModuleBoundary>
          <ResumeModuleBoundary
            boundaryId="resume-assistant"
            eyebrow="Assistant"
            title="Resume data unavailable"
            message="The contextual assistant failed to render. You can still use the visual resume modules directly."
            resetKey={`${envId}-${activeModule}`}
          >
            <ResumeAssistantDock envId={envId} businessId={businessId} metrics={assistantMetrics} />
          </ResumeModuleBoundary>
        </div>
      </div>
    </div>
  );
}
