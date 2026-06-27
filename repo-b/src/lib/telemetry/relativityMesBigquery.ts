// Live BigQuery / Unity-Catalog-equivalent deep links for the Relativity MES Sandbox lineage page.
//
// Unlike the Databricks medallion (warehouse billing-blocked, tables not materialized), the BigQuery
// medallion IS materialized: `scripts/relativity_mes_seed/bq_medallion.py` built dataset
// novendor-events-prod.relativity_mes (23 bronze + 23 silver + 5 gold) on serverless BigQuery. So
// these links are LIVE — they resolve to real tables. Same honesty rule: only emit a live href when
// the target exists; the gold tables exist, so they do.

import type { ExternalEvidenceLink } from "@/lib/lab/factoryEvidenceLinks";

export const BQ_PROJECT = "novendor-events-prod";
export const BQ_DATASET = "relativity_mes";

export const BQ_GOLD_TABLES = [
  "gold_rel_build_overview",
  "gold_rel_as_built_genealogy",
  "gold_rel_ncr_traceability",
  "gold_rel_build_cost_rollup",
  "gold_rel_mes_erp_reconciliation",
] as const;

const CONSOLE = "https://console.cloud.google.com/bigquery";

function datasetHref(): string {
  // BigQuery console workspace deep-link to the dataset.
  return `${CONSOLE}?project=${BQ_PROJECT}&ws=!1m4!1m3!3m2!1s${BQ_PROJECT}!2s${BQ_DATASET}`;
}

function tableHref(table: string): string {
  // Workspace deep-link to a specific table; the FQ name is also copyable as a fallback.
  return `${CONSOLE}?project=${BQ_PROJECT}&ws=!1m5!1m4!4m3!1s${BQ_PROJECT}!2s${BQ_DATASET}!3s${table}`;
}

function link(label: string, href: string, copyText: string): ExternalEvidenceLink {
  return { label, kind: "delta_table", href, copyText };
}

/** The BigQuery dataset that holds the materialized medallion (live). */
export function bqDatasetLink(): ExternalEvidenceLink {
  return link(`Open BigQuery dataset ${BQ_DATASET}`, datasetHref(), `${BQ_PROJECT}.${BQ_DATASET}`);
}

/** A live gold Delta-equivalent table in BigQuery. */
export function bqGoldTableLink(table: string): ExternalEvidenceLink {
  return link(table, tableHref(table), `${BQ_PROJECT}.${BQ_DATASET}.${table}`);
}
