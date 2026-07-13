import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import SustainabilityEvidenceDrawer from "@/components/sustainability/SustainabilityEvidenceDrawer";
import BosSustainabilityWorkspace from "@/components/sustainability/BosSustainabilityWorkspace";
import type {
  SusAuthoritativeEvidenceItem,
  SusAuthoritativeEvidenceResponse,
  SusAuthoritativeMetricItem,
  SusAuthoritativeQueryParams,
  SusAuthoritativeStateResponse,
} from "@/lib/bos-api";

vi.mock("@/lib/bos-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bos-api")>("@/lib/bos-api");
  return {
    ...actual,
    getSusAuthoritativeOverview: vi.fn(),
    getSusAuthoritativeMetricEvidence: vi.fn(),
  };
});

import {
  getSusAuthoritativeOverview,
  getSusAuthoritativeMetricEvidence,
} from "@/lib/bos-api";

const mockedOverview = getSusAuthoritativeOverview as unknown as ReturnType<typeof vi.fn>;
const mockedEvidence = getSusAuthoritativeMetricEvidence as unknown as ReturnType<typeof vi.fn>;

const QUERY: SusAuthoritativeQueryParams = {
  business_id: "demo",
  env_id: "sustainability-demo",
  entity_scope: "portfolio",
  period_key: "2026Q1",
  metric_family: "ghg",
};

const VALUED_METRIC: SusAuthoritativeMetricItem = {
  metric_key: "scope1_tco2e",
  value: 1234.5,
  unit: "tCO2e",
  null_reason: null,
  trust_status: "trusted",
};

const NULL_METRIC: SusAuthoritativeMetricItem = {
  metric_key: "scope3_tco2e",
  value: null,
  unit: "tCO2e",
  null_reason: "out_of_scope_requires_scope3_ingestion",
  trust_status: "untrusted",
};

const GOVERNANCE = {
  snapshot_version: "sv-abc-123",
  promotion_state: "released",
  trust_status: "trusted",
  period_exact: true,
};

const EVIDENCE_ROWS: SusAuthoritativeEvidenceItem[] = [
  {
    metric_key: "scope1_tco2e",
    source_table: "sus_emission_source",
    source_row_ref: "row-42",
    emission_factor_set_id: "efs-2024-us",
    ingestion_run_id: "ing-7788",
    formula_id: "fml-ghg-s1",
  },
];

const okResponse = (rows: SusAuthoritativeEvidenceItem[]): SusAuthoritativeEvidenceResponse => ({
  evidence: rows,
});

describe("SustainabilityEvidenceDrawer", () => {
  beforeEach(() => {
    mockedEvidence.mockReset();
    mockedOverview.mockReset();
  });

  it("renders value, unit, snapshot_version, trust_status, and evidence rows for a valued metric", async () => {
    mockedEvidence.mockResolvedValue(okResponse(EVIDENCE_ROWS));

    render(
      <SustainabilityEvidenceDrawer
        open
        onClose={() => {}}
        metric={VALUED_METRIC}
        governance={GOVERNANCE}
        query={QUERY}
        metricLabel="Scope 1 (tCO2e)"
      />
    );

    // value + unit (locale-tolerant thousands separator)
    const standing = await screen.findByTestId("sus-evidence-standing");
    expect(standing.textContent ?? "").toMatch(/1[.,]?234\.5\s*tCO2e/);
    expect(standing.textContent ?? "").toContain("tCO2e");
    // snapshot version
    const snapshotSection = screen.getByTestId("sus-evidence-snapshot");
    expect(snapshotSection.textContent ?? "").toContain("sv-abc-123");
    // trust status appears at least once in the standing section
    expect(standing.textContent ?? "").toContain("trusted");
    // evidence rows
    await waitFor(() => {
      expect(screen.getByTestId("sus-evidence-row")).toBeInTheDocument();
    });
    const row = screen.getByTestId("sus-evidence-row");
    expect(row.textContent ?? "").toContain("sus_emission_source");
    expect(row.textContent ?? "").toContain("row-42");
  });

  it("renders the null_reason and no zero when the metric value is null", async () => {
    mockedEvidence.mockResolvedValue(okResponse([]));

    const { container } = render(
      <SustainabilityEvidenceDrawer
        open
        onClose={() => {}}
        metric={NULL_METRIC}
        governance={GOVERNANCE}
        query={QUERY}
        metricLabel="Scope 3 (tCO2e)"
      />
    );

    const reason = await screen.findByTestId("sus-evidence-null-reason");
    expect(reason).toHaveTextContent("out_of_scope_requires_scope3_ingestion");
    // no fabricated zero anywhere in the drawer body
    expect(container.textContent).not.toMatch(/(^|\s)0(\s|$)/);
    expect(container.textContent).not.toMatch(/(^|\s)0 tCO2e/);
  });

  it("renders an explicit empty-evidence state when the endpoint returns no rows", async () => {
    mockedEvidence.mockResolvedValue(okResponse([]));

    render(
      <SustainabilityEvidenceDrawer
        open
        onClose={() => {}}
        metric={VALUED_METRIC}
        governance={GOVERNANCE}
        query={QUERY}
      />
    );

    const empty = await screen.findByTestId("sus-evidence-empty");
    expect(empty).toHaveTextContent(/No evidence rows/i);
    expect(screen.queryByTestId("sus-evidence-row")).toBeNull();
  });

  it("renders an explicit error state when the evidence fetch rejects", async () => {
    mockedEvidence.mockRejectedValue(new Error("boom"));

    render(
      <SustainabilityEvidenceDrawer
        open
        onClose={() => {}}
        metric={VALUED_METRIC}
        governance={GOVERNANCE}
        query={QUERY}
      />
    );

    const err = await screen.findByTestId("sus-evidence-error");
    expect(err).toHaveTextContent(/boom/);
    expect(screen.queryByTestId("sus-evidence-row")).toBeNull();
  });
});

describe("BosSustainabilityWorkspace click-to-open", () => {
  beforeEach(() => {
    mockedOverview.mockReset();
    mockedEvidence.mockReset();
  });

  it("opens the evidence drawer when a metric card is clicked", async () => {
    const overview: SusAuthoritativeStateResponse = {
      entity_scope: "portfolio",
      period_key: "2026Q1",
      requested_period_key: "2026Q1",
      period_exact: true,
      state_origin: "authoritative_snapshot",
      snapshot_version: "sv-abc-123",
      promotion_state: "released",
      trust_status: "trusted",
      null_reason: null,
      metrics: [VALUED_METRIC],
      evidence: [],
    };
    mockedOverview.mockResolvedValueOnce(overview);
    mockedEvidence.mockResolvedValue(okResponse(EVIDENCE_ROWS));

    render(<BosSustainabilityWorkspace />);

    const card = await screen.findByTestId("bos-sus-metric-scope1_tco2e");
    expect(card.tagName).toBe("BUTTON");
    fireEvent.click(card);

    await waitFor(() => {
      expect(screen.getByTestId("sus-evidence-standing")).toBeInTheDocument();
    });
    expect(mockedEvidence).toHaveBeenCalledWith(
      "scope1_tco2e",
      expect.objectContaining({ business_id: "demo", env_id: "sustainability-demo" })
    );
  });
});
