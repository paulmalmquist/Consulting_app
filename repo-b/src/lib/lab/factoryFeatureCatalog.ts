// Conservative, inferred definitions for the SHAP feature names exported by the
// rs_factory training run. The committed feature_importance.json carries only
// {feature, impact}; the export has no units or manifest. So every definition
// here is DERIVED FROM THE NAME and marked inferred — never presented as ground
// truth. Unknown names return null and the drawer renders fail-closed.
//
// Follow-up (documented in export_dashboard_json.py): emit a real feature
// manifest with units/source so this catalog can become data-backed.

export type FeatureDef = {
  feature: string;
  // human-readable definition inferred from the name
  definition: string;
  // signal the feature is built from (temperature, pressure, ...), or a category
  signal: string;
  // the statistic / window operation in the name (std_mean, p2p_drift_max, ...)
  statistic: string;
  units: string;
  // always true here — these are name-derived, not manifest-backed
  inferred: true;
  caveat: string;
};

const UNITS_UNKNOWN = "Units unknown — not in the exported feature manifest";
const CAVEAT =
  "Definition inferred from the feature name; deterministic synthetic seed, no physical manifest.";

// Signal tokens that lead a windowed telemetry feature name.
const SIGNALS: Record<string, string> = {
  temperature: "melt-pool / process temperature",
  pressure: "chamber / line pressure",
  flow_rate: "material flow rate",
  vibration_rms: "RMS vibration",
};

// Statistic / window suffixes, longest match first.
const STATISTICS: { suffix: string; describe: (sig: string) => string }[] = [
  { suffix: "p2p_drift_max", describe: (s) => `peak-to-peak drift of ${s}, max over the scoring window` },
  { suffix: "std_late_minus_early", describe: (s) => `late-vs-early change in the standard deviation of ${s}` },
  { suffix: "rolling_std_max", describe: (s) => `max of the rolling standard deviation of ${s}` },
  { suffix: "std_mean", describe: (s) => `mean of the per-window standard deviation of ${s}` },
  { suffix: "slope_mean", describe: (s) => `mean slope (trend) of ${s} across windows` },
];

function decomposeWindowed(feature: string): FeatureDef | null {
  for (const sigToken of Object.keys(SIGNALS)) {
    if (!feature.startsWith(`${sigToken}_`)) continue;
    const rest = feature.slice(sigToken.length + 1);
    const stat = STATISTICS.find((s) => rest === s.suffix);
    if (!stat) continue;
    const signal = SIGNALS[sigToken];
    return {
      feature,
      definition: `${stat.describe(signal)}.`,
      signal,
      statistic: rest,
      units: UNITS_UNKNOWN,
      inferred: true,
      caveat: CAVEAT,
    };
  }
  return null;
}

export function lookupFeature(feature: string): FeatureDef | null {
  if (!feature) return null;

  // One-hot category indicators.
  if (feature.startsWith("part_family_")) {
    const fam = feature.slice("part_family_".length);
    return {
      feature,
      definition: `One-hot indicator: the part belongs to family ${fam}.`,
      signal: "part family (categorical)",
      statistic: "one_hot",
      units: "0 / 1 indicator",
      inferred: true,
      caveat: CAVEAT,
    };
  }
  if (feature.startsWith("test_type_")) {
    const t = feature.slice("test_type_".length);
    return {
      feature,
      definition: `One-hot indicator: the test is of type ${t}.`,
      signal: "test type (categorical)",
      statistic: "one_hot",
      units: "0 / 1 indicator",
      inferred: true,
      caveat: CAVEAT,
    };
  }

  // Explicit count feature.
  if (feature === "limit_violation_count") {
    return {
      feature,
      definition: "Count of process limit violations observed in the run.",
      signal: "limit violations",
      statistic: "count",
      units: "count",
      inferred: true,
      caveat: CAVEAT,
    };
  }

  return decomposeWindowed(feature);
}
