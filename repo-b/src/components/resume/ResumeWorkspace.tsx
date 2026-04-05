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

// ---------------------------------------------------------------------------
// KPI Data
// ---------------------------------------------------------------------------

const WORKSPACE_KPI_PROOF: Record<string, { what: string; source: string; before: string; after: string; system: string }> = {
  "Reporting Acceleration": {
    what: "Time from period close to published fund-level reports delivered to investor relations",
    source: "Measured against 2022 baseline before Tabular semantic layer deployment at Kayne Anderson",
    before: "20 business days — manual Excel pulls from MRI + DealCloud, ad-hoc SQL queries, manual reconciliation",
    after: "10 business days — automated via Databricks gold tables → Tabular → Power BI publish pipeline",
    system: "Semantic Layer (sys-semantic-layer) at Kayne Anderson Capital Advisors",
  },
  "Workflow Automation": {
    what: "Hours of recurring manual data entry, file retrieval, validation, and formatting work per month",
    source: "Measured from team time-tracking logs before/after Azure Logic Apps deployment (2019–2020)",
    before: "160+ hours/month across 3 analysts: file downloads from 500+ property portals, manual Excel formatting, copy-paste to MRI",
    after: "~30 min/month: automated ingestion via Logic Apps, PySpark transformation, SQL validation gates",
    system: "Ingestion Automation (sys-ingestion-automation) at Kayne Anderson",
  },
  "Pipeline Scale": {
    what: "Properties with automated, governed data ingestion — not manual data entry",
    source: "Scope of Azure Logic Apps + PySpark pipeline deployed 2019–2020 at Kayne Anderson",
    before: "Data collected manually by analysts from individual property portals and emailed spreadsheets",
    after: "500+ properties ingested automatically; SQL validation gates at every stage; near-zero manual entry errors",
    system: "Ingestion Automation (sys-ingestion-automation) at Kayne Anderson",
  },
  "AUM Supported": {
    what: "AUM for which investment decisions were backed by governed, validated data from the lakehouse",
    source: "Kayne Anderson real estate AUM at time of Data Warehouse deployment (2022)",
    before: "Fragmented source systems (DealCloud, MRI, Yardi, Excel); no single source of truth; DDQ responses took 10+ days",
    after: "Unified Databricks medallion lakehouse; DDQ turnaround cut 50%; all investor-facing data validated",
    system: "Data Warehouse (sys-warehouse) at Kayne Anderson",
  },
  "Career Span": {
    what: "Years building production data and analytics systems — from first BI deployment to current AI platform",
    source: "Aug 2014 (JLL BI service line) → present (JLL AI Data Platform Director)",
    before: "Ad-hoc BI requests, no repeatable delivery pipeline, no governed data layer",
    after: "8 systems in production across 2 firms: BI service line → data warehouse → semantic layer → AI platform",
    system: "See full timeline — from sys-bi-service-line (2014) to sys-ai-platform (2025)",
  },
};

const WORKSPACE_HERO_METRICS = [
  { label: "Reporting Acceleration", value: "10 days", sublabel: "faster quarterly reporting cycle" },
  { label: "Workflow Automation", value: "160 hrs", sublabel: "per month eliminated" },
  { label: "Pipeline Scale", value: "500+", sublabel: "properties through governed pipelines" },
  { label: "AUM Supported", value: "$4B+", sublabel: "by governed data systems" },
  { label: "Career Span", value: "11+", sublabel: "years building BI, data, and AI" },
];

function WorkspaceKpiProofBlock({ metric }: { metric: typeof WORKSPACE_HERO_METRICS[0] }) {
  const proof = WORKSPACE_KPI_PROOF[metric.label];
  if (!proof) return null;
  return (
    <div className="grid gap-3 text-left md:grid-cols-2 md:gap-6">
      <div className="space-y-2">
        <p className="resume-label text-[9px] tracking-[0.2em]" style={{ color: "var(--ros-text-dim)" }}>
          What this measures
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--ros-text-muted)" }}>
          {proof.what}
        </p>
        <p className="resume-label mt-2 text-[9px] tracking-[0.2em]" style={{ color: "var(--ros-text-dim)" }}>
          Source
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--ros-text-muted)" }}>
          {proof.source}
        </p>
      </div>
      <div className="space-y-2">
        <p className="resume-label text-[9px] tracking-[0.2em]" style={{ color: "var(--ros-text-dim)" }}>
          Before → After
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--ros-text-muted)" }}>
          <span style={{ color: "var(--ros-text-dim)" }}>Before: </span>
          {proof.before}
        </p>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--ros-text-muted)" }}>
          <span style={{ color: "var(--ros-accent-warm)" }}>After: </span>
          {proof.after}
        </p>
        <p className="resume-label mt-2 text-[9px] tracking-[0.2em]" style={{ color: "var(--ros-text-dim)" }}>
          System:{" "}
          <span style={{ color: "var(--ros-text)" }}>{proof.system}</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

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
  const [expandedKpi, setExpandedKpi] = useState<number | null>(null);

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
    <div className="resume-os relative -mx-4 -mt-4 overflow-hidden px-4 pt-6 md:-mx-6 md:-mt-6 md:px-8 md:pt-10 lg:px-12">
      {/* Atmospheric glows — right warm, left cool */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[5%] top-0 h-[360px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(200,74,42,0.18) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[10%] top-[20%] h-[480px] w-[560px] rounded-full"
        style={{ background: "radial-gradient(ellipse, rgba(15,10,5,0.6) 0%, transparent 70%)" }}
      />
      {/* Grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
        }}
      />

      <div className="relative z-10 space-y-8 pb-16 md:space-y-12">

        {/* ── HERO ──────────────────────────────────────────────────── */}
        <header className="text-center">
          <h1
            className="resume-editorial text-[clamp(3rem,8vw,6rem)] uppercase leading-[1.05]"
            style={{
              color: "var(--ros-text-bright)",
              fontWeight: 500,
              letterSpacing: "0.1em",
              textShadow: "0 0 80px rgba(200,100,40,0.3)",
            }}
          >
            {workspace.identity.name}
          </h1>
          <p
            className="resume-label mt-3 text-[clamp(12px,1.8vw,18px)] tracking-[0.2em]"
            style={{ color: "var(--ros-text-muted)" }}
          >
            AI Data Platform Architect
            <span className="mx-2 hidden sm:inline" style={{ color: "var(--ros-text-dim)" }}>—</span>
            <br className="sm:hidden" />
            <span style={{ color: "var(--ros-accent-gold)" }}>Investment Systems</span>
          </p>
          <p
            className="mx-auto mt-3 max-w-xl text-[12px] leading-relaxed tracking-[0.08em] md:text-[14px]"
            style={{ color: "var(--ros-text-muted)" }}
          >
            Built governed data + AI systems powering investment decisions across $4B+ AUM
          </p>
        </header>

        {/* ── KPI STRIP ────────────────────────────────────────────── */}
        <div
          className="border-y py-5 text-center"
          style={{ borderColor: "var(--ros-border)" }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:gap-x-10 md:gap-x-14">
            {WORKSPACE_HERO_METRICS.map((m, i) => (
              <div key={m.label} className="flex items-center">
                {i > 0 && (
                  <span
                    className="mr-6 hidden select-none sm:mr-10 sm:inline md:mr-14"
                    style={{ color: "var(--ros-text-dim)" }}
                  >
                    |
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedKpi(expandedKpi === i ? null : i)}
                  className="flex flex-col items-center gap-0.5 transition-opacity hover:opacity-90"
                >
                  <span
                    className="resume-editorial text-[clamp(2rem,4vw,3.2rem)] leading-none"
                    style={{ color: "var(--ros-text)" }}
                  >
                    {m.value}
                  </span>
                  <span
                    className="resume-label text-[10px] tracking-[0.28em]"
                    style={{ color: "var(--ros-text-dim)" }}
                  >
                    {m.label}
                  </span>
                  <span
                    className="text-[10px] leading-snug"
                    style={{ color: "var(--ros-text-dim)", opacity: 0.7 }}
                  >
                    {m.sublabel}
                  </span>
                </button>
              </div>
            ))}
          </div>
          {expandedKpi !== null && (
            <div
              className="mx-auto mt-4 max-w-3xl border-t pt-4"
              style={{ borderColor: "var(--ros-border)" }}
            >
              <WorkspaceKpiProofBlock metric={WORKSPACE_HERO_METRICS[expandedKpi]} />
            </div>
          )}
        </div>

        {/* ── TIMELINE ─────────────────────────────────────────────── */}
        <div ref={moduleContentRef}>
          <ResumeModuleBoundary
            boundaryId="resume-timeline-hero"
            eyebrow="Timeline"
            title="Timeline temporarily unavailable"
            message="The career arc could not render, but the rest of the visual resume is still available."
            resetKey={`${envId}-timeline-hero-${workspace.timeline.roles.length}-${workspace.timeline.milestones.length}`}
          >
            <TimelineEngine />
          </ResumeModuleBoundary>
        </div>

        {/* ── SYSTEMS IN PRODUCTION ────────────────────────────────── */}
        <SystemsBuiltSection />

        {/* ── EXPLORE DEEPER (Architecture / Modeling / BI) ────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className="resume-label hidden text-[9px] tracking-[0.3em] md:block"
              style={{ color: "var(--ros-text-dim)" }}
            >
              Explore deeper
            </span>
            <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 md:overflow-visible md:pb-0">
              {(["architecture", "modeling", "bi"] as const).map((module) => (
                <button
                  key={module}
                  type="button"
                  onClick={() => setActiveModule(activeModule === module ? "timeline" : module)}
                  className="shrink-0 snap-start rounded-full px-3 py-1.5 text-[11px] font-medium tracking-widest transition-all duration-200 md:px-4 md:py-2 md:text-xs"
                  style={
                    activeModule === module
                      ? {
                          background: "rgba(200,74,42,0.14)",
                          border: "1px solid rgba(200,74,42,0.4)",
                          color: "var(--ros-accent-warm)",
                        }
                      : {
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "var(--ros-text-dim)",
                        }
                  }
                >
                  {MODULE_LABELS[module]}
                </button>
              ))}
            </div>
            <div className="ml-auto hidden md:block">
              <ResumeExportPdf contentRef={moduleContentRef} />
            </div>
          </div>

          {activeModule !== "timeline" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6">
                {activeModule === "architecture" ? (
                  <ResumeModuleBoundary
                    boundaryId="resume-architecture"
                    eyebrow="Architecture"
                    title="Visualization failed to render"
                    message="The architecture map could not render in this session."
                    resetKey={`${envId}-${activeModule}-${workspace.architecture.nodes.length}`}
                  >
                    <ResumeArchitectureModule architecture={workspace.architecture} />
                  </ResumeModuleBoundary>
                ) : null}
                {activeModule === "modeling" ? (
                  <ResumeModuleBoundary
                    boundaryId="resume-modeling"
                    eyebrow="Modeling"
                    title="Visualization failed to render"
                    message="The modeling view hit a rendering issue."
                    resetKey={`${envId}-${activeModule}-${workspace.modeling.presets.length}`}
                  >
                    <ResumeModelingModule modeling={workspace.modeling} outputs={modelOutputs} />
                  </ResumeModuleBoundary>
                ) : null}
                {activeModule === "bi" ? (
                  <ResumeModuleBoundary
                    boundaryId="resume-bi"
                    eyebrow="BI Module"
                    title="Visualization failed to render"
                    message="The analytics slice could not render cleanly."
                    resetKey={`${envId}-${activeModule}-${workspace.bi.entities.length}`}
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
                    message="The supporting narrative rail could not render."
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
                      message="The contextual assistant failed to render."
                      resetKey={`${envId}-${activeModule}`}
                    >
                      <ResumeAssistantDock envId={envId} businessId={businessId} metrics={assistantMetrics} />
                    </ResumeModuleBoundary>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ── MOBILE CONTEXT + ASSISTANT ───────────────────────────── */}
        {isMobileViewport ? (
          <div className="space-y-3">
            <details
              className="rounded-2xl border p-3"
              style={{ borderColor: "var(--ros-border)", background: "var(--ros-surface)" }}
              open
            >
              <summary
                className="resume-label cursor-pointer text-[10px] tracking-[0.18em]"
                style={{ color: "var(--ros-text-dim)" }}
              >
                Context &amp; Evidence
              </summary>
              <div className="mt-3">
                <ResumeModuleBoundary
                  boundaryId="resume-context-rail-mobile"
                  eyebrow="Context Rail"
                  title="Resume data unavailable"
                  message="The supporting narrative rail could not render."
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
              <details
                className="rounded-2xl border p-3"
                style={{ borderColor: "var(--ros-border)", background: "var(--ros-surface)" }}
              >
                <summary
                  className="resume-label cursor-pointer text-[10px] tracking-[0.18em]"
                  style={{ color: "var(--ros-text-dim)" }}
                >
                  Ask Winston
                </summary>
                <div className="mt-3">
                  <ResumeModuleBoundary
                    boundaryId="resume-assistant-mobile"
                    eyebrow="Assistant"
                    title="Resume data unavailable"
                    message="The contextual assistant failed to render."
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
    </div>
  );
}
