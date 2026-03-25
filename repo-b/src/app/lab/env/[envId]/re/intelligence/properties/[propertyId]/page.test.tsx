import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReIntelligencePropertyPage from "@/app/lab/env/[envId]/re/intelligence/properties/[propertyId]/page";

const mockUseReEnv = vi.fn();
const mockGetProperty = vi.fn();
const mockGetExternalities = vi.fn();
const mockGetFeatures = vi.fn();
const mockMaterializeForecasts = vi.fn();

vi.mock("@/components/repe/workspace/ReEnvProvider", () => ({
  useReEnv: (...args: unknown[]) => mockUseReEnv(...args),
}));

vi.mock("@/lib/bos-api", () => ({
  getCreIntelligenceProperty: (...args: unknown[]) => mockGetProperty(...args),
  getCreIntelligenceExternalities: (...args: unknown[]) => mockGetExternalities(...args),
  getCreIntelligenceFeatures: (...args: unknown[]) => mockGetFeatures(...args),
  materializeCreForecasts: (...args: unknown[]) => mockMaterializeForecasts(...args),
}));

describe("RE intelligence property page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReEnv.mockReturnValue({ envId: "env-1" });
    mockGetProperty
      .mockResolvedValueOnce({
        property: {
          property_id: "prop-1",
          env_id: "env-1",
          business_id: "biz-1",
          property_name: "Miami Office Tower",
          address: "100 Brickell Ave",
          city: "Miami",
          state: "FL",
          postal_code: "33131",
          lat: 25.765,
          lon: -80.193,
          land_use: "office",
          size_sqft: 250000,
          year_built: 2014,
          resolution_confidence: 0.94,
          latest_forecast_id: null,
          latest_forecast_target: null,
          latest_prediction: null,
          latest_prediction_low: null,
          latest_prediction_high: null,
          latest_prediction_at: null,
        },
        source_provenance: { source: "re_pipeline_property" },
        parcels: [],
        buildings: [],
        linked_geographies: [],
        linked_entities: [],
        latest_forecasts: [],
      })
      .mockResolvedValueOnce({
        property: {
          property_id: "prop-1",
          env_id: "env-1",
          business_id: "biz-1",
          property_name: "Miami Office Tower",
          address: "100 Brickell Ave",
          city: "Miami",
          state: "FL",
          postal_code: "33131",
          lat: 25.765,
          lon: -80.193,
          land_use: "office",
          size_sqft: 250000,
          year_built: 2014,
          resolution_confidence: 0.94,
          latest_forecast_id: "fc-1",
          latest_forecast_target: "rent_growth_next_12m",
          latest_prediction: 0.044,
          latest_prediction_low: 0.03,
          latest_prediction_high: 0.058,
          latest_prediction_at: "2026-03-03T00:00:00Z",
        },
        source_provenance: { source: "re_pipeline_property" },
        parcels: [],
        buildings: [],
        linked_geographies: [],
        linked_entities: [],
        latest_forecasts: [
          {
            forecast_id: "fc-1",
            env_id: "env-1",
            business_id: "biz-1",
            scope: "property",
            entity_id: "prop-1",
            target: "rent_growth_next_12m",
            horizon: "12m",
            model_version: "elastic_net_seed_v1",
            prediction: 0.044,
            lower_bound: 0.03,
            upper_bound: 0.058,
            baseline_prediction: 0.025,
            status: "materialized",
            intervals: { p10: 0.03, p50: 0.044, p90: 0.058 },
            explanation_ptr: "cre-intel/explanations/fc-1.json",
            explanation_json: { top_drivers: [{ feature_key: "median_income" }] },
            source_vintages: [],
            generated_at: "2026-03-03T00:00:00Z",
          },
        ],
      });
    mockGetExternalities.mockResolvedValue({
      property_id: "prop-1",
      period: "2025-12-31",
      macro: [],
      housing: [],
      hazard: [],
      policy: [],
    });
    mockGetFeatures.mockResolvedValue([
      {
        feature_id: "feat-1",
        entity_scope: "property",
        entity_id: "prop-1",
        period: "2025-12-31",
        feature_key: "median_income",
        value: 68250,
        version: "miami_mvp_v1",
        lineage_json: {},
        created_at: "2026-03-03T00:00:00Z",
      },
    ]);
    mockMaterializeForecasts.mockResolvedValue([]);
  });

  test("loads detail and refreshes forecasts after materialization", async () => {
    const user = userEvent.setup();

    render(<ReIntelligencePropertyPage params={{ envId: "env-1", propertyId: "prop-1" }} />);

    expect(await screen.findByText("Miami Office Tower")).toBeInTheDocument();
    expect(await screen.findByText("Data Card")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Materialize Forecasts" }));

    await waitFor(() =>
      expect(mockMaterializeForecasts).toHaveBeenCalledWith({
        scope: "property",
        entity_ids: ["prop-1"],
        targets: [
          "rent_growth_next_12m",
          "value_change_proxy_next_12m",
          "refi_risk_score",
          "distress_probability",
        ],
      })
    );

    expect(await screen.findByText("rent_growth_next_12m")).toBeInTheDocument();
  });
});
