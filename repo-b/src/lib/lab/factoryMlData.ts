"use client";

// Typed contracts for the committed factory-ml exports
// (repo-b/public/labs/factory-ml/*.json, written by
// skills/rs-factory-ml/scripts/export_dashboard_json.py) plus a small loader
// hook. Static JSON on purpose: the seed is deterministic, so the data diffs
// in review; live Databricks serving is a documented follow-up.

import { useEffect, useState } from "react";

export type ReadinessVehicle = {
  vehicle_id: string;
  vehicle_name: string;
  target_launch_date: string;
  status: string;
  readiness_score: number;
  open_ncrs: number;
  scenario_open_ncrs: number;
  inconclusive_tests: number;
  unresolved_anomalies: number;
  missing_signoffs: number;
};

export type ReadinessExport = { anchor_vehicle: string; vehicles: ReadinessVehicle[] };

export type HeatmapRun = {
  run_id: string;
  pattern: string;
  scenario_id: string | null;
  cells: { w: number; z: number }[];
};
export type HeatmapExport = { anchor_pair: string[]; runs: HeatmapRun[] };

export type Driver = { feature: string; impact: number };
export type ImportanceExport = {
  run_id: string;
  drivers: { strength?: Driver[]; passfail?: Driver[]; run_failure?: Driver[] };
  driver_methods?: Record<string, string>;
  headline_metrics: Record<string, number>;
  params: Record<string, string>;
};

export type RegistryVersion = {
  version: number;
  stage: string;
  is_champion: boolean;
  primary_metric: string;
  primary_metric_value: number;
  eval_metrics: Record<string, number>;
  training_rows: number;
  model_card_summary: string | null;
};
export type RegistryModel = {
  model_key: string;
  champion?: RegistryVersion;
  versions: RegistryVersion[];
};
export type RegistryExport = {
  seed_registry: RegistryModel[];
  live_mlflow_run: {
    run_id: string;
    experiment: string;
    registered_models: string[];
    headline_metrics: Record<string, number>;
  };
};

export type NcrCluster = {
  defect_code: string;
  n: number;
  open_n: number;
  avg_age_days: number;
  trend: { month: string; n: number }[];
  exemplars: { ncr_id: string; part_id: string; disposition: string; status: string; opened_date: string }[];
};
export type NcrExport = { clusters: NcrCluster[] };

export type MetadataExport = {
  mlflow_run_id: string;
  mlflow_experiment: string;
  seed_build_sha: string;
  schema: string;
  row_counts: Record<string, number>;
  target_note: string;
};

export type FactoryMlData = {
  readiness?: ReadinessExport;
  heatmap?: HeatmapExport;
  importance?: ImportanceExport;
  registry?: RegistryExport;
  ncr?: NcrExport;
  metadata?: MetadataExport;
};

const FILES: [keyof FactoryMlData, string][] = [
  ["readiness", "readiness.json"],
  ["heatmap", "layer_heatmap.json"],
  ["importance", "feature_importance.json"],
  ["registry", "model_registry.json"],
  ["ncr", "ncr_clusters.json"],
  ["metadata", "train_metadata.json"],
];

export function useFactoryMlData(): { data: FactoryMlData; loading: boolean; missing: string[] } {
  const [data, setData] = useState<FactoryMlData>({});
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded: FactoryMlData = {};
      const absent: string[] = [];
      await Promise.all(FILES.map(async ([key, file]) => {
        try {
          const res = await fetch(`/labs/factory-ml/${file}`);
          if (!res.ok) throw new Error(String(res.status));
          (loaded as Record<string, unknown>)[key] = await res.json();
        } catch {
          absent.push(file);
        }
      }));
      if (!cancelled) {
        setData(loaded);
        setMissing(absent);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, loading, missing };
}
