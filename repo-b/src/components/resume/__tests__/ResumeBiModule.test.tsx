import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ResumeBiModule from "../ResumeBiModule";
import { buildResumeBiInspectionView, deriveResumeBiSlice } from "../biMath";
import { useResumeWorkspaceStore } from "../useResumeWorkspaceStore";
import { makeResumeWorkspacePayload } from "@/test/fixtures/resumeWorkspace";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div data-testid="bar-chart-series" />,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

vi.mock("@/components/charts/TrendLineChart", () => ({
  default: () => <div data-testid="trend-line-chart">Trend chart</div>,
}));

function seedStore() {
  useResumeWorkspaceStore.setState({
    workspace: null,
    activeModule: "bi",
    timelineView: "career",
    playStory: false,
    playIndex: 0,
    selectedTimelineId: null,
    selectedNarrativeKind: null,
    selectedNarrativeId: null,
    hoveredNarrativeKind: null,
    hoveredNarrativeId: null,
    selectedArchitectureNodeId: null,
    highlightArchitectureNodeIds: [],
    architectureView: "technical",
    modelPresetId: "base_case",
    modelInputs: {
      purchase_price: 0,
      exit_cap_rate: 0,
      hold_period: 5,
      noi_growth_pct: 0,
      debt_pct: 0,
    },
    selectedBiEntityId: "fund-kayne-warehouse",
    biFilters: {
      market: "All Markets",
      propertyType: "All Types",
      period: "2025-12",
    },
    capabilityHoveredLayer: null,
    enabledCapabilityLayerIds: [],
    selectedImpactMetric: "impact_composite",
    selectedSkillId: null,
    highlightedSystemId: null,
    lastBiEntitySource: "bi",
    lastModelPresetSource: "init",
  });
}

describe("ResumeBiModule", () => {
  const bi = makeResumeWorkspacePayload().bi;

  beforeEach(() => {
    seedStore();
  });

  it("renders the reordered sections and lineage strip", () => {
    render(<ResumeBiModule bi={bi} />);

    const header = screen.getByText("Executive analytics with real drill paths");
    const lineage = screen.getByText("Data Lineage");
    const kpis = screen.getByText("KPI Summary");
    const drill = screen.getByText("Drill Path");
    const charts = screen.getByText("Portfolio by sector");
    const table = screen.getByText("Detail table");

    expect(header.compareDocumentPosition(lineage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lineage.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kpis.compareDocumentPosition(drill) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(drill.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(charts.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getByRole("button", { name: /^warehouse$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^semantic layer$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^gold tables$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^bi model$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^etl$/i })).toBeInTheDocument();
  });

  it("opens the inspection layer with query, lineage details, filters, and metric definitions", async () => {
    const user = userEvent.setup();
    render(<ResumeBiModule bi={bi} />);

    await user.click(screen.getByRole("button", { name: /inspect this view/i }));

    expect(screen.getByText("Pseudo-SQL")).toBeInTheDocument();
    expect(screen.getByText("Source Tables")).toBeInTheDocument();
    expect(screen.getByText("Joins / Transformations")).toBeInTheDocument();
    expect(screen.getByText("Filters Applied")).toBeInTheDocument();
    expect(screen.getByText("Metric Definitions")).toBeInTheDocument();
    expect(screen.getAllByText("Portfolio Value").length).toBeGreaterThan(0);
    expect(screen.getAllByText("NOI").length).toBeGreaterThan(0);
  });

  it("syncs drill path when a detail row is clicked", async () => {
    const user = userEvent.setup();
    useResumeWorkspaceStore.setState({ selectedBiEntityId: "portfolio-root" });
    render(<ResumeBiModule bi={bi} />);

    await user.click(screen.getByRole("button", { name: /kayne anderson operations/i }));

    expect(screen.getByRole("button", { name: /fund/i })).toHaveTextContent("Kayne Anderson Operations");
    expect(useResumeWorkspaceStore.getState().selectedBiEntityId).toBe("fund-kayne-ops");
  });
});

describe("resume BI helpers", () => {
  it("suppresses empty-state KPI context when the slice has no meaningful data", () => {
    const emptyBi = {
      root_entity_id: "portfolio-root",
      levels: ["portfolio", "fund", "investment", "asset"] as const,
      markets: [],
      property_types: [],
      periods: ["2025-12"],
      entities: [
        {
          entity_id: "portfolio-root",
          parent_id: null,
          level: "portfolio" as const,
          name: "Portfolio",
          market: null,
          property_type: null,
          sector: null,
          coordinates: null,
          metrics: { portfolio_value: 0, noi: 0, occupancy: 0, irr: 0 },
          trend: [],
          story: "root",
          linked_architecture_node_ids: [],
          linked_timeline_ids: [],
        },
      ],
    };

    const slice = deriveResumeBiSlice(emptyBi, "portfolio-root", {
      market: "All Markets",
      propertyType: "All Types",
      period: "2025-12",
    });

    expect(slice.hasMeaningfulData).toBe(false);
    expect(slice.kpiContext).toBe("awaiting_selection");
  });

  it("builds inspection content from the current BI slice", () => {
    const bi = makeResumeWorkspacePayload().bi;
    const slice = deriveResumeBiSlice(bi, "fund-kayne-warehouse", {
      market: "All Markets",
      propertyType: "All Types",
      period: "2025-12",
    });

    const inspection = buildResumeBiInspectionView(slice, {
      market: "All Markets",
      propertyType: "All Types",
      period: "2025-12",
    });

    expect(inspection.sql).toContain("SELECT");
    expect(inspection.sourceTables).toContain("gold.fund_performance");
    expect(inspection.filters).toContain("period <= 2025-12");
    expect(inspection.metricDefinitions.map((item) => item.label)).toContain("IRR");
  });
});
