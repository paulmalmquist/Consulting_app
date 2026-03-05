import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import ReIntelligencePage from "@/app/lab/env/[envId]/re/intelligence/page";

const mockUseReEnv = vi.fn();
const mockListProperties = vi.fn();
const mockListQuestions = vi.fn();
const mockRefreshSignals = vi.fn();
const mockCreateQuestion = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: (...args: unknown[]) => mockUseReEnv(...args),
}));

vi.mock("@/lib/bos-api", () => ({
  listCreIntelligenceProperties: (...args: unknown[]) => mockListProperties(...args),
  listCreForecastQuestions: (...args: unknown[]) => mockListQuestions(...args),
  refreshCreForecastSignals: (...args: unknown[]) => mockRefreshSignals(...args),
  createCreForecastQuestion: (...args: unknown[]) => mockCreateQuestion(...args),
}));

describe("RE intelligence cockpit page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReEnv.mockReturnValue({
      envId: "env-1",
      businessId: "biz-1",
    });
    mockListProperties.mockResolvedValue([
      {
        property_id: "prop-1",
        env_id: "env-1",
        business_id: "biz-1",
        property_name: "Miami Office Tower",
        address: "100 Brickell Ave",
        city: "Miami",
        state: "FL",
        resolution_confidence: 0.94,
        latest_forecast_target: "value_change_proxy_next_12m",
        latest_prediction: 0.041,
        latest_prediction_at: "2026-03-03T00:00:00Z",
      },
    ]);
    mockListQuestions.mockResolvedValue([
      {
        question_id: "q-1",
        env_id: "env-1",
        business_id: "biz-1",
        text: "Will Miami metro unemployment exceed 5.0% by 2026-12-31?",
        scope: "macro",
        event_date: "2026-12-31",
        resolution_criteria: "BLS metro unemployment.",
        resolution_source: "BLS",
        probability: 0.43,
        method: "ensemble_seed_v1",
        status: "open",
        brier_score: null,
        last_moved_at: "2026-03-03T00:00:00Z",
        created_at: "2026-03-03T00:00:00Z",
      },
    ]);
    mockCreateQuestion.mockResolvedValue(null);
    mockRefreshSignals.mockResolvedValue({
      question: {
        question_id: "q-1",
        env_id: "env-1",
        business_id: "biz-1",
        text: "Will Miami metro unemployment exceed 5.0% by 2026-12-31?",
        scope: "macro",
        event_date: "2026-12-31",
        resolution_criteria: "BLS metro unemployment.",
        resolution_source: "BLS",
        probability: 0.43,
        method: "ensemble_seed_v1",
        status: "open",
        brier_score: null,
        last_moved_at: "2026-03-03T00:00:00Z",
        created_at: "2026-03-03T00:00:00Z",
      },
      signals: [
        {
          signal_source: "internal_model",
          signal_type: "model",
          probability: 0.41,
          weight: 0.65,
          observed_at: "2026-03-03T00:00:00Z",
          metadata_json: {},
        },
      ],
      aggregate_probability: 0.43,
      weights: { internal_model: 0.65 },
      reason_codes: ["brier_weighted_ensemble"],
    });
  });

  test("renders property cards and superforecaster summary", async () => {
    render(<ReIntelligencePage />);

    await waitFor(() =>
      expect(mockListProperties).toHaveBeenCalledWith({ env_id: "env-1" })
    );

    expect(await screen.findByText("Denver MSA Forecast Cockpit")).toBeInTheDocument();
    expect(await screen.findByText("Miami Office Tower")).toBeInTheDocument();
    expect(await screen.findByText("Will Miami metro unemployment exceed 5.0% by 2026-12-31?")).toBeInTheDocument();
    expect(await screen.findByText("Aggregate Probability")).toBeInTheDocument();
    expect(screen.getAllByText("43.0%")).toHaveLength(2);
  });
});
