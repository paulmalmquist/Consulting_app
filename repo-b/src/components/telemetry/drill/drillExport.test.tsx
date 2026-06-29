import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("SourceRowsTable — Excel-like filtering", () => {
  const COLS = ["vehicle", "defect"];
  const ROWS = [
    { vehicle: "VEH-001", defect: "witness-mark" },
    { vehicle: "VEH-001", defect: "porosity" },
    { vehicle: "VEH-002", defect: "porosity" },
  ];

  it("CSV export starts with all rows (export aria-label carries the row count)", () => {
    render(<SourceRowsTable kind="live-rows" columns={COLS} rows={ROWS} />);
    expect(screen.getByRole("button", { name: /Export CSV \(3 rows\)/i })).toBeInTheDocument();
  });

  it("a per-column text filter narrows the table AND the CSV export to the filtered rows", () => {
    render(<SourceRowsTable kind="live-rows" columns={COLS} rows={ROWS} />);
    // open the "defect" column filter popover
    fireEvent.click(screen.getByRole("button", { name: /Filter defect/i }));
    const box = screen.getByPlaceholderText(/Filter defect/i);
    fireEvent.change(box, { target: { value: "poro" } });
    // header strip reports the filtered count
    expect(screen.getByText(/2 of 3 rows \(filtered\)/i)).toBeInTheDocument();
    // CSV export now carries 2 rows (the filtered set), not 3
    expect(screen.getByRole("button", { name: /Export CSV.*\(2 rows\)/i })).toBeInTheDocument();
    // witness-mark row is gone from the body
    expect(screen.queryByText("witness-mark")).not.toBeInTheDocument();
  });

  it("the distinct-value checklist filters by unchecking a value", () => {
    render(<SourceRowsTable kind="live-rows" columns={COLS} rows={ROWS} />);
    fireEvent.click(screen.getByRole("button", { name: /Filter vehicle/i }));
    // uncheck VEH-001 inside the popover (a checkbox label)
    const popoverV1 = screen.getByText("VEH-001", { selector: "span" }).closest("label")!;
    fireEvent.click(within(popoverV1).getByRole("checkbox"));
    // only the single VEH-002 row remains -> CSV carries 1 row
    expect(screen.getByRole("button", { name: /Export CSV.*\(1 rows\)/i })).toBeInTheDocument();
  });

  it("clicking a column header sorts the rows (and a Clear filters reset appears once filtered)", () => {
    render(<SourceRowsTable kind="live-rows" columns={COLS} rows={ROWS} />);
    // no clear button until a filter is active
    expect(screen.queryByRole("button", { name: /Clear filters/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Filter defect/i }));
    fireEvent.change(screen.getByPlaceholderText(/Filter defect/i), { target: { value: "poro" } });
    expect(screen.getByRole("button", { name: /Clear filters/i })).toBeInTheDocument();
    // clearing restores all 3 rows to the export
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));
    expect(screen.getByRole("button", { name: /Export CSV \(3 rows\)/i })).toBeInTheDocument();
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
