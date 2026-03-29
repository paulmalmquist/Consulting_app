import React from "react";
import { render, screen } from "@testing-library/react";
import ResumeTimelineModule from "@/components/resume/ResumeTimelineModule";
import ResumeModelingModule from "@/components/resume/ResumeModelingModule";
import { useResumeWorkspaceStore } from "@/components/resume/useResumeWorkspaceStore";
import {
  makeResumeWorkspacePayload,
} from "@/test/fixtures/resumeWorkspace";

describe("Resume module fallbacks", () => {
  beforeEach(() => {
    const payload = makeResumeWorkspacePayload();
    useResumeWorkspaceStore.setState({
      activeModule: "timeline",
      timelineView: "career",
      playStory: false,
      playIndex: 0,
      selectedTimelineId: null,
      selectedArchitectureNodeId: null,
      highlightArchitectureNodeIds: [],
      architectureView: "technical",
      modelPresetId: payload.modeling.presets[0]?.preset_id ?? "base_case",
      modelInputs: { ...payload.modeling.defaults },
      selectedBiEntityId: payload.bi.root_entity_id,
      biFilters: {
        market: "All Markets",
        propertyType: "All Types",
        period: payload.bi.periods[payload.bi.periods.length - 1] ?? "2025-12",
      },
      workspace: null,
    });
  });

  it("renders a contained timeline fallback when roles are missing", () => {
    render(
      <ResumeTimelineModule
        timeline={{
          default_view: "career",
          views: ["career"],
          start_date: "2025-01-01",
          end_date: "2025-12-31",
          roles: [],
          milestones: [],
        }}
      />,
    );

    expect(screen.getByText("Timeline temporarily unavailable")).toBeInTheDocument();
  });

  it("renders chart fallbacks instead of throwing when modeling series are empty", () => {
    const payload = makeResumeWorkspacePayload();

    render(
      <ResumeModelingModule
        modeling={payload.modeling}
        outputs={{
          irr: 0,
          tvpi: 0,
          equityInvested: 0,
          annualCashFlows: [],
          waterfall: [],
          lpDistribution: 0,
          gpDistribution: 0,
          lpPct: 0,
          gpPct: 0,
        }}
      />,
    );

    expect(screen.getAllByText("Visualization failed to render").length).toBeGreaterThan(0);
    expect(screen.getByText(/did not produce a year-by-year series/i)).toBeInTheDocument();
  });
});
