import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import OpportunityEnginePage from "@/app/lab/env/[envId]/opportunity-engine/page";

const mockUseDomainEnv = vi.fn();
const mockGetDashboard = vi.fn();
const mockListRecommendations = vi.fn();
const mockListSignals = vi.fn();
const mockListRuns = vi.fn();
const mockGetRecommendationDetail = vi.fn();
const mockCreateOpportunityRun = vi.fn();

vi.mock("@/components/domain/DomainEnvProvider", () => ({
  useDomainEnv: (...args: unknown[]) => mockUseDomainEnv(...args),
}));

vi.mock("@/lib/bos-api", () => ({
  getOpportunityDashboard: (...args: unknown[]) => mockGetDashboard(...args),
  listOpportunityRecommendations: (...args: unknown[]) => mockListRecommendations(...args),
  listOpportunitySignals: (...args: unknown[]) => mockListSignals(...args),
  listOpportunityRuns: (...args: unknown[]) => mockListRuns(...args),
  getOpportunityRecommendationDetail: (...args: unknown[]) => mockGetRecommendationDetail(...args),
  createOpportunityRun: (...args: unknown[]) => mockCreateOpportunityRun(...args),
}));

describe("Opportunity Engine page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDomainEnv.mockReturnValue({
      envId: "env-1",
      businessId: "biz-1",
    });
    mockGetDashboard.mockResolvedValue({
      latest_run: null,
      recommendation_counts: { consulting: 1, market_intel: 1 },
      top_recommendations: [],
      top_signals: [],
      run_history: [],
    });
    mockListRecommendations.mockResolvedValue([
      {
        recommendation_id: "rec-1",
        run_id: "run-1",
        opportunity_score_id: "score-1",
        business_line: "consulting",
        entity_type: "crm_opportunity",
        entity_id: "opp-1",
        entity_key: "opp-1",
        recommendation_type: "pipeline_action",
        title: "Advance Acme opportunity",
        summary: "High-probability consulting motion.",
        suggested_action: "Prepare sponsor brief.",
        action_owner: "consulting_operator",
        priority: "high",
        sector: "construction",
        geography: null,
        confidence: 0.81,
        why_json: {},
        driver_summary: "Lead Score, Stage Probability",
        created_at: "2026-03-09T00:00:00Z",
        updated_at: "2026-03-09T00:00:00Z",
        score: 88.4,
        probability: 0.81,
        expected_value: 96000,
        rank_position: 1,
        model_version: "opportunity_engine_v1",
        fallback_mode: null,
      },
    ]);
    mockListSignals.mockResolvedValue([
      {
        market_signal_id: "sig-1",
        run_id: "run-1",
        signal_source: "kalshi_markets",
        source_market_id: "KAL-RATES",
        signal_key: "kalshi_markets:KAL-RATES:rates_easing",
        signal_name: "Will the Fed cut rates by September 2026?",
        canonical_topic: "rates_easing",
        business_line: "market_intel",
        sector: "macro",
        geography: "United States",
        signal_direction: "bullish",
        probability: 0.63,
        signal_strength: 0.26,
        confidence: 0.68,
        observed_at: "2026-03-09T00:00:00Z",
        expires_at: null,
        metadata_json: {},
        explanation_json: {},
        created_at: "2026-03-09T00:00:00Z",
      },
    ]);
    mockListRuns.mockResolvedValue([
      {
        run_id: "run-1",
        env_id: "env-1",
        business_id: "biz-1",
        run_type: "manual",
        mode: "fixture",
        model_version: "opportunity_engine_v1",
        status: "success",
        business_lines: ["consulting", "market_intel"],
        triggered_by: "tester",
        input_hash: "hash",
        parameters_json: {},
        metrics_json: {},
        error_summary: null,
        started_at: "2026-03-09T00:00:00Z",
        finished_at: "2026-03-09T00:00:05Z",
        created_at: "2026-03-09T00:00:00Z",
        updated_at: "2026-03-09T00:00:05Z",
      },
    ]);
    mockGetRecommendationDetail.mockResolvedValue({
      recommendation_id: "rec-1",
      run_id: "run-1",
      opportunity_score_id: "score-1",
      business_line: "consulting",
      entity_type: "crm_opportunity",
      entity_id: "opp-1",
      entity_key: "opp-1",
      recommendation_type: "pipeline_action",
      title: "Advance Acme opportunity",
      summary: "High-probability consulting motion.",
      suggested_action: "Prepare sponsor brief.",
      action_owner: "consulting_operator",
      priority: "high",
      sector: "construction",
      geography: null,
      confidence: 0.81,
      why_json: {},
      driver_summary: "Lead Score, Stage Probability",
      created_at: "2026-03-09T00:00:00Z",
      updated_at: "2026-03-09T00:00:00Z",
      score: 88.4,
      probability: 0.81,
      expected_value: 96000,
      rank_position: 1,
      model_version: "opportunity_engine_v1",
      fallback_mode: null,
      drivers: [
        {
          driver_key: "lead_score",
          driver_label: "Lead Score",
          driver_value: 0.84,
          contribution_score: 0.22,
          rank_position: 1,
          explanation_text: "Lead Score contributed to the score.",
        },
      ],
      score_history: [{ as_of_date: "2026-03-09", score: 88.4, probability: 0.81 }],
      linked_signals: [],
      linked_forecasts: [],
    });
    mockCreateOpportunityRun.mockResolvedValue({
      run_id: "run-2",
      env_id: "env-1",
      business_id: "biz-1",
      run_type: "manual",
      mode: "fixture",
      model_version: "opportunity_engine_v1",
      status: "success",
      business_lines: ["consulting", "pds", "re_investment", "market_intel"],
      triggered_by: "opportunity-engine-ui",
      input_hash: "hash",
      parameters_json: {},
      metrics_json: {},
      error_summary: null,
      started_at: "2026-03-09T00:00:00Z",
      finished_at: "2026-03-09T00:00:05Z",
      created_at: "2026-03-09T00:00:00Z",
      updated_at: "2026-03-09T00:00:05Z",
    });
  });

  test("renders recommendations and signal cards", async () => {
    render(<OpportunityEnginePage />);

    await waitFor(() =>
      expect(mockListRecommendations).toHaveBeenCalledWith({
        env_id: "env-1",
        business_id: "biz-1",
        business_line: undefined,
        sector: undefined,
        geography: undefined,
        as_of_date: undefined,
        limit: 20,
      })
    );

    expect(await screen.findByText("Ranked project and market recommendations")).toBeInTheDocument();
    expect(await screen.findByText("Advance Acme opportunity")).toBeInTheDocument();
    expect(await screen.findByText("Will the Fed cut rates by September 2026?")).toBeInTheDocument();
    expect(screen.getByTestId("opportunity-run-history")).toBeInTheDocument();
  });
});
