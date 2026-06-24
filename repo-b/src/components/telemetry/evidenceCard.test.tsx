import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TelemetryEvidenceCard, type EvidenceContract } from "./evidenceCard";
import { TelemetryChartFrame } from "./chartPrimitives";

const base: EvidenceContract = {
  title: "Can you trust this model?",
  thesisRole: "One card per promoted champion.",
};

describe("TelemetryEvidenceCard fail-closed precedence", () => {
  it("shows the error state and not the body when error is set", () => {
    render(<TelemetryEvidenceCard contract={base} error="boom"><span>BODY</span></TelemetryEvidenceCard>);
    expect(screen.getByText(/Could not load/i)).toBeInTheDocument();
    expect(screen.queryByText("BODY")).not.toBeInTheDocument();
  });

  it("shows loading and not the body when loading", () => {
    render(<TelemetryEvidenceCard contract={base} loading><span>BODY</span></TelemetryEvidenceCard>);
    expect(screen.getByText(/Loading evidence/i)).toBeInTheDocument();
    expect(screen.queryByText("BODY")).not.toBeInTheDocument();
  });

  it("renders the null_reason verbatim and not the body", () => {
    render(
      <TelemetryEvidenceCard contract={base} nullReason="model_not_promoted">
        <span>BODY</span>
      </TelemetryEvidenceCard>
    );
    expect(screen.getByText(/model_not_promoted/)).toBeInTheDocument();
    expect(screen.queryByText("BODY")).not.toBeInTheDocument();
  });

  it("renders the body, method, claim boundary, source chip and provenance when healthy", () => {
    render(
      <TelemetryEvidenceCard
        contract={{
          ...base,
          sourceStatus: { label: "recorded capture", tone: "recorded" },
          method: "grouped-by-unit walk-forward",
          claimBoundary: "not live serving",
          provenance: "tel_model_runs",
        }}
      >
        <span>BODY</span>
      </TelemetryEvidenceCard>
    );
    expect(screen.getByText("BODY")).toBeInTheDocument();
    expect(screen.getByText("recorded capture")).toBeInTheDocument();
    expect(screen.getByText(/grouped-by-unit walk-forward/)).toBeInTheDocument();
    expect(screen.getByText(/not live serving/)).toBeInTheDocument();
    expect(screen.getByText(/tel_model_runs/)).toBeInTheDocument();
  });
});

describe("TelemetryChartFrame", () => {
  it("renders the empty fail-closed state instead of the chart when empty", () => {
    render(
      <TelemetryChartFrame title="Trace" empty emptyHint="evidence unavailable">
        <svg data-testid="chart" />
      </TelemetryChartFrame>
    );
    expect(screen.getByText(/evidence unavailable/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chart")).not.toBeInTheDocument();
  });

  it("renders the chart body and caption when not empty", () => {
    render(
      <TelemetryChartFrame title="Trace" caption="D-4 telemetry">
        <svg data-testid="chart" />
      </TelemetryChartFrame>
    );
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    expect(screen.getByText("D-4 telemetry")).toBeInTheDocument();
  });
});
