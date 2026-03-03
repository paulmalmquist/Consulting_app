import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ConsultingLoopsPage from "@/app/lab/env/[envId]/consulting/loops/page";

const mockUseConsultingEnv = vi.fn();
const mockFetchLoops = vi.fn();
const mockFetchLoopSummary = vi.fn();
const mockFetchClients = vi.fn();

vi.mock("@/components/consulting/ConsultingEnvProvider", () => ({
  useConsultingEnv: (...args: unknown[]) => mockUseConsultingEnv(...args),
}));

vi.mock("@/lib/cro-api", () => ({
  fetchLoops: (...args: unknown[]) => mockFetchLoops(...args),
  fetchLoopSummary: (...args: unknown[]) => mockFetchLoopSummary(...args),
  fetchClients: (...args: unknown[]) => mockFetchClients(...args),
}));

describe("Consulting Loop Intelligence index page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConsultingEnv.mockReturnValue({
      businessId: "biz-1",
      ready: true,
      loading: false,
      error: null,
    });
    mockFetchLoopSummary.mockResolvedValue({
      total_annual_cost: 184000,
      loop_count: 2,
      avg_maturity_stage: 3.5,
      top_5_by_cost: [
        {
          id: "loop-1",
          name: "Monthly Financial Reporting Loop",
          annual_estimated_cost: 120000,
        },
      ],
      status_counts: {
        observed: 1,
        simplifying: 1,
        automating: 0,
        stabilized: 0,
      },
    });
    mockFetchLoops.mockResolvedValue([
      {
        id: "loop-1",
        env_id: "env-1",
        business_id: "biz-1",
        client_id: null,
        name: "Monthly Financial Reporting Loop",
        process_domain: "reporting",
        description: "Monthly close package",
        trigger_type: "scheduled",
        frequency_type: "monthly",
        frequency_per_year: 12,
        status: "observed",
        control_maturity_stage: 2,
        automation_readiness_score: 58,
        avg_wait_time_minutes: 180,
        rework_rate_percent: 12,
        role_count: 2,
        loop_cost_per_run: 10000,
        annual_estimated_cost: 120000,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
    ]);
    mockFetchClients.mockResolvedValue([]);
  });

  test("renders summary cards and loop table rows", async () => {
    render(<ConsultingLoopsPage params={{ envId: "env-1" }} />);

    await waitFor(() =>
      expect(mockFetchLoopSummary).toHaveBeenCalledWith("env-1", "biz-1", {})
    );

    expect(await screen.findByText("Loop Intelligence")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Monthly Financial Reporting Loop" })
    ).toBeInTheDocument();
    expect(screen.getByText("$184K")).toBeInTheDocument();

    const addLoopLink = screen.getByRole("link", { name: "Add Loop" });
    expect(addLoopLink).toHaveAttribute("href", "/lab/env/env-1/consulting/loops/new");
  });
});
