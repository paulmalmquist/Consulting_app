import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceRowsTable } from "./SourceRowsTable";
import { DatabricksRunLink, ModelArtifactLink } from "./evidenceLinks";
import { ExportToExcelButton } from "./ExportButtons";

describe("SourceRowsTable", () => {
  it("renders live rows, the kind label, and an enabled CSV export", () => {
    render(
      <SourceRowsTable
        kind="live-rows"
        columns={["model_name", "rmse"]}
        rows={[{ model_name: "cnn-lstm", rmse: 17.33 }]}
        sourceLabel="tel_model_runs"
      />,
    );
    expect(screen.getAllByText(/live rows/i).length).toBeGreaterThan(0);
    expect(screen.getByText("cnn-lstm")).toBeInTheDocument();
    expect(screen.getByText(/tel_model_runs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
  });

  it("labels a computed artifact honestly (not live serving)", () => {
    render(<SourceRowsTable kind="computed-artifact" columns={["picp"]} rows={[{ picp: 0.86 }]} />);
    expect(screen.getByText(/not live serving/i)).toBeInTheDocument();
  });

  it("unavailable kind shows the null_reason and disables both exports", () => {
    render(
      <SourceRowsTable kind="unavailable" columns={["a"]} rows={[]} nullReason="model_not_promoted" />,
    );
    expect(screen.getAllByText(/model_not_promoted/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Export XLSX/i })).toBeDisabled();
  });
});

describe("evidence links (fail-closed)", () => {
  it("renders a live MLflow run link when a run id is present", () => {
    render(<DatabricksRunLink runId="run-abc123" />);
    const a = screen.getByRole("link", { name: /Open MLflow Run/i });
    expect(a.getAttribute("href")).toContain("run-abc123");
  });

  it("fail-closed (disabled + reason) when the run id is missing", () => {
    render(<DatabricksRunLink runId={null} />);
    expect(screen.getByText(/Unavailable —/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open MLflow Run/i })).toBeDisabled();
  });

  it("model artifact link is fail-closed for a non-UC seed key", () => {
    render(<ModelArtifactLink modelName="seed_key_no_dots" />);
    expect(screen.getByText(/Unavailable —/i)).toBeInTheDocument();
  });
});

describe("ExportToExcelButton", () => {
  it("is disabled with a reason when no server url is available", () => {
    render(<ExportToExcelButton url={null} />);
    expect(screen.getByRole("button", { name: /Export XLSX/i })).toBeDisabled();
  });
  it("is enabled when a url is present", () => {
    render(<ExportToExcelButton url="/api/telemetry/export/model_runs.xlsx?env_id=x&business_id=y" />);
    expect(screen.getByRole("button", { name: /Export XLSX/i })).not.toBeDisabled();
  });
});
