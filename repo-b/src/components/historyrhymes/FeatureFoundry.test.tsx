import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureReadinessBadge } from "./FeatureReadinessBadge";
import { FeatureQualityBoard } from "./FeatureQualityBoard";
import type { QualityBoard } from "@/lib/historyrhymes/featureStore";

describe("FeatureReadinessBadge", () => {
  it("shows a blocked/red badge with the leakage reason when score is 0", () => {
    render(
      <FeatureReadinessBadge readiness={{ score: 0, degrade_reasons: ["leakage_blocked:not_available_at_prediction_time"] }} />,
    );
    const badge = screen.getByTestId("hr-feature-readiness");
    expect(badge.textContent).toContain("blocked");
    expect(badge.textContent).toContain("leakage_blocked");
  });

  it("shows a healthy score without degrade reasons", () => {
    render(<FeatureReadinessBadge readiness={{ score: 1, degrade_reasons: [] }} />);
    expect(screen.getByTestId("hr-feature-readiness").textContent).toContain("1.00");
  });
});

describe("FeatureQualityBoard", () => {
  const board: QualityBoard = {
    dimensions: ["freshness"],
    families: ["leakage_guard", "missingness_as_signal"],
    grid: {},
    features: [
      {
        feature_id: "resolved_trap_label", family: "leakage_guard", freshness_status: "fresh",
        missingness_rate: 0, drift_status: "normal", leakage_risk: "high", leakage_blocked: true,
        lineage_present: true, models_using_count: 0, readiness_score: 0, readiness_degrade_reasons: [],
      },
      {
        feature_id: "btc_mvrv_missing_flag", family: "missingness_as_signal", freshness_status: "fresh",
        missingness_rate: 0.02, drift_status: "normal", leakage_risk: "low", leakage_blocked: false,
        lineage_present: true, models_using_count: 2, readiness_score: 1, readiness_degrade_reasons: [],
      },
    ],
  };

  it("renders rows and surfaces leakage-blocked + missingness states", () => {
    render(<FeatureQualityBoard board={board} />);
    const table = screen.getByTestId("hr-feature-quality-board");
    expect(table.textContent).toContain("resolved_trap_label");
    expect(table.textContent).toContain("blocked");
    expect(table.textContent).toContain("btc_mvrv_missing_flag");
    expect(table.textContent).toContain("0.02");
  });
});
