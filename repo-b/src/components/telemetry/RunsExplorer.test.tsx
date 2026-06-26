import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

import RunsExplorer from "./RunsExplorer";
import type { TestRun } from "@/lib/telemetry/api";

const { getRuns } = vi.hoisted(() => ({ getRuns: vi.fn() }));

vi.mock("@/lib/telemetry/api", () => ({
  getRuns,
  TELEMETRY_DEMO_ENV_ID: "telemetry-demo",
  TELEMETRY_DEMO_BUSINESS_ID: "7e1eb000-0000-4000-a000-000000000001",
}));

const RUNS: TestRun[] = [
  { id: "run-1", run_key: "iss_live:rul:FD001-unit-7", dataset: "C-MAPSS FD001",
    unit_or_channel: "unit_7", spacecraft: null, row_count: 1234,
    ingest_at: "2026-06-10T12:00:00Z", status: "ingested", created_at: "2026-06-10T11:59:00Z" },
];

describe("RunsExplorer (8G)", () => {
  beforeEach(() => getRuns.mockReset());

  it("labels the live source-kind and exports the displayed runs as CSV", async () => {
    getRuns.mockResolvedValueOnce(RUNS);
    render(<RunsExplorer />);
    await waitFor(() => expect(screen.getByText("live rows · tel_test_runs")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Export CSV/i })).not.toBeDisabled();
  });

  it("drills a run and fail-closes the absent run-link/model fields without fabricating a URL", async () => {
    getRuns.mockResolvedValueOnce(RUNS);
    render(<RunsExplorer />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Inspect run iss_live:rul:FD001-unit-7/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Inspect run iss_live:rul:FD001-unit-7/i }));
    // drawer-unique field labels (present + the fail-closed run-link fields)
    expect(screen.getByText("Run key")).toBeInTheDocument();
    expect(screen.getByText("MLflow / Databricks run")).toBeInTheDocument();
    expect(screen.getByText("Model / evidence artifact")).toBeInTheDocument();
    // explicit null_reason, no fabricated run URL
    expect(screen.getByText(/no run URL is fabricated/i)).toBeInTheDocument();
  });

  it("fail-closed: no runs disables the CSV export (no fake file)", async () => {
    getRuns.mockResolvedValueOnce([]);
    render(<RunsExplorer />);
    await waitFor(() => expect(screen.getByText(/0 runs/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Export CSV/i })).toBeDisabled();
  });
});
