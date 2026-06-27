import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import HistoricalMlEvidenceDrawer from "./HistoricalMlEvidenceDrawer";

describe("HistoricalMlEvidenceDrawer (real evidence artifact)", () => {
  it("is closed when open=false", () => {
    render(<HistoricalMlEvidenceDrawer open={false} onClose={() => {}} />);
    expect(screen.queryByText("Historical ML anomaly evidence")).toBeNull();
  });

  it("renders the model card, headline metric, theory, and Databricks source", () => {
    render(<HistoricalMlEvidenceDrawer open onClose={() => {}} envHref="/lab/env/telemetry-demo/telemetry" />);
    // headline (the 93.3% false-positive reduction)
    expect(screen.getByText(/93\.3% mean/)).toBeInTheDocument();
    // model-card shape
    expect(screen.getByText(/Regime-conditioned PCA/)).toBeInTheDocument();
    expect(screen.getByText(/GLOBAL single-operating-mode detector/)).toBeInTheDocument();
    // theory grounded in stored fields
    expect(screen.getByText(/condition the detector on operating regime/i)).toBeInTheDocument();
    // Databricks source table is shown + clickable (workspace resolves to the committed default)
    expect(screen.getByText("novendor_1.telemetry.silver_cmapss")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open silver_cmapss \(Delta\)/i })).toBeInTheDocument();
    // the source query excerpt is shown
    expect(screen.getByText(/FROM novendor_1\.telemetry\.silver_cmapss/)).toBeInTheDocument();
    // honest caveat: NOT proof the PCA scores the live stream
    expect(screen.getByText(/NOT proof that this PCA model scores live Stargate events/i)).toBeInTheDocument();
  });

  it("fails closed on metadata the artifact does not expose (no fabricated values)", () => {
    render(<HistoricalMlEvidenceDrawer open onClose={() => {}} />);
    // full table rowcount + last-materialized + lineage status are not exposed -> Not available + reason
    expect(screen.getByText(/Not available — full source-table rowcount is not captured/i)).toBeInTheDocument();
    expect(screen.getByText(/Not available — live table materialization timestamp/i)).toBeInTheDocument();
  });
});
