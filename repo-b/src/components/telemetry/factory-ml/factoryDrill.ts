// Discriminated union of every drillable object on the Factory ML page. Each
// variant carries only fields derivable from the committed JSON exports
// (repo-b/public/labs/factory-ml/*.json) plus the static catalogs — nothing is
// fabricated. The FactoryEvidenceDrawer renders sections by `kind`.

import type {
  NcrCluster,
  ReadinessVehicle,
  RegistryModel,
  RegistryVersion,
} from "@/lib/lab/factoryMlData";

export type DrillObject =
  | {
      kind: "model_metric";
      // headline_metrics key, e.g. "mean_xgbclf_auc"
      metricKey: string;
      value: number;
    }
  | {
      kind: "feature";
      // raw SHAP feature name, e.g. "temperature_p2p_drift_max"
      feature: string;
      impact: number;
      // which model's SHAP list this came from (strength | passfail | run_failure)
      modelKey: string;
      method?: string;
      runId?: string;
    }
  | {
      kind: "model_version";
      model: RegistryModel;
      version: RegistryVersion;
    }
  | {
      kind: "mlflow_run";
      runId: string;
      experiment: string;
      registeredModels: string[];
      headlineMetrics: Record<string, number>;
    }
  | {
      kind: "ncr";
      ncrId: string;
      partId: string;
      disposition: string;
      status: string;
      openedDate: string;
      defectCode: string;
    }
  | {
      kind: "ncr_category";
      cluster: NcrCluster;
    }
  | {
      kind: "vehicle";
      vehicle: ReadinessVehicle;
      isAnchor: boolean;
    };

export type DrillKind = DrillObject["kind"];
