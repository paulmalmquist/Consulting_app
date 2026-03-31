"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import LinkedContextBar from "./LinkedContextBar";
import CareerTimelineBar from "./CareerTimelineBar";
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
    selectNarrativeItem,
    clearNarrativeSelection,
    selectedNarrativeKind,
    selectedNarrativeId,
    timelineView,
    setTimelineView,
  } = useResumeWorkspaceStore(
    useShallow((state) => ({
      activeModule: state.activeModule,
      setActiveModule: state.setActiveModule,
      initialize: state.initialize,
      modelInputs: state.modelInputs,
      selectedBiEntityId: state.selectedBiEntityId,
      biFilters: state.biFilters,
      selectNarrativeItem: state.selectNarrativeItem,
      clearNarrativeSelection: state.clearNarrativeSelection,
      selectedNarrativeKind: state.selectedNarrativeKind,
      selectedNarrativeId: state.selectedNarrativeId,
      timelineView: state.timelineView,
      setTimelineView: state.setTimelineView,
    })),
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [urlStateHydrated, setUrlStateHydrated] = useState(false);

  useEffect(() => {
    initialize(workspace);
  }, [workspace, initialize]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 1279px)");
    const updateViewport = () => setIsMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const view = params.get("view");
    const milestone = params.get("milestone");
    const phase = params.get("phase");
    const layer = params.get("layer");
    const metric = params.get("metric");
    const requestedView =
      view && workspace.timeline.views.includes(view as typeof workspace.timeline.views[number])
        ? (view as typeof workspace.timeline.default_view)
        : null;

    if (requestedView) {
      setTimelineView(requestedView);
    }

    if (milestone) {
      selectNarrativeItem("milestone", milestone, {
        switchModule: "timeline",
        timelineView: requestedView,
      });
      setUrlStateHydrated(true);
      return;
    }
    if (phase) {
      selectNarrativeItem("phase", phase, {
        switchModule: "timeline",
        timelineView: requestedView,
      });
      setUrlStateHydrated(true);
      return;
    }
    if (layer) {
      selectNarrativeItem("layer", layer, {
        switchModule: "timeline",
        timelineView: requestedView ?? "capability",
      });
      setUrlStateHydrated(true);
      return;
    }
    if (metric) {
      const anchor = workspace.timeline.metric_anchors.find((item) => item.hero_metric_key === metric);
      selectNarrativeItem("metric", metric, {
        switchModule: "timeline",
        timelineView: requestedView ?? anchor?.default_view ?? null,
      });
      setUrlStateHydrated(true);
      return;
    }
    setUrlStateHydrated(true);
  }, [searchParams, selectNarrativeItem, setTimelineView, workspace.timeline.default_view, workspace.timeline.metric_anchors, workspace.timeline.views]);

  useEffect(() => {
    if (!urlStateHydrated) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", timelineView);
    params.delete("phase");
    params.delete("milestone");
    params.delete("layer");
    params.delete("metric");

    if (selectedNarrativeKind === "phase" && selectedNarrativeId) params.set("phase", selectedNarrativeId);
    if (selectedNarrativeKind === "milestone" && selectedNarrativeId) params.set("milestone", selectedNarrativeId);
    if (selectedNarrativeKind === "layer" && selectedNarrativeId) params.set("layer", selectedNarrativeId);
    if (selectedNarrativeKind === "metric" && selectedNarrativeId) params.set("metric", selectedNarrativeId);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams, selectedNarrativeId, selectedNarrativeKind, timelineView, urlStateHydrated]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearNarrativeSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearNarrativeSelection]);

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
      <section className="space-y-1">
        {/* Identity */}
        <div>
          <p className="bm-section-label">{workspace.identity.name}</p>
          <h1 className="mt-2 text-4xl leading-tight sm:text-5xl">{workspace.identity.title}</h1>
          <p className="mt-3 text-lg text-bm-muted">{workspace.identity.tagline}</p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-bm-muted">{workspace.identity.summary}</p>
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

        {/* Career timeline bar */}
        <CareerTimelineBar timeline={workspace.timeline} />

        {/* Hero metrics */}
        {workspace.identity.metrics.length > 0 ? (
          <div className="grid gap-3 pt-2 sm:grid-cols-2 xl:grid-cols-4">
            {workspace.identity.metrics.map((metric) => (
              <button
                key={metric.label}
                type="button"
                onClick={() => {
                  if (!metric.metric_key) return;
                  selectNarrativeItem("metric", metric.metric_key, { switchModule: "timeline" });
                }}
                className="rounded-2xl border border-bm-border/40 bg-bm-surface/30 px-4 py-4 text-left transition hover:border-bm-border/70 hover:bg-bm-surface/50"
              >
                <p className="text-[10px] uppercase tracking-[0.16em] text-bm-muted2">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                {metric.detail ? <p className="mt-2 text-xs text-bm-muted">{metric.detail}</p> : null}
              </button>
            ))}
          </div>
        ) : null}

        {/* Module tabs */}
        <div className="flex flex-wrap gap-2 pt-2">
          {(Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).map((module) => (
            <button
              key={module}
              type="button"
              onClick={() => setActiveModule(module)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeModule === module
                  ? "bg-bm-accent/15 text-bm-accent shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                  : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
              }`}
            >
              {MODULE_LABELS[module]}
            </button>
          ))}
        </div>

        <LinkedContextBar />
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

        {!isMobileViewport ? (
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
        ) : null}
      </div>

      {isMobileViewport ? (
        <div className="space-y-3">
        <details
          className="rounded-[24px] border border-bm-border/60 bg-bm-surface/18 p-4"
          open
        >
          <summary className="cursor-pointer text-sm font-semibold text-bm-text">Context Rail</summary>
          <div className="mt-4">
            <ResumeModuleBoundary
              boundaryId="resume-context-rail-mobile"
              eyebrow="Context Rail"
              title="Resume data unavailable"
              message="The supporting narrative rail could not render, but the main resume modules remain available."
              resetKey={`${envId}-${activeModule}-${biSlice.entity.entity_id}-mobile`}
            >
              <ResumeContextRail
                timeline={workspace.timeline}
                architecture={workspace.architecture}
                stories={workspace.stories}
                modelingOutputs={modelOutputs}
                biEntity={biSlice.entity}
              />
            </ResumeModuleBoundary>
          </div>
        </details>

        <details className="rounded-[24px] border border-bm-border/60 bg-bm-surface/18 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-bm-text">Winston</summary>
          <div className="mt-4">
            <ResumeModuleBoundary
              boundaryId="resume-assistant-mobile"
              eyebrow="Assistant"
              title="Resume data unavailable"
              message="The contextual assistant failed to render. You can still use the visual resume modules directly."
              resetKey={`${envId}-${activeModule}-mobile`}
            >
              <ResumeAssistantDock envId={envId} businessId={businessId} metrics={assistantMetrics} />
            </ResumeModuleBoundary>
          </div>
        </details>
        </div>
      ) : null}
    </div>
  );
}
