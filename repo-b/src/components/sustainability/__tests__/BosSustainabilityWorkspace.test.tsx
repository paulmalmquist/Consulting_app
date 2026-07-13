import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BosSustainabilityWorkspace from "@/components/sustainability/BosSustainabilityWorkspace";
import type {
  SusAuthoritativeReportResponse,
  SusAuthoritativeStateResponse,
} from "@/lib/bos-api";

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    getSusAuthoritativeOverview: vi.fn(),
    getSusAuthoritativeReport: vi.fn(),
  };
});

import {
  getSusAuthoritativeOverview,
  getSusAuthoritativeReport,
} from "@/lib/bos-api";

const mocked = getSusAuthoritativeOverview as unknown as ReturnType<typeof vi.fn>;
const mockedReport = getSusAuthoritativeReport as unknown as ReturnType<typeof vi.fn>;

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

const REPORT_RELEASED: SusAuthoritativeReportResponse = {
  entity_scope: "portfolio",
  period_key: "2026Q1",
  requested_period_key: "2026Q1",
  period_exact: true,
  metric_family: "ghg",
  state_origin: "authoritative",
  snapshot_version: "sv-abc-123",
  promotion_state: "released",
  trust_status: "trusted",
  null_reason: null,
  metrics: RELEASED_PAYLOAD.metrics,
  evidence: [],
  generated_at: "2026-07-13T18:00:00Z",
};

const REPORT_UNAVAILABLE: SusAuthoritativeReportResponse = {
  entity_scope: "portfolio",
  period_key: "2026Q1",
  requested_period_key: "2026Q1",
  period_exact: false,
  metric_family: "ghg",
  state_origin: "authoritative",
  snapshot_version: null,
  promotion_state: null,
  trust_status: "missing_source",
  null_reason: "snapshot_unavailable",
  metrics: [],
  evidence: [],
  generated_at: "2026-07-13T18:00:00Z",
};

const REPORT_WITH_NULL_METRIC: SusAuthoritativeReportResponse = {
  ...REPORT_RELEASED,
  snapshot_version: "sv-xyz-789",
  metrics: NULL_METRIC_PAYLOAD.metrics,
};

describe("BosSustainabilityWorkspace", () => {
  beforeEach(() => {
    mocked.mockReset();
    mockedReport.mockReset();
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

  it("opens the governed report and shows the same snapshot_version the dashboard shows", async () => {
    mocked.mockResolvedValueOnce(RELEASED_PAYLOAD);
    mockedReport.mockResolvedValueOnce(REPORT_RELEASED);

    render(<BosSustainabilityWorkspace />);
    await screen.findByTestId("bos-sus-metric-grid");

    fireEvent.click(screen.getByTestId("bos-sus-open-report"));

    const view = await screen.findByTestId("bos-sus-report-view");
    expect(view).toBeInTheDocument();
    expect(screen.getByTestId("bos-sus-report-snapshot-version")).toHaveTextContent("sv-abc-123");
    expect(screen.getByTestId("bos-sus-report-trust-status")).toHaveTextContent("trust: trusted");
    expect(screen.getByTestId("bos-sus-report-promotion-state")).toHaveTextContent(
      "promotion: released"
    );
    // Report snapshot_version matches the dashboard governance header.
    expect(screen.getByTestId("bos-sus-snapshot-version")).toHaveTextContent("sv-abc-123");
  });

  it("renders a null metric's null_reason in the report, matching the dashboard", async () => {
    mocked.mockResolvedValueOnce(NULL_METRIC_PAYLOAD);
    mockedReport.mockResolvedValueOnce(REPORT_WITH_NULL_METRIC);

    render(<BosSustainabilityWorkspace />);
    await screen.findByTestId("bos-sus-metric-null-scope3_tco2e");

    fireEvent.click(screen.getByTestId("bos-sus-open-report"));

    const row = await screen.findByTestId("bos-sus-report-metric-null-reason-scope3_tco2e");
    expect(row).toHaveTextContent("out_of_scope_requires_scope3_ingestion");
    expect(row.textContent).not.toMatch(/(^|\s)0(\s|$)/);
  });

  it("renders explicit unavailable state and no totals when the report snapshot is unavailable", async () => {
    mocked.mockResolvedValueOnce(RELEASED_PAYLOAD);
    mockedReport.mockResolvedValueOnce(REPORT_UNAVAILABLE);

    render(<BosSustainabilityWorkspace />);
    await screen.findByTestId("bos-sus-metric-grid");

    fireEvent.click(screen.getByTestId("bos-sus-open-report"));

    const banner = await screen.findByTestId("bos-sus-report-unavailable");
    expect(banner).toHaveTextContent("snapshot_unavailable");
    expect(screen.queryByTestId("bos-sus-report-view")).toBeNull();
    expect(screen.queryByTestId("bos-sus-report-metric-list")).toBeNull();
  });
});
