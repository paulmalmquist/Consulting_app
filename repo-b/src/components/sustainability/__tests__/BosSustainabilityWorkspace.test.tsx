import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import BosSustainabilityWorkspace from "@/components/sustainability/BosSustainabilityWorkspace";
import type { SusAuthoritativeStateResponse } from "@/lib/bos-api";

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    getSusAuthoritativeOverview: vi.fn(),
  };
});

import { getSusAuthoritativeOverview } from "@/lib/bos-api";

const mocked = getSusAuthoritativeOverview as unknown as ReturnType<typeof vi.fn>;

const RELEASED_PAYLOAD: SusAuthoritativeStateResponse = {
  entity_scope: "portfolio",
  period_key: "2026Q1",
  requested_period_key: "2026Q1",
  period_exact: true,
  state_origin: "authoritative_snapshot",
  snapshot_version: "sv-abc-123",
  promotion_state: "released",
  trust_status: "trusted",
  null_reason: null,
  metrics: [
    { metric_key: "scope1_tco2e", value: 1234.5, unit: "tCO2e", null_reason: null, trust_status: "trusted" },
    { metric_key: "scope2_location_tco2e", value: 987.6, unit: "tCO2e", null_reason: null, trust_status: "trusted" },
    { metric_key: "scope2_market_tco2e", value: 800.0, unit: "tCO2e", null_reason: null, trust_status: "trusted" },
    { metric_key: "scope3_tco2e", value: 4200.0, unit: "tCO2e", null_reason: null, trust_status: "trusted" },
    { metric_key: "energy_intensity_kwh_per_sqft", value: 18.4, unit: "kWh/sqft", null_reason: null, trust_status: "trusted" },
    { metric_key: "water_intensity_gal_per_sqft", value: 12.1, unit: "gal/sqft", null_reason: null, trust_status: "trusted" },
  ],
  evidence: [],
};

const UNAVAILABLE_PAYLOAD: SusAuthoritativeStateResponse = {
  entity_scope: "portfolio",
  period_key: "2026Q1",
  requested_period_key: "2026Q1",
  period_exact: null,
  state_origin: null,
  snapshot_version: null,
  promotion_state: null,
  trust_status: null,
  null_reason: "snapshot_unavailable",
  metrics: [],
  evidence: [],
};

const NULL_METRIC_PAYLOAD: SusAuthoritativeStateResponse = {
  entity_scope: "portfolio",
  period_key: "2026Q1",
  requested_period_key: "2026Q1",
  period_exact: true,
  state_origin: "authoritative_snapshot",
  snapshot_version: "sv-xyz-789",
  promotion_state: "released",
  trust_status: "trusted",
  null_reason: null,
  metrics: [
    {
      metric_key: "scope3_tco2e",
      value: null,
      unit: "tCO2e",
      null_reason: "out_of_scope_requires_scope3_ingestion",
      trust_status: "untrusted",
    },
  ],
  evidence: [],
};

describe("BosSustainabilityWorkspace", () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it("renders a card per metric plus snapshot version and trust status for a released snapshot", async () => {
    mocked.mockResolvedValueOnce(RELEASED_PAYLOAD);

    render(<BosSustainabilityWorkspace />);

    await waitFor(() => {
      expect(screen.getByTestId("bos-sus-metric-grid")).toBeInTheDocument();
    });

    for (const m of RELEASED_PAYLOAD.metrics) {
      expect(screen.getByTestId(`bos-sus-metric-${m.metric_key}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("bos-sus-snapshot-version")).toHaveTextContent("sv-abc-123");
    expect(screen.getByTestId("bos-sus-trust-status")).toHaveTextContent("trust: trusted");
    expect(screen.getByTestId("bos-sus-promotion-state")).toHaveTextContent("promotion: released");
    expect(screen.queryByTestId("bos-sus-snapshot-unavailable")).toBeNull();
  });

  it("renders an explicit unavailable state naming the reason and no zero when snapshot_unavailable", async () => {
    mocked.mockResolvedValueOnce(UNAVAILABLE_PAYLOAD);

    const { container } = render(<BosSustainabilityWorkspace />);
    const banner = await screen.findByTestId("bos-sus-snapshot-unavailable");
    expect(banner).toHaveTextContent("snapshot_unavailable");
    expect(screen.queryByTestId("bos-sus-metric-grid")).toBeNull();
    expect(screen.queryByTestId("bos-sus-governance-header")).toBeNull();
    expect(screen.queryByTestId("bos-sus-snapshot-version")).toBeNull();
    expect(screen.queryByTestId("bos-sus-trust-status")).toBeNull();
    expect(screen.queryByTestId("bos-sus-promotion-state")).toBeNull();
    expect(container.textContent).not.toContain("—");
    expect(banner.textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });

  it("renders a null metric's null_reason instead of 0 or a blank", async () => {
    mocked.mockResolvedValueOnce(NULL_METRIC_PAYLOAD);

    render(<BosSustainabilityWorkspace />);

    const nullTile = await screen.findByTestId("bos-sus-metric-null-scope3_tco2e");
    expect(nullTile).toHaveTextContent("out_of_scope_requires_scope3_ingestion");
    expect(nullTile.textContent).not.toMatch(/(^|\s)0(\s|$)/);
    expect(screen.queryByTestId("bos-sus-metric-scope3_tco2e")).toBeNull();
  });
});
