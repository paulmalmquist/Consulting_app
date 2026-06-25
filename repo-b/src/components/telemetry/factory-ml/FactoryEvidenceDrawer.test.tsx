import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FactoryEvidenceDrawer from "./FactoryEvidenceDrawer";
import type { DrillObject } from "./factoryDrill";
import type { RegistryModel, RegistryVersion } from "@/lib/lab/factoryMlData";

function show(drill: DrillObject) {
  return render(<FactoryEvidenceDrawer drill={drill} onClose={() => {}} />);
}

describe("FactoryEvidenceDrawer", () => {
  it("renders nothing when drill is null", () => {
    render(<FactoryEvidenceDrawer drill={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an honest weak-metric interpretation for near-random AUC", () => {
    show({ kind: "model_metric", metricKey: "mean_xgbclf_auc", value: 0.5148 });
    expect(screen.getByText(/near-random ranking signal/i)).toBeTruthy();
    expect(screen.getByText(/Deterministic synthetic eval for demo; not a trained artifact\./)).toBeTruthy();
    expect(screen.getByText(/Informational only/i)).toBeTruthy();
  });

  it("renders an inferred feature definition with a units-unknown marker", () => {
    show({ kind: "feature", feature: "temperature_p2p_drift_max", impact: 0.33, modelKey: "passfail", method: "shap_tree_explainer", runId: "run123" });
    expect(screen.getByText(/peak-to-peak drift/i)).toBeTruthy();
    expect(screen.getByText(/units unknown/i)).toBeTruthy();
  });

  it("renders Unavailable for a feature with no catalog entry", () => {
    show({ kind: "feature", feature: "mystery_feature", impact: 0.1, modelKey: "passfail" });
    expect(screen.getByText(/no definition for this feature name/i)).toBeTruthy();
  });

  it("shows a live MLflow run deep link by default", () => {
    show({
      kind: "mlflow_run",
      runId: "9c25866d78184746a2a0ae28526009bf",
      experiment: "/Users/x/RSFactoryML",
      registeredModels: ["novendor_1.rs_factory.rs_print_passfail"],
      headlineMetrics: { mean_xgbclf_auc: 0.5148 },
    });
    const link = screen.getByText(/Open MLflow Run/i).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toContain("#mlflow/experiments/3740651530987773/runs/");
  });

  it("derives why-champion / why-not-champion for a registry version", () => {
    const v4: RegistryVersion = { version: 4, stage: "champion", is_champion: true, primary_metric: "pr_auc", primary_metric_value: 0.84, eval_metrics: { pr_auc: 0.84 }, training_rows: 9066, model_card_summary: "Champion." };
    const v1: RegistryVersion = { version: 1, stage: "archived", is_champion: false, primary_metric: "pr_auc", primary_metric_value: 0.795, eval_metrics: { pr_auc: 0.795 }, training_rows: 5231, model_card_summary: "Archived." };
    const model: RegistryModel = { model_key: "defect_risk", champion: v4, versions: [v1, v4] };

    show({ kind: "model_version", model, version: v1 });
    expect(screen.getByText(/superseded by champion v4/i)).toBeTruthy();
    expect(screen.getByText(/no separate human approval record/i)).toBeTruthy();
  });

  it("lists vehicle blockers and the operational-use line", () => {
    show({
      kind: "vehicle",
      isAnchor: true,
      vehicle: {
        vehicle_id: "VEH-TR-003", vehicle_name: "Terran R VEH-TR-003", target_launch_date: "2026-07-11",
        status: "yellow", readiness_score: 0.58, open_ncrs: 43, scenario_open_ncrs: 4,
        inconclusive_tests: 11, unresolved_anomalies: 1, missing_signoffs: 2,
      },
    });
    expect(screen.getByText(/4 blocking NCRs must close/i)).toBeTruthy();
    expect(screen.getByText(/Readiness hold \/ release review/i)).toBeTruthy();
  });
});
