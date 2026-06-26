# ADR 0001 — Synthetic-only, no real Relativity/Manufacturo data

- Status: Accepted
- Date: 2026-06-26
- Deciders: Paul Malmquist
- Related: [0002-fixtures-plus-lakebase-serving](0002-fixtures-plus-lakebase-serving.md),
  [0003-medallion-and-rel-prefix](0003-medallion-and-rel-prefix.md)

## Context

Phase 10 builds an MES/ERP/PLM facsimile to show the telemetry operating model maps to Relativity's
likely environment. Relativity's true MES (Manufacturo) schema/API is not public, and their ERP/PLM
products are not publicly known. Presenting anything as their real schema, API, or data would be
both inaccurate and a credibility risk in front of a director-level audience.

## Decision

All data is synthetic and labeled as such. We model concepts *shaped like* a documented Manufacturo
MES plus a generic ERP/PLM facsimile, using obviously fictional identifiers (`VEH-DEMO-001`,
`PN-*`, `LOT-*`, `MAT-*`, fictional suppliers). Approved framing language: "shaped like Manufacturo",
"generic ERP/PLM facsimile", "synthetic source-system model". Forbidden claims: "Relativity's
schema", "Manufacturo API implementation", "real Relativity data", "certified AS9100 evidence",
"production-ready for their factory".

Enforcement: every generated row carries `synthetic=true`; a "synthetic" label renders above the
fold on every dashboard; and `test_no_real_identifiers_in_data_rows` fails the build if any of
`relativity, manufacturo, terran, aeon, andea` appears in a synthetic data row. The product framing
("Relativity MES Sandbox", "shaped like Manufacturo") is approved copy and lives in meta/labels, not
in data rows — the test is scoped to data rows so the framing and the data discipline coexist.

## Alternatives considered

- Reconstruct the literal Manufacturo data dictionary — rejected: not public; would be a fabrication.
- Use anonymized real figures — rejected: no real figures are available and none should be implied.

## Consequences

The sandbox proves the *operating model maps to their world* without overclaiming. Synthetic data
cannot validate real model accuracy or real cost figures; the UI says so.
