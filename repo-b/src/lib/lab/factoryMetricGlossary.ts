// Honest interpretation of the rs_factory headline metrics. The job here is to
// EXPLAIN each metric and flag weak evidence — never to soften it. The verbatim
// synthetic-eval disclaimer is preserved byte-for-byte.

export const SYNTHETIC_EVAL_NOTE =
  "Deterministic synthetic eval for demo; not a trained artifact.";

export const GROUPKFOLD_NOTE = "GroupKFold(part_id) mean";

export type MetricInterpretation = {
  // the metric family/definition
  definition: string;
  // which model family + target the metric scores
  target: string;
  // whether this metric drives champion promotion (the seed promotes on pr_auc)
  usedForPromotion: boolean;
  // honest weak-evidence flag, when the value warrants it
  weakBand?: string;
};

// Map a headline_metrics key -> {modelFamily, metric, target}.
function parseKey(key: string): { metric: string; family: string; target: string } {
  const k = key.replace(/^mean_/, "");
  // families: lr (logistic baseline), ridge (ridge baseline), xgbclf (pass/fail),
  // xgbreg (strength regressor), xgbrun (run-failure classifier)
  const families: Record<string, { family: string; target: string }> = {
    lr: { family: "logistic-regression baseline", target: "pass / fail" },
    ridge: { family: "ridge baseline", target: "strength margin" },
    xgbclf: { family: "XGBoost classifier", target: "pass / fail" },
    xgbreg: { family: "XGBoost regressor", target: "strength margin" },
    xgbrun: { family: "XGBoost classifier", target: "run failure" },
  };
  const prefix = Object.keys(families).find((p) => k.startsWith(`${p}_`));
  const metric = prefix ? k.slice(prefix.length + 1) : k;
  const fam = prefix ? families[prefix] : { family: "model", target: "outcome" };
  return { metric, family: fam.family, target: fam.target };
}

const METRIC_DEFS: Record<string, string> = {
  auc: "Area under the ROC curve — ranking quality. 0.5 is random, 1.0 is perfect.",
  pr_auc: "Area under the precision–recall curve — ranking quality on the positive (rare) class.",
  brier: "Brier score — mean squared error of predicted probabilities. Lower is better; 0 is perfect.",
  mae: "Mean absolute error of the predicted value. Lower is better.",
  r2: "Coefficient of determination. 1.0 is perfect; 0 ties a mean baseline; negative is worse than the mean.",
};

function weakBand(metric: string, value: number): string | undefined {
  if (metric === "auc" || metric === "pr_auc") {
    if (value < 0.6) {
      return "Weak model evidence — near-random ranking signal without stronger slice/threshold evidence.";
    }
    return undefined;
  }
  if (metric === "r2") {
    if (value < 0) return "Negative R² — worse than predicting the mean.";
    return undefined;
  }
  if (metric === "brier") {
    if (value > 0.25) return "Poorly calibrated — probabilities carry little reliable information.";
    return undefined;
  }
  return undefined;
}

export function interpretMetric(key: string, value: number): MetricInterpretation {
  const { metric, family, target } = parseKey(key);
  return {
    definition: METRIC_DEFS[metric] ?? `${metric} for the ${family}.`,
    target: `${family} — ${target}`,
    // the seed registry promotes the champion on pr_auc
    usedForPromotion: metric === "pr_auc",
    weakBand: weakBand(metric, value),
  };
}
