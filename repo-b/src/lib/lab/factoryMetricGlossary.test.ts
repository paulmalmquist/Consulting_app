import { describe, expect, it } from "vitest";
import { SYNTHETIC_EVAL_NOTE, interpretMetric } from "./factoryMetricGlossary";

describe("factoryMetricGlossary", () => {
  it("flags near-random AUC as weak evidence", () => {
    const i = interpretMetric("mean_xgbclf_auc", 0.5148);
    expect(i.weakBand).toMatch(/near-random/i);
    expect(i.target).toMatch(/pass \/ fail/i);
  });

  it("does not flag a healthy AUC", () => {
    expect(interpretMetric("mean_xgbrun_auc", 0.9775).weakBand).toBeUndefined();
  });

  it("flags negative R²", () => {
    expect(interpretMetric("mean_xgbreg_r2", -0.1152).weakBand).toMatch(/negative/i);
  });

  it("flags a poorly calibrated Brier score", () => {
    expect(interpretMetric("mean_xgbclf_brier", 0.3136).weakBand).toMatch(/calibrat/i);
  });

  it("marks pr_auc as the promotion metric", () => {
    expect(interpretMetric("mean_xgbclf_pr_auc", 0.6265).usedForPromotion).toBe(true);
    expect(interpretMetric("mean_xgbclf_auc", 0.5148).usedForPromotion).toBe(false);
  });

  it("keeps the synthetic-eval disclaimer byte-identical", () => {
    expect(SYNTHETIC_EVAL_NOTE).toBe(
      "Deterministic synthetic eval for demo; not a trained artifact.",
    );
  });
});
