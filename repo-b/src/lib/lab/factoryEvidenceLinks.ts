// Databricks / MLflow deep-link builders for the Factory ML evidence drawer.
//
// Links are live by DEFAULT: the workspace resolves from
// NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL (override) or a committed demo default
// (the owner's own workspace — public exposure is not a concern for this demo).
// A builder returns href=null + unavailableReason + copyText only when the
// resolved workspace is empty OR the specific identifier is missing. We never
// fabricate a link or imply a target exists when its identifier is absent.

// Confirmed across the repo (skills/rs-factory-ml/config/databricks.json,
// telemetry-platform/runs/.../run_manifest.json, *_run_receipt.json).
const DEFAULT_DATABRICKS_WORKSPACE = "https://dbc-2504bec5-b5ab.cloud.databricks.com";
const DATABRICKS_ORG = "7474657239253594";
// rs_factory MLflow experiment that produced the committed run.
const RS_FACTORY_EXPERIMENT_ID = "3740651530987773";

export type ExternalLinkKind =
  | "mlflow_run"
  | "mlflow_experiment"
  | "registered_model"
  | "delta_table"
  | "sql_warehouse";

export type ExternalEvidenceLink = {
  label: string;
  kind: ExternalLinkKind;
  href: string | null;
  copyText?: string | null;
  unavailableReason?: string | null;
};

/** Resolved workspace base URL (no trailing slash), or "" when unconfigured. */
export function resolveWorkspace(): string {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DATABRICKS_WORKSPACE_URL) ||
    DEFAULT_DATABRICKS_WORKSPACE ||
    "";
  return raw.replace(/\/+$/, "");
}

function withOrg(path: string): string {
  return `${resolveWorkspace()}/?o=${DATABRICKS_ORG}#${path}`;
}

function unavailable(
  label: string,
  kind: ExternalLinkKind,
  reason: string,
  copyText?: string | null,
): ExternalEvidenceLink {
  return { label, kind, href: null, unavailableReason: reason, copyText: copyText ?? null };
}

const NO_WORKSPACE = "Databricks workspace URL is not configured for this environment.";

export function mlflowRunLink(runId: string | null | undefined): ExternalEvidenceLink {
  const label = "Open MLflow Run";
  if (!resolveWorkspace()) return unavailable(label, "mlflow_run", NO_WORKSPACE, runId ?? null);
  if (!runId) {
    return unavailable(label, "mlflow_run", "No MLflow run id on this object.", null);
  }
  return {
    label,
    kind: "mlflow_run",
    href: withOrg(`mlflow/experiments/${RS_FACTORY_EXPERIMENT_ID}/runs/${runId}`),
    copyText: runId,
  };
}

export function mlflowExperimentLink(experimentPath?: string | null): ExternalEvidenceLink {
  const label = "Open MLflow Experiment";
  if (!resolveWorkspace()) {
    return unavailable(label, "mlflow_experiment", NO_WORKSPACE, experimentPath ?? null);
  }
  return {
    label,
    kind: "mlflow_experiment",
    href: withOrg(`mlflow/experiments/${RS_FACTORY_EXPERIMENT_ID}`),
    copyText: experimentPath ?? RS_FACTORY_EXPERIMENT_ID,
  };
}

/**
 * Registered model link from a Unity Catalog name like
 * "novendor_1.rs_factory.rs_print_passfail". Falls back to a bare model_key
 * (no dots) -> not enough to locate a UC object, so disabled-with-reason.
 */
export function registeredModelLink(modelName: string | null | undefined): ExternalEvidenceLink {
  const label = "Open Model in Unity Catalog";
  if (!resolveWorkspace()) {
    return unavailable(label, "registered_model", NO_WORKSPACE, modelName ?? null);
  }
  if (!modelName) {
    return unavailable(label, "registered_model", "No registered model name on this object.", null);
  }
  const parts = modelName.split(".");
  if (parts.length !== 3) {
    return unavailable(
      label,
      "registered_model",
      "Model is a seed registry key, not a Unity Catalog object — no UC path to open.",
      modelName,
    );
  }
  const [catalog, schema, name] = parts;
  return {
    label,
    kind: "registered_model",
    href: `${resolveWorkspace()}/explore/data/models/${catalog}/${schema}/${name}?o=${DATABRICKS_ORG}`,
    copyText: modelName,
  };
}

export function deltaTableLink(tableName: string | null | undefined): ExternalEvidenceLink {
  const label = "Open Delta Table";
  if (!resolveWorkspace()) {
    return unavailable(label, "delta_table", NO_WORKSPACE, tableName ?? null);
  }
  if (!tableName) {
    return unavailable(label, "delta_table", "No source table on this object.", null);
  }
  const parts = tableName.split(".");
  if (parts.length !== 3) {
    return unavailable(
      label,
      "delta_table",
      "Table name is not a fully-qualified Unity Catalog path — no UC path to open.",
      tableName,
    );
  }
  const [catalog, schema, name] = parts;
  return {
    label,
    kind: "delta_table",
    href: `${resolveWorkspace()}/explore/data/${catalog}/${schema}/${name}?o=${DATABRICKS_ORG}`,
    copyText: tableName,
  };
}
