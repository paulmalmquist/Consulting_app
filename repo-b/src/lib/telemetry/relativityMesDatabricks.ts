// Honest Databricks / Unity Catalog deep links for the Relativity MES Sandbox lineage page.
//
// Built on the same workspace resolver as the Factory ML links (resolveWorkspace() ->
// dbc-2504bec5-b5ab, org 7474657239253594). The honesty rule mirrors factoryEvidenceLinks: a link is
// live ONLY when its target actually exists. The catalog (novendor_1) and the workspace exist now, so
// those are live. The medallion schema (novendor_1.relativity_mes) and the gold_rel_* Delta tables are
// materialized only when the medallion runs — until then `serving_provenance` is 'seed-bootstrap' and
// these links render FAIL-CLOSED (disabled + reason + a copy chip of the UC path). They auto-upgrade
// to live ↗ anchors the moment serving flips to 'databricks-gold'. We never link to a table that does
// not exist yet.

import { resolveWorkspace, type ExternalEvidenceLink } from "@/lib/lab/factoryEvidenceLinks";

const ORG = "7474657239253594";
export const REL_CATALOG = "novendor_1";
export const REL_SCHEMA = "relativity_mes";

// The five flat serving marts -> their Databricks gold Delta tables.
export const REL_GOLD_TABLES = [
  "rel_build_overview",
  "rel_as_built_genealogy",
  "rel_ncr_traceability",
  "rel_build_cost_rollup",
  "rel_mes_erp_reconciliation",
] as const;

const NOT_MATERIALIZED =
  "Medallion not materialized yet (serverless warehouse health=FAILED). This becomes a live link once " +
  "the medallion runs and serving_provenance flips to databricks-gold.";
const NO_WORKSPACE = "Databricks workspace URL is not configured for this environment.";

function ucExploreHref(path: string): string | null {
  const ws = resolveWorkspace();
  return ws ? `${ws}/explore/data/${path}?o=${ORG}` : null;
}

function link(label: string, href: string | null, copyText: string, reason?: string): ExternalEvidenceLink {
  return { label, kind: "delta_table", href, copyText, unavailableReason: href ? null : reason ?? NO_WORKSPACE };
}

/** Databricks workspace home (always exists when configured). */
export function workspaceLink(): ExternalEvidenceLink {
  const ws = resolveWorkspace();
  return link("Open Databricks workspace", ws ? `${ws}/?o=${ORG}` : null, ws || REL_CATALOG);
}

/** Unity Catalog `novendor_1` (exists now — the telemetry catalog that governs serving + medallion). */
export function catalogLink(): ExternalEvidenceLink {
  return link(`Open catalog ${REL_CATALOG} in Unity Catalog`, ucExploreHref(REL_CATALOG), REL_CATALOG);
}

/** Schema `novendor_1.relativity_mes` — created by the medallion; fail-closed until it runs. */
export function schemaLink(dbxLive: boolean): ExternalEvidenceLink {
  const uc = `${REL_CATALOG}.${REL_SCHEMA}`;
  if (!dbxLive) return link(`Open schema ${uc}`, null, uc, NOT_MATERIALIZED);
  return link(`Open schema ${uc}`, ucExploreHref(`${REL_CATALOG}/${REL_SCHEMA}`), uc);
}

/** Gold Delta table `novendor_1.relativity_mes.gold_<servingTable>`; fail-closed until the medallion runs. */
export function goldTableLink(servingTable: string, dbxLive: boolean): ExternalEvidenceLink {
  const tbl = `gold_${servingTable}`;
  const uc = `${REL_CATALOG}.${REL_SCHEMA}.${tbl}`;
  if (!dbxLive) return link(tbl, null, uc, NOT_MATERIALIZED);
  return link(tbl, ucExploreHref(`${REL_CATALOG}/${REL_SCHEMA}/${tbl}`), uc);
}
