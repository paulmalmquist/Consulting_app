# 0015 — Relativity MES Sandbox (Phase 10) acceptance

- Status: Accepted (acceptance pass, not a feature pass)
- Date: 2026-06-26
- Scope doc: [0011-relativity-mes-lakebase-facsimile.md](0011-relativity-mes-lakebase-facsimile.md)
- Prod backend: `ec6e5dd7` (Railway `authentic-sparkle`); frontend auto-deployed from `main`.
- Tenant: env `telemetry-demo`, business `7e1eb000-0000-4000-a000-000000000001`.

All data is SYNTHETIC (shaped like a Manufacturo MES + a generic ERP/PLM facsimile). The Databricks
serverless warehouse is the only compute and is unhealthy (`health=FAILED — "Clusters are failing to
launch"`), so serving stays on the proven Lakebase load (`serving_provenance=seed-bootstrap`) — real
Lakebase rows, never local JSON. This is honest and expected.

## Checklist — all verified

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | `/version` shows backend `ec6e5dd7` | PASS | `GET …/version` → `git_sha=ec6e5dd78b632cb1…` |
| 2 | All five MES dashboard routes resolve (gated after login) | PASS | 5 `page.tsx` on disk; each `…/relativity-mes[/genealogy|ncr|cost|lineage]` → **HTTP 307** to login (gated, not 500); `POST /api/auth/telemetry-login` (bad creds) → **401** (gate live, not 503-disabled); render proven by `consoles.test.tsx` (6) |
| 3 | All seven MES API routes return live rows or honest `null_reason` | PASS | overview/genealogy/where-used/ncr/cost/lineage → `source_kind=live-rows`; `source/{table}` → live-rows for an allowlisted `rel_*` table, `null_reason=unknown_source_table` for a non-allowlisted (`tel_predictions`) table |
| 4 | Build Genealogy: `LOT-7788` affects exactly `VEH-DEMO-001` + `VEH-DEMO-002` | PASS | `GET …/where-used?lot_no=LOT-7788` → `affected_vehicle_count=2`, `vehicles=['VEH-DEMO-001','VEH-DEMO-002']`; overview shows `affected_by_suspect_lot` true/true/**false** for 001/002/003 |
| 5 | NCR page: 7 rows, 1 open, 2 major, $6,850 rework | PASS | `GET …/ncr` → `rows=7`, kpis `open_now=1, major=2, estimated_rework_cost=6850.0, open_blocking=1` |
| 6 | Cost page: 18 reconciliations, 1 exception | PASS | `GET …/cost` → `reconciliation=18`, kpis `unreconciled_rows=1` |
| 7 | Lineage page: 29 manifest rows | PASS | `GET …/lineage` → `rows=29` + live serving health per table (overview 3, genealogy 106, ncr 7, cost rollup 18, recon 18) |
| 8 | `source_kind` is `live-rows` | PASS | every populated route returns `live-rows` (real Lakebase serving rows) |
| 9 | `serving_provenance` is honestly `seed-bootstrap` | PASS | all serving rows report `seed-bootstrap` (the Databricks-gold flip is gated on a healthy warehouse) |
| 10 | No local fixture fallback used by the frontend | PASS | no `public/labs/relativity-mes` dir; consoles import only the API client (`getOverview`/`getGenealogy`/…); no `.json`/`fetch`/`fixture` imports in `relativity-mes/` or `relativityMes.ts` |
| 11 | CSV exports reflect filtered/visible rows | PASS | `ExportToCsvButton rows={…}` bound to the visible array per console (NCR `shown` = defect-family-filtered; Genealogy `edges` = selected-vehicle; Cost rollup/recon = selected-vehicle; Overview vehicles; where-used rows; Lineage manifest) |
| 12 | Existing telemetry frozen evidence still passes | PASS | backend `test_verdict_for_bands_frozen` + `test_telemetry_factory` green (27 incl. relativity); frontend `FactoryEvidenceDrawer` + `evidenceCard` fail-closed + nav/sidebar green (35) |

## Honest caveats

- **Unknown tenant → 500, not `null_reason`.** An invalid `business_id` raises in the shared
  `resolve_tenant_id` (same as every telemetry route), so it surfaces as a 500 rather than a graceful
  `null_reason`. The demo always uses the valid `telemetry-demo` tenant (live rows). Not a Phase-10
  regression; consistent with the platform. The empty-serving `null_reason` path is covered by
  `test_overview_fail_closed_when_empty`.
- **Databricks medallion live run blocked** (serverless warehouse unhealthy). `rel_medallion.py` is
  committed + runnable; re-run when the warehouse is healthy to flip serving to `databricks-gold`.

## Verbatim prod responses (2026-06-26)

```
/version                      git_sha=ec6e5dd78b632cb1a582389785dce11c23e98f8c
overview                      source_kind=live-rows prov=seed-bootstrap rows=3
  VEH-DEMO-001 open_ncr=1 suspect=True  readiness=blocked
  VEH-DEMO-002 open_ncr=0 suspect=True  readiness=on_track
  VEH-DEMO-003 open_ncr=0 suspect=False readiness=on_track
where-used LOT-7788           affected=2 vehicles=['VEH-DEMO-001','VEH-DEMO-002']
genealogy (VEH-DEMO-001)      live-rows edges=32 vehicles=3 ncrs=3 null=None
ncr                           rows=7 open_now=1 major=2 rework=$6850 open_blocking=1
cost                          reconciliation=18 unreconciled=1
lineage                       manifest_rows=29 (+ live serving health per table)
source/rel_mes_nonconformance live-rows rows=1 (filter lot_no=LOT-7788)
source/tel_predictions        null_reason=unknown_source_table source_kind=unavailable
dashboard routes (x5)         HTTP 307 (gated to telemetry reviewer login)
telemetry-login (bad creds)   HTTP 401 (gate live)
```
