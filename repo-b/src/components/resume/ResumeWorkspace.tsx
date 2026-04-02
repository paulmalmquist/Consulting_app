"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { TimelineEngine } from "./timeline";
import ResumeArchitectureModule from "./ResumeArchitectureModule";
import ResumeModelingModule from "./ResumeModelingModule";
import ResumeBiModule from "./ResumeBiModule";
import ResumeContextRail from "./ResumeContextRail";
import ResumeAssistantDock from "./ResumeAssistantDock";
import ResumeExportPdf from "./ResumeExportPdf";
import ResumeModuleBoundary from "./ResumeModuleBoundary";
import SkillsCapabilityMap from "./SkillsCapabilityMap";
import SystemsBuiltSection from "./SystemsBuiltSection";
import { useResumeWorkspaceStore } from "./useResumeWorkspaceStore";
import type { ResumeWorkspaceViewModel } from "@/lib/resume/workspace";

const MODULE_LABELS = {
  timeline: "Timeline",
  architecture: "Architecture",
  modeling: "Modeling",
  bi: "BI Dashboard",
} as const;

const MODULE_LABELS_SHORT = {
  timeline: "Timeline",
  architecture: "Arch",
  modeling: "Modeling",
  bi: "BI",
} as const;

export default function ResumeWorkspace({
  envId,
  businessId,
  workspace,
  readOnly = false,
}: {
  envId: string;
  businessId: string | null;
  workspace: ResumeWorkspaceViewModel;
  readOnly?: boolean;
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
  const moduleContentRef = useRef<HTMLDivElement>(null);
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

  const HERO_METRICS = [
    { label: "Years Experience", value: "11+" },
    { label: "Assets Automated", value: "500+" },
    { label: "Hrs/Mo Saved", value: "160+" },
    { label: "Faster Reporting", value: "50%" },
    { label: "Reconciliation Reduction", value: "75%" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <section className="space-y-3 md:space-y-4">
        {/* Identity — name + title + tagline */}
        <div>
          <p className="bm-section-label tracking-[0.1em] md:tracking-[0.16em]">{workspace.identity.name}</p>
          <h1 className="mt-1.5 text-[1.5rem] leading-tight md:mt-2 md:text-4xl lg:text-5xl">
            <span className="md:inline">AI Data Platform Architect</span>{" "}
            <span className="hidden text-bm-muted md:inline">—</span>{" "}
            <br className="md:hidden" />
            <span className="text-bm-accent">Investment Systems</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-bm-muted md:mt-2 md:text-base">
            Built governed data + AI systems powering investment decisions across $4B+ AUM
          </p>
        </div>

        {/* KPI proof strip — all 5 always visible */}
        <div className="grid grid-cols-3 gap-2 md:hidden">
          {HERO_METRICS.map((m) => (
            <div key={m.label} className="flex min-h-[52px] flex-col justify-center rounded-xl border border-bm-border/30 bg-bm-surface/20 px-2.5 py-2">
              <span className="text-lg font-bold tabular-nums leading-tight">{m.value}</span>
              <span className="mt-0.5 text-[9px] uppercase tracking-[0.06em] text-bm-muted">{m.label}</span>
            </div>
          ))}
        </div>
        <div className="hidden flex-wrap gap-x-8 gap-y-3 md:flex">
          {HERO_METRICS.map((m) => (
            <div key={m.label}>
              <span className="text-3xl font-bold tabular-nums">{m.value}</span>
              <span className="ml-1.5 text-xs uppercase tracking-widest text-bm-muted">{m.label}</span>
            </div>
          ))}
        </div>

        {/* Module tabs + export */}
        <div className="flex items-center gap-2 pt-1">
          <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:gap-2 md:overflow-visible md:pb-0">
            {(Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).map((module) => (
              <button
                key={module}
                type="button"
                onClick={() => setActiveModule(module)}
                className={`shrink-0 snap-start rounded-full px-3 py-1.5 text-xs font-medium transition md:px-4 md:py-2 md:text-sm ${
                  activeModule === module
                    ? "bg-bm-accent/15 text-bm-accent shadow-[0_0_0_1px_rgba(59,130,246,0.35)]"
                    : "bg-white/5 text-bm-muted hover:bg-white/10 hover:text-bm-text"
                }`}
              >
                <span className="md:hidden">{MODULE_LABELS_SHORT[module]}</span>
                <span className="hidden md:inline">{MODULE_LABELS[module]}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto hidden md:block">
            <ResumeExportPdf contentRef={moduleContentRef} />
          </div>
        </div>

        <SkillsCapabilityMap />
      </section>

      {/* Systems Built — dedicated proof section */}
      <SystemsBuiltSection />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div ref={moduleContentRef} className="space-y-6">
          {activeModule === "timeline" ? (
            <ResumeModuleBoundary
              boundaryId="resume-timeline"
              eyebrow="Timeline"
              title="Timeline temporarily unavailable"
              message="The career arc could not render, but the rest of the visual resume is still available."
              resetKey={`${envId}-${activeModule}-${workspace.timeline.roles.length}-${workspace.timeline.milestones.length}`}
            >
              <TimelineEngine />
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
            {!readOnly ? (
              <ResumeModuleBoundary
                boundaryId="resume-assistant"
                eyebrow="Assistant"
                title="Resume data unavailable"
                message="The contextual assistant failed to render. You can still use the visual resume modules directly."
                resetKey={`${envId}-${activeModule}`}
              >
                <ResumeAssistantDock envId={envId} businessId={businessId} metrics={assistantMetrics} />
              </ResumeModuleBoundary>
            ) : null}
          </div>
        ) : null}
      </div>

      {isMobileViewport ? (
        <div className="space-y-3">
        <details
          className="rounded-[20px] border border-bm-border/60 bg-bm-surface/18 p-3"
          open
        >
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em] text-bm-muted2">Context &amp; Evidence</summary>
          <div className="mt-3">
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

        {!readOnly ? (
          <details className="rounded-[20px] border border-bm-border/60 bg-bm-surface/18 p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.1em] text-bm-muted2">Ask Winston</summary>
            <div className="mt-3">
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
        ) : null}
        </div>
      ) : null}
    </div>
  );
}
