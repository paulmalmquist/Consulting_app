import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PredictionMarketPulse } from "./PredictionMarketPulse";
import type {
  PolymarketPulseItem,
  PolymarketPulseResponse,
} from "@/lib/historyrhymes/client";

const baseItem: PolymarketPulseItem = {
  market_id: "market-1",
  question: "Will CPI year-over-year be above 3% by December 2026?",
  as_of: "2026-06-14T12:00:00Z",
  yes_probability: 0.7,
  price_basis: "yes_orderbook_midpoint",
  probability_change_5m: 0.01,
  probability_change_1h: 0.05,
  probability_change_24h: 0.08,
  liquidity_confidence: 0.82,
  shock_score: 0.4,
  connection_stale: false,
  market_stale: false,
  thin_liquidity_flag: false,
  ambiguity_flag: false,
  p_hr: 0.48,
  signed_divergence: 0.22,
  forecast_status: "research",
  forecast_null_reason: null,
  model_version: "hr-analog-beta-v1",
  null_reason: null,
  status: "RESEARCH",
};

function response(items: PolymarketPulseItem[]): PolymarketPulseResponse {
  return {
    ok: true,
    source: "polymarket",
    as_of: "2026-06-14T12:00:00Z",
    stale: false,
    null_reason: null,
    provenance: {},
    price_basis: ["yes_orderbook_midpoint"],
    forecast_status: ["research"],
    items,
  };
}

describe("PredictionMarketPulse", () => {
  it("renders market probability, HR probability, divergence, liquidity, and research status", () => {
    render(<PredictionMarketPulse pulse={response([baseItem])} />);
    expect(screen.getByText("Prediction Market Pulse")).toBeTruthy();
    expect(screen.getByText("70%")).toBeTruthy();
    expect(screen.getByText("48%")).toBeTruthy();
    expect(screen.getByText("+22.0 pts")).toBeTruthy();
    expect(screen.getByText("82%")).toBeTruthy();
    expect(screen.getByText("RESEARCH")).toBeTruthy();
  });

  it("never labels stale data live", () => {
    render(
      <PredictionMarketPulse
        pulse={response([
          {
            ...baseItem,
            connection_stale: true,
            status: "STALE",
          },
        ])}
      />,
    );
    const card = screen.getByTestId("prediction-market-card");
    expect(card.getAttribute("data-status")).toBe("STALE");
    expect(screen.queryByText("LIVE")).toBeNull();
  });

  it("renders crowd-only unsupported markets without inventing an HR probability", () => {
    render(
      <PredictionMarketPulse
        pulse={response([
          {
            ...baseItem,
            p_hr: null,
            signed_divergence: null,
            forecast_status: "unsupported",
            forecast_null_reason: "unsupported_question_family",
            status: "UNSUPPORTED",
          },
        ])}
      />,
    );
    expect(screen.getByText("UNSUPPORTED")).toBeTruthy();
    expect(screen.getAllByText("N/A")).toHaveLength(2);
    expect(screen.getByText(/unsupported question family/i)).toBeTruthy();
  });

  it("renders an explicit disabled or unavailable empty state", () => {
    render(
      <PredictionMarketPulse
        pulse={{
          ...response([]),
          ok: false,
          stale: true,
          null_reason: "polymarket_disabled",
        }}
      />,
    );
    expect(screen.getByText("Not available")).toBeTruthy();
    expect(screen.getByText("polymarket disabled")).toBeTruthy();
  });
});
