import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConsultingLoopDetailPage from "@/app/lab/env/[envId]/consulting/loops/[loopId]/page";

const mockUseConsultingEnv = vi.fn();
const mockFetchLoop = vi.fn();
const mockFetchClients = vi.fn();
const mockUpdateLoop = vi.fn();
const mockCreateLoopIntervention = vi.fn();

vi.mock("@/components/consulting/ConsultingEnvProvider", () => ({
  useConsultingEnv: (...args: unknown[]) => mockUseConsultingEnv(...args),
}));

vi.mock("@/lib/cro-api", () => ({
  fetchLoop: (...args: unknown[]) => mockFetchLoop(...args),
  fetchClients: (...args: unknown[]) => mockFetchClients(...args),
  updateLoop: (...args: unknown[]) => mockUpdateLoop(...args),
  createLoopIntervention: (...args: unknown[]) => mockCreateLoopIntervention(...args),
}));

describe("Consulting Loop Intelligence detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConsultingEnv.mockReturnValue({
      businessId: "biz-1",
      ready: true,
      loading: false,
      error: null,
    });

    const loop = {
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
      loop_cost_per_run: 185.35,
      annual_estimated_cost: 2224.2,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      roles: [
        {
          id: "role-1",
          loop_id: "loop-1",
          role_name: "Analyst",
          loaded_hourly_rate: 95,
          active_minutes: 60,
          notes: "Primary owner",
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
        },
      ],
      interventions: [
        {
          id: "int-1",
          loop_id: "loop-1",
          intervention_type: "data_standardize",
          notes: "Standardized intake fields",
          before_snapshot: {
            schema_version: 1,
            captured_at: "2026-03-01T00:00:00Z",
          },
          after_snapshot: null,
          observed_delta_percent: 12,
          created_at: "2026-03-01T00:00:00Z",
          updated_at: "2026-03-01T00:00:00Z",
          loop_metrics: null,
        },
      ],
    };

    mockFetchLoop.mockResolvedValue(loop);
    mockFetchClients.mockResolvedValue([]);
    mockUpdateLoop.mockResolvedValue(loop);
    mockCreateLoopIntervention.mockResolvedValue({
      id: "int-2",
      loop_id: "loop-1",
      intervention_type: "other",
      notes: "test",
      before_snapshot: {},
      after_snapshot: null,
      observed_delta_percent: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
      loop_metrics: null,
    });
  });

  test("renders metrics and submits updates with env/business scoping", async () => {
    const user = userEvent.setup();
    render(<ConsultingLoopDetailPage params={{ envId: "env-1", loopId: "loop-1" }} />);

    expect(await screen.findByText("Monthly Financial Reporting Loop")).toBeInTheDocument();
    expect(screen.getByText("$2K")).toBeInTheDocument();
    expect(screen.getByText("Analyst")).toBeInTheDocument();
    expect(screen.getByText(/schema_version/i)).toBeInTheDocument();

    const frequencyInput = screen.getByLabelText("Frequency Per Year");
    await user.clear(frequencyInput);
    await user.type(frequencyInput, "24");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(mockUpdateLoop).toHaveBeenCalledWith(
        "loop-1",
        "env-1",
        "biz-1",
        expect.objectContaining({ frequency_per_year: 24 }),
      )
    );
  });
});
