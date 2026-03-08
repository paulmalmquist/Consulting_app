import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DealRadarCanvas } from "./DealRadarCanvas";
import type { DealRadarNode } from "./types";

function makeNode(overrides: Partial<DealRadarNode> = {}): DealRadarNode {
  return {
    dealId: overrides.dealId || "deal-1",
    dealName: overrides.dealName || "Phoenix Logistics Center",
    sector: overrides.sector || "industrial",
    stage: overrides.stage || "dd",
    originalStage: overrides.originalStage || "dd",
    fundId: overrides.fundId || "fund-1",
    fundName: overrides.fundName || "Meridian Growth Fund",
    city: overrides.city || "Phoenix",
    state: overrides.state || "AZ",
    strategy: overrides.strategy || "value_add",
    source: overrides.source || "CBRE",
    headlinePrice: overrides.headlinePrice || 48000000,
    equityRequired: overrides.equityRequired || 18000000,
    targetIrr: overrides.targetIrr || 18,
    targetMoic: overrides.targetMoic || 2.1,
    brokerName: overrides.brokerName || "Morgan Ruiz",
    brokerOrg: overrides.brokerOrg || "CBRE",
    sponsorName: overrides.sponsorName || "Canyon Sponsor",
    lastUpdatedAt: overrides.lastUpdatedAt || new Date().toISOString(),
    propertyCount: overrides.propertyCount || 1,
    activityCount: overrides.activityCount || 2,
    blockers: overrides.blockers || ["Capital stack is incomplete or equity requirement is unresolved."],
    alerts: overrides.alerts || ["capital_gap"],
    readinessScore: overrides.readinessScore || 74,
    riskScore: overrides.riskScore || 68,
    fitScore: overrides.fitScore || 71,
    marketScore: overrides.marketScore || 66,
    valueForSizing: overrides.valueForSizing || 18000000,
    locationLabel: overrides.locationLabel || "Phoenix, AZ",
    searchText: overrides.searchText || "phoenix logistics center phoenix az morgan ruiz cbre canyon sponsor",
  };
}

describe("DealRadarCanvas", () => {
  it("shows a hover intelligence card and selects a node on click", () => {
    const onSelectDeal = vi.fn();
    const onAskWinston = vi.fn();

    render(
      <DealRadarCanvas
        envId="env-1"
        mode="risk"
        nodes={[makeNode()]}
        selectedDealId={null}
        onSelectDeal={onSelectDeal}
        onAskWinston={onAskWinston}
      />,
    );

    const nodeButton = screen.getByLabelText(/Phoenix Logistics Center/i);
    fireEvent.mouseEnter(nodeButton);

    expect(screen.getAllByText("Phoenix Logistics Center").length).toBeGreaterThan(1);
    expect(screen.getByText(/Target IRR/i)).toBeInTheDocument();

    fireEvent.click(nodeButton);
    expect(onSelectDeal).toHaveBeenCalledWith("deal-1");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText(/Target IRR/i)).not.toBeInTheDocument();
  });
});
