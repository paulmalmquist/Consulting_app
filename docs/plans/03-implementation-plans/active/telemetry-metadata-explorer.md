# Telemetry Metadata Explorer

**Status:** Implemented; ready for review
**Started:** 2026-06-12
**Risk:** Medium
**ADO:** [User Story #537](https://dev.azure.com/paulmalmquist1984/Novendor/_workitems/edit/537)
**Parent:** Feature #513 under Epic #497
**Branch:** `feat/telemetry-metadata-explorer`
**Worktree:** `C:\Projects\Consulting_app-telemetry-metadata`
**Linked build plan:** [Telemetry Platform Build](0003-telemetry-platform-build.md)

## Routing

- Commander route: `commander-winston`
- Primary owner: `lab-environment-winston`
- Backend support: `bos-domain-winston`
- Verification: `qa-winston`
- Data owner: not required because this ticket has no migration or ETL change

## Objective

Add a protected telemetry-only metadata and lineage control-plane page at
`/lab/env/[envId]/telemetry/metadata`. The page will explain the supported path from committed
sources, simulators, and streams through bronze, silver, gold, metrics, dashboards, reports,
models, APIs, and AI consumers.

The route environment ID and the telemetry serving-data scope are separate values and must be
displayed separately.

## Implementation

1. Add a reviewed catalog at `backend/app/data/telemetry/metadata_catalog.json`.
2. Add validated graph schemas and a service that loads the catalog, rejects unsafe definitions,
   computes statistics, and performs optional allowlisted Postgres enrichment.
3. Add `GET /api/telemetry/metadata/graph?env_id=&business_id=` to the existing telemetry router.
4. Add typed frontend contracts and client access through the existing telemetry proxy.
5. Add the metadata page, grouped explorer, deterministic React Flow graph, filters, details, and
   upstream trace highlighting.
6. Register Metadata Explorer in the existing grouped telemetry navigation without changing the
   compact four-item mobile primary navigation.
7. Add focused backend, frontend, and middleware tests plus browser evidence.

## Acceptance Criteria

- Authenticated users can reach the page from desktop and mobile telemetry navigation.
- The header shows route `envId`, serving scope, generated timestamp, catalog status, and freshness.
- Search and layer, object-type, feed-type, and status filters update the explorer and graph.
- Selected nodes show type-specific details and explicit unavailable reasons.
- Selecting a gold object or metric highlights its upstream lineage.
- Explicit lineage is solid; inferred lineage is dashed and labeled as inferred in details.
- The graph contains only committed or configured telemetry assets.
- The API returns validated nodes, edges, warnings, and matching statistics.
- Optional Postgres enrichment failures return sanitized `partial` responses.
- Invalid, unsafe, duplicate, or dangling base-catalog definitions fail closed.
- No raw rows, secrets, credentials, connection strings, service-role details, arbitrary SQL, or
  non-telemetry metadata are exposed.
- Existing telemetry routes, APIs, reviewer access, and proxy behavior remain unchanged.

## Test Plan

- Backend: graph validation, allowlist, tenant scope, optional enrichment, partial warnings,
  inferred lineage, statistics, invalid catalog failure, and sensitive-field exclusion.
- Frontend: loading, error, partial, empty, filtering, search, selection, detail variants, trace
  highlighting, inferred-edge styling, and unavailable metadata.
- Middleware: metadata route follows existing authenticated and unauthenticated behavior.
- Commands: focused telemetry pytest, frontend Vitest, frontend typecheck, and production build.
- Browser evidence: desktop, 375px mobile, node details, trace highlighting, clean console, and
  endpoint HTTP 200.

## Constraints

- No migration or database write.
- No global schema crawler.
- No live Databricks or Confluent query.
- No external credential use.
- No raw table contents.
- No AI behavior or MCP contract change.
- No new graph dependency.
- No roadmap-only telemetry objects.

## Session Evidence

- ADO Story #537 created, linked to Feature #513, and moved to Resolved with the implementation,
  verification results, evidence paths, and remaining release work recorded in its audit comment.
- Clean worktree created from `origin/main` at commit `7e2194e5`.
- Baseline frontend unit suite passed on 2026-06-12.
- Baseline focused telemetry backend suite passed: 40 tests.
- The full backend suite exceeded the 20-minute local command limit without reporting a failure.
- Reviewed catalog contains 100 connected telemetry-only nodes and 133 edges. All source references
  resolve to committed files; there are no duplicate, dangling, self-referential, or isolated
  definitions.
- Local endpoint smoke: HTTP 200, `status=partial`, 100 nodes, 133 edges, one sanitized
  `RUNTIME_ENRICHMENT_UNAVAILABLE` warning, and statistics derived from the returned payload.
- Browser evidence:
  - `docs/evidence/telemetry-metadata-explorer/desktop.png`
  - `docs/evidence/telemetry-metadata-explorer/drawer-trace.png`
  - `docs/evidence/telemetry-metadata-explorer/mobile-375.png`
- Browser checks confirmed the protected reviewer login, separate route/serving scopes, desktop
  navigation, mobile More-menu navigation, detail drawer, trace highlighting, and inferred labels.
  The globally mounted MCP context request remains correctly denied with 403 for the scoped
  telemetry reviewer; the metadata page and endpoint return 200.

## Completed Work

- Added strict Pydantic graph contracts, catalog validation, source-reference enforcement, derived
  statistics, and static allowlisted Postgres enrichment.
- Added the telemetry metadata endpoint and protected frontend proxy behavior.
- Added the protected metadata page, grouped explorer, deterministic React Flow graph, filters,
  responsive detail drawer, inferred-edge styling, and generic upstream traversal.
- Added RS Factory, Factory ML, NCR intelligence, Stargate, NASA, ISS, serving, metric, dashboard,
  report, model, API, and AI-consumer lineage from committed artifacts only.
- Added desktop/mobile telemetry navigation.
- Fixed scoped reviewer login so the non-email username can pass native form validation.
- Kept `/api/auth/me` database-free for scoped reviewer sessions, matching the signed
  reviewer-session design.

## Files Changed

- Backend catalog, graph contracts/service/route, and metadata tests.
- Frontend proxy, protected page, graph/explorer/drawer components, typed client, and tests.
- Telemetry navigation, middleware, reviewer login, and reviewer auth-status handling.
- This plan, telemetry architecture/QA/eval/next-session docs, `docs/tips.md`, and screenshot evidence.

## Verification

- `backend/tests/test_telemetry_metadata.py`: 18 passed.
- All focused telemetry backend suites: 58 passed.
- Metadata frontend/proxy/navigation/middleware suite: 30 passed.
- Reviewer auth/access regression suite: 19 passed.
- Full frontend Vitest suite: passed with bounded workers.
- Frontend TypeScript typecheck: passed.
- Frontend production build: passed; metadata route emitted at
  `/lab/env/[envId]/telemetry/metadata`.
- `git diff --check`: passed.

## Risks And Follow-Ups

- Live Postgres enrichment was intentionally not exercised; the constrained local smoke verified
  the sanitized partial path. Databricks and Confluent were never queried live.
- The graph is intentionally a reviewed catalog, not a crawler. New telemetry assets require a
  catalog and lineage update.
- Production deployment and deployed HTTP smoke remain separate release work; do not close the ADO
  Story until merge and deploy verification are complete.
- Recommended next ticket: add a small CI validator that checks catalog source references and
  disconnected lineage without starting the full backend.

## Closeout Checklist

- [x] Code and focused tests complete
- [x] Typecheck and production build pass
- [x] Browser and API evidence captured
- [x] Changed files and residual risks recorded here
- [x] Telemetry architecture, QA, eval, and next-session docs updated
- [x] Reusable discoveries added to `docs/tips.md`
- [x] ADO audit comment added and Story moved to Resolved
