// Provider-aware deep-link builders for the telemetry Model Workbench.
//
// The receipt header (and, where present, the live registry row) carries a `provider`:
// databricks | vertex | local_fixture | null. These builders render the right console link per
// provider and reuse the existing fail-closed ExternalEvidenceLink contract (href=null +
// unavailableReason + copyText when an id is missing). null/databricks → the existing Databricks/MLflow
// builders; vertex → GCP console; local_fixture → no external target (copyable id only).
//
// GCP target defaults match the telemetry MLOps pipeline (project novendor-events-prod, us-east4) and
// are overridable via NEXT_PUBLIC_TELEMETRY_GCP_PROJECT / _LOCATION.

import {
  deltaTableLink,
  mlflowRunLink,
  registeredModelLink,
  type ExternalEvidenceLink,
} from "@/lib/lab/factoryEvidenceLinks";

export type LinkProvider = "databricks" | "vertex" | "local_fixture" | string | null | undefined;

const GCP_PROJECT =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TELEMETRY_GCP_PROJECT) || "novendor-events-prod";
const GCP_LOCATION =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_TELEMETRY_GCP_LOCATION) || "us-east4";

// GCP family — a Vertex run, a BigQuery-backed artifact, or a generic GCP-computed receipt all route to
// the GCP console. (Run/model deep links still require a real id; otherwise they fail closed.)
function isGcp(p: LinkProvider): boolean {
  return p === "vertex" || p === "gcp" || p === "bigquery";
}

function fixtureOnly(label: string, copyText?: string | null): ExternalEvidenceLink {
  return {
    label,
    kind: "mlflow_run",
    href: null,
    unavailableReason: "Seeded local fixture — no external run to open until the GCP artifact lands.",
    copyText: copyText ?? null,
  };
}

// ── Run (experiment run) ───────────────────────────────────────────────────────
export function cloudRunLink(opts: {
  provider?: LinkProvider; runId?: string | null; experimentId?: string | null;
}): ExternalEvidenceLink {
  const { provider, runId, experimentId } = opts;
  if (isGcp(provider)) {
    const label = "Open Vertex run";
    if (!runId) return { label, kind: "mlflow_run", href: null, unavailableReason: "No Vertex run id on this object.", copyText: null };
    const exp = experimentId ?? "";
    const href = exp
      ? `https://console.cloud.google.com/vertex-ai/experiments/locations/${GCP_LOCATION}/experiments/${exp}/runs/${runId}?project=${GCP_PROJECT}`
      : `https://console.cloud.google.com/vertex-ai/experiments?project=${GCP_PROJECT}`;
    return { label, kind: "mlflow_run", href, copyText: runId };
  }
  if (provider === "local_fixture") return fixtureOnly("Open run", runId);
  return mlflowRunLink(runId); // databricks / null
}

// ── Registered model ───────────────────────────────────────────────────────────
export function cloudModelLink(opts: {
  provider?: LinkProvider; modelId?: string | null; modelName?: string | null;
}): ExternalEvidenceLink {
  const { provider, modelId, modelName } = opts;
  if (isGcp(provider)) {
    const label = "Open Vertex model";
    if (!modelId) return { label, kind: "registered_model", href: null, unavailableReason: "No Vertex model id on this object.", copyText: null };
    return {
      label,
      kind: "registered_model",
      href: `https://console.cloud.google.com/vertex-ai/models/locations/${GCP_LOCATION}/models/${modelId}?project=${GCP_PROJECT}`,
      copyText: modelId,
    };
  }
  if (provider === "local_fixture") return fixtureOnly("Open model", modelId ?? modelName);
  return registeredModelLink(modelName); // databricks / null
}

// ── Feature / source table ─────────────────────────────────────────────────────
export function cloudTableLink(opts: { provider?: LinkProvider; table?: string | null }): ExternalEvidenceLink {
  const { provider, table } = opts;
  if (isGcp(provider)) {
    const label = "Open BigQuery table";
    if (!table) return { label, kind: "delta_table", href: null, unavailableReason: "No source table on this object.", copyText: null };
    // table is "project.dataset.table" or "dataset.table".
    const parts = table.split(".");
    const [proj, dataset, name] = parts.length === 3 ? parts : [GCP_PROJECT, parts[0], parts[1]];
    if (!dataset || !name) return { label, kind: "delta_table", href: null, unavailableReason: "Table is not a qualified BigQuery path.", copyText: table };
    return {
      label,
      kind: "delta_table",
      href: `https://console.cloud.google.com/bigquery?project=${proj}&ws=!1m5!1m4!4m3!1s${proj}!2s${dataset}!3s${name}`,
      copyText: table,
    };
  }
  if (provider === "local_fixture") return fixtureOnly("Open table", table);
  return deltaTableLink(table); // databricks / null
}
