# TELEMETRY Productionization Inventory and Roadmap

## Session Brief

Inventory completed across `repo-b/`, `backend/`, DB schema, scripts, CI, ADRs, runbooks, and active telemetry plans.

Two release-blocking findings require stopping before implementation:

1. Copilot audit writes still use the primary Supabase pool while governance reads Lakebase. Audit rows can be split or silently lost.
2. Most production telemetry endpoints are publicly accessible without authentication. Only metadata currently fails closed.

No broad refactor or first ticket was implemented because the first work is high-risk data-integrity/security work.

Environment corrections:

- Telemetry plans live under `docs/plans/telemetry-platform/`; `docs/plans/02-environments/` is absent.
- The canonical operational-memory file is `docs/tips.md`; root `tips.md` is absent.
- The documented `skills/winston-router/SKILL.md` file is absent.
- The worktree contains existing telemetry refactor changes and untracked primitives that must be preserved.

## Telemetry Route and Surface Inventory

| Route | Component | Data/API | Current data status | Drilldown/evidence |
|---|---|---|---|---|
| `/telemetry` | `TelemetryOverview` | None | Static public aerospace narrative and approximations | Presenter/detail interactions; no row lineage |
| `/stream` | `MissionControlStream` | `/stream/live`, `/stream/health`, `/stream/control`, `/model-performance` | Live Lakebase rows sourced from recorded capture; broker currently has no active connectors | Charts and model context; limited source-row tracing |
| `/replay` | `ReplayConsole` | `/replay`, with model/monitoring evidence | Committed replay fixture containing precomputed model outputs | Strong forensic drawer; fixture provenance |
| `/stargate` | `StargateConsole` | Bridge `/stargate/stream`, `/health`, `/snapshot`, `/dlq`, `/replay/cycle` | In-memory SSE/Kafka bridge; capture or broker mode | Charts, DLQ, source controls; no durable row lineage |
| `/runs` | `RunsExplorer` | `/runs` | Lakebase `tel_test_runs`; seeded, backfilled, and streaming runs mixed | Run selection, but `/run/{id}` is not fully used |
| `/system-health` | `SystemHealth` | Embeds monitoring and findings | Lakebase monitoring plus analyzer output | Findings and health panels |
| `/model-performance` | `ModelPerformance` | `/model-performance` | Lakebase promoted model metadata | Model/version metrics; inconsistent freshness/limitations |
| `/calibration` | `RulCalibration` | Committed evidence | Real scalar artifact metrics plus representative deterministic trajectory | Evidence cards; trajectory needs clearer synthetic label |
| `/registry` | `RegistryConsole` | `/registry` | Lakebase model registry metadata | Champion/model detail, display-only actions |
| `/copilot` | `CopilotWorkbench` | Copilot ask, explain, reports, dispositions, usefulness | Live data plus LLM/fallback paths; audit sink currently incorrect | Evidence, tool trace, reports |
| `/factory` | `FactoryNcrIntelligence` | `/ncr` | Synthetic QMS corpus with real model analytics mirrored from Databricks | Evidence drawer and NCR drilldown |
| `/factory-ml` | `FactoryMlConsole` | `/labs/factory-ml/*.json` | Committed deterministic synthetic exports | Local evidence drawer; not live Databricks |
| `/metric-lineage` | `MetricLineageExplorer` | `/metadata/graph` | Reviewed catalog plus allowlisted Lakebase enrichment | Reusable lineage drawer |
| `/metadata` | `TelemetryMetadataExplorer` | `/metadata/graph` | Reviewed catalog plus partial live enrichment | Graph, filters, inferred lineage |
| `/governance` | `GovernanceDashboard` | `/copilot/governance`, `/evals`, `/mcp/tools` | Lakebase governance aggregates plus stale committed eval/smoke artifacts | Aggregate evidence; weak source-row navigation |
| `/how-it-works` | `HowItWorks` | None | Static architecture exhibit | Deep links; explicitly not live execution |
| `/evidence` | `EvidenceCards` | Replay, model, monitoring, fused-vector and `/version` data | Mixed live Lakebase, fixture, and deployment data | Several evidence-card implementations |
| `/control-tower` | `ControlTower` | All control-tower APIs | Lakebase schema exists; current decisions/receipts/jobs are empty | Decision and signed-receipt workflows |
| `/monitoring` | `Monitoring` | `/monitoring`, `/stream/health` | Lakebase | Charts and alerts; legacy standalone route |
| `/spike-inspector` | `SpikeInspector` | `/findings` | Backend analyzer over telemetry data | Finding details; legacy standalone route |

Navigation is centralized in `telemetryNav.ts` with 20 routes across six groups. The standalone monitoring and spike routes are intentionally omitted because System Health embeds them.

## Backend and API Inventory

### Core telemetry

| Endpoint | Contract and backend path | Data touched | Current failure/tests |
|---|---|---|---|
| `GET /health` | Untyped health summary | `tel_model_runs` | No source/freshness diagnostics; serving tests |
| `POST /score` | Typed request/`ScoreResponse`; scoring service | Models, channels, predictions | Writes scoring result; serving tests |
| `GET /runs` | Typed `list[TestRunOut]` | `tel_test_runs` | Returns empty list when absent; serving tests |
| `GET /run/{run_id}` | Typed `RunDetailOut` | Runs, channels, predictions, anomalies, drift | 404/null behavior varies; serving tests |
| `GET /monitoring` | Typed `MonitoringResponse` | Predictions, drift, promoted models | Some explicit null reasons; serving tests |
| `GET /findings` | Untyped analyzer result | Predictions/anomalies | Exception details may escape; findings tests |
| `GET /replay` | Untyped replay payload | Committed JSON fixture | Fail-closed if fixture unavailable; frontend/replay tests |
| `GET /model-performance` | Untyped model result | `tel_model_runs` | 200/null model behavior; serving tests |
| `GET /summary` | Untyped aggregate | Multiple `tel_*` tables | Currently unused by Overview; serving tests |
| `GET /metadata/graph` | Typed graph | Catalog JSON plus allowlisted Lakebase tables | Only currently authenticated route; metadata tests |
| `GET /fused-vector-info` | Untyped vector summary | `tel_fused_vectors`, manifest | 200 with explicit availability state; serving tests |
| `GET /registry` | Untyped registry | `tel_model_runs`, drift | Registry tests |
| `GET /ncr` | Untyped factory payload | NCR records, clusters, backlog | Seeded/synthetic provenance; factory tests |
| `GET /stream/live` | Untyped live payload | Bronze/silver/gold stream tables | Freshness diagnostics present but inconsistent |
| `GET /stream/health` | Untyped health payload | Pipeline status, watermarks, DQ | Uses environment-only watermark lookup in places |
| `POST /stream/control` | Untyped process control | Starts/stops local worker and writes stream tables | Publicly callable today |
| `POST /stream/source` | Untyped source control | Runtime source configuration | Admin-key guarded; no platform-session integration |
| `GET /mcp/tools` | Untyped registry listing | Static MCP registry | Public today |
| `POST /mcp/check` | Untyped check | MCP services | Constructs a trusted demo context instead of caller identity |

### Copilot

| Endpoint | Data/path | Current gap |
|---|---|---|
| `POST /copilot/explain-verdict` | Typed answer; telemetry evidence plus audit write | Audit uses wrong DB pool |
| `POST /copilot/ask` | Typed answer; telemetry evidence plus audit write | Audit failure is silently suppressed |
| `POST /copilot/draft-report` | `tel_copilot_reports` | Missing response model/auth gate |
| `GET /copilot/report/{id}` | Reports | Missing response model/auth gate |
| `GET /copilot/governance` | Interactions, reports, review actions | Reads Lakebase while logger writes Supabase |
| `POST /copilot/report/{id}/disposition` | Reports/review actions | Missing response model/role gate |
| `GET /copilot/usefulness` | Review actions | Missing response model |
| `GET /copilot/evals` | Committed `eval_results.json` | Artifact is stale and not CI-refreshed |

### Control Tower

Endpoints:

- `POST /score-and-gate`
- `GET /decisions`
- `GET /decisions/{id}`
- `POST /decisions/{id}/resolve`
- `GET /receipts/{id}/verify`
- `GET /public-key`
- `GET /gemma-tier`
- `POST /gemma-tier/probe`
- `POST /gemma-tier/verify`
- `GET /gemma-tier/jobs`
- `POST /gemma-tier/warm`
- `POST /gemma-tier/teardown`

These use `tel_ct_decisions`, signed receipts, Gemma lifecycle state/jobs, provider routing, and control-tower services. None declares a Pydantic response model. Most are not protected by platform-session authorization. Existing gate, routing, signing, and Gemma tests are substantial but do not test the production proxy boundary.

### Analyzer and Stargate

- `POST /api/ade/analyze/telemetry` and `GET /api/ade/analyze/telemetry/summary` correctly call `require_environment_access`.
- Stargate exposes `/health`, `/snapshot`, `/dlq`, `/stream`, and `/replay/cycle` from an in-memory bridge with optional Kafka. It is separate from Lakebase serving and needs explicit deployment/auth boundaries.

## Data Provenance Inventory

| Source | Current state | Freshness/traceability | Trust assessment |
|---|---|---|---|
| Databricks Lakebase `tel_*` | Primary telemetry serving database | Many timestamps and source references; uneven endpoint exposure | Authoritative when scoped correctly |
| Recorded capture stream | 623k+ bronze/silver rows through June 24, 2026 | Current pipeline timestamps; source is recorded capture | Real processed data, not a physical live feed |
| Confluent/Kafka | Broker status row exists; zero Kafka rows, offsets, and active connectors in the observed snapshot | Broker heartbeat only | Must not be represented as active telemetry transport |
| Replay fixture | Committed JSON with precomputed model output | Reproducible but fixed | Trusted fixture if labeled replay |
| Test runs | Mix of C-MAPSS, SMAP/MSL backfills, and limited streaming records | Backfill flags available | Trust requires filters and visible source type |
| Factory NCR | Synthetic QMS corpus plus real model analytics | Provenance fields exist | Valid demonstration data, not customer production data |
| Factory ML | Committed deterministic JSON exports | File-generation time only | Static synthetic artifact |
| Overview | Frontend constants and public approximations | No live timestamp | Contextual narrative only |
| Calibration | Artifact metrics plus representative trajectory | Partial artifact trace | Scalars credible; trajectory must be labeled representative |
| Metadata/lineage | Reviewed catalog plus Lakebase enrichment | Catalog revision and partial live state | Good for documented lineage; not fully discovered live lineage |
| Governance eval | Committed June 9 artifact, 9/9 | Stale | Cannot represent current production evaluation state |
| Smoke artifact | Manual June 2 artifact | Stale and non-automated | Documentation evidence only |
| Control Tower | Tables currently contain zero decisions/receipts/jobs | No operational history yet | Empty production capability, not proven workload |

Observed Lakebase inventory includes 28 telemetry tables, approximately 69k predictions, 43 test runs, six model runs, 102 anomaly events, 104 drift records, 79 copilot interactions, and no control-tower decisions.

## Frontend Code-Quality and Design-System Debt

- Approximately 61 telemetry files contain inline styling; the broad scan found 1,664 style/color/spacing matches.
- Existing untracked refactor notes estimate roughly 10,200 TSX lines and 1,180 inline-style sites.
- Multiple large client components exceed 400–690 lines, including metadata, copilot, replay drawers, governance, control tower, factory, and shared primitives.
- `C`, `RS/rsTokens`, and hardcoded `NV_PURPLE` form competing token systems.
- Fetch/loading/error/state logic is repeated across most pages.
- Hardcoded `telemetry-demo` and business UUID values appear throughout API clients and components.
- `ErrorState` lacks retry behavior and frequently exposes raw exception strings.
- Loading states do not meet the shared skeleton standard.
- Missing-data, stale-data, and unavailable-model states are frequently conflated with generic errors.
- Drawer implementations are duplicated. Some custom drawers lack focus trapping and dialog semantics.
- Custom `all: unset` buttons create keyboard/focus risks.
- Recharts tests emit zero-size-container warnings.
- The sidebar contains 20 destination links despite the shared standard’s nominal seven-item primary-navigation limit.
- The shell advertises “serving · prod” and authenticated reviewer access even when the actual data source or API security state does not support that claim.
- Current user-authored WIP already introduces chart, drawer, evidence-card, and primitive consolidation. Future work must integrate it rather than create competing primitives.

Key evidence:

- [Telemetry API proxy](</C:/Projects/Consulting_app/repo-b/src/app/api/telemetry/[...path]/route.ts:1>)
- [Telemetry primitives](</C:/Projects/Consulting_app/repo-b/src/components/telemetry/primitives.tsx:1>)
- [Telemetry API client](</C:/Projects/Consulting_app/repo-b/src/lib/telemetry/api.ts:1>)
- [Telemetry navigation](</C:/Projects/Consulting_app/repo-b/src/components/telemetry/telemetryNav.ts:1>)

## Backend Code-Quality Debt

- The telemetry proxy authenticates only metadata and does not forward platform-session identity headers.
- Direct production and Railway API reads return 200 without authentication for runs, governance, and control-tower decisions.
- The default MCP provider authenticates all requests as admin when `MCP_API_TOKEN` is unset.
- Most telemetry routes do not call `require_authenticated_request` or environment-access checks.
- Client-supplied environment/business identifiers are trusted in many routes.
- Copilot audit writes use `get_cursor`; all current telemetry reads use `get_telemetry_cursor`.
- Copilot audit exceptions are suppressed, allowing an unaudited answer to look governed.
- Most endpoints lack Pydantic response models.
- Error handling is inconsistent: 200/null, 404, 500, and 503 are used for similar absence conditions.
- Raw `str(exc)` values can reach clients.
- `telemetry_copilot.py`, metadata services, and stream ETL are over-large.
- Stream process lifecycle is controlled from route handlers.
- `mcp/check` manufactures trusted demo identity.
- Application scoping is the real tenant boundary because the pooled runtime role can bypass RLS.
- Health endpoints do not verify Lakebase connectivity, audit persistence, pipeline freshness, or connector state.
- Query/index optimization must be based on `EXPLAIN`, not speculative migration work.

Key evidence:

- [Copilot logger](</C:/Projects/Consulting_app/backend/app/services/copilot_logger.py:1>)
- [Telemetry DB pools](</C:/Projects/Consulting_app/backend/app/db.py:1>)
- [Core telemetry routes](</C:/Projects/Consulting_app/backend/app/routes/telemetry.py:1>)
- [Copilot routes](</C:/Projects/Consulting_app/backend/app/routes/telemetry_copilot.py:1>)
- [Platform authorization](</C:/Projects/Consulting_app/backend/app/auth/platform.py:1>)

## Productionization Gaps

- No fail-closed audit-persistence guarantee.
- Public telemetry data and control endpoints.
- No single typed scope contract separating route authorization scope from telemetry serving scope.
- No consistent response provenance/freshness/null-reason contract.
- Static artifacts can be presented beside live data without sufficiently prominent source classification.
- No telemetry-specific authenticated production smoke suite.
- Production smoke workflow is observational and uses `|| true`.
- No telemetry Playwright golden-path or visual-regression suite in CI.
- No automated freshness check for committed eval/smoke artifacts.
- No health check for the Lakebase audit sink.
- No hard assertion that configured stream source matches visible UI status.
- No automated verification that migrations exist in the active telemetry database.
- No query-performance budget or captured plans for high-volume stream/prediction queries.
- Active plans and architecture documents disagree about Overview, Supabase versus Lakebase, NCR seeding, fused vectors, and stream status.

## Public Interface Changes

The implementation should introduce these contracts without a schema migration:

- All telemetry routes except a sanitized `GET /health` require authenticated platform-session or a valid configured machine token.
- Route authorization scope and fixed telemetry serving scope remain distinct. The proxy validates the former and injects the latter; clients cannot select tenant IDs.
- Read actions require active membership. Operator actions require write/operator permission. Source and lifecycle administration require admin permission.
- Successful endpoint shapes remain compatible where possible, but receive endpoint-specific Pydantic models and explicit provenance, freshness, and null-reason fields.
- Errors use a common body: `error_code`, safe `message`, `request_id`, `retryable`, and optional `null_reason`. Internal exception text is logged, not returned.
- Copilot answers include an audit receipt/status. If persistence fails, the governed answer fails closed rather than appearing auditable.

# Prioritized Ticket Plan

## T01 — Restore Copilot Audit Integrity

**Problem:** Copilot writes target Supabase while governance reads Lakebase, and write failures are silently suppressed.

**Evidence:** `backend/app/services/copilot_logger.py`, `backend/app/db.py`, governance queries in `telemetry_copilot.py`.

**Proposed change:** Move all `tel_copilot_*` writes to `get_telemetry_cursor`, return a persisted audit identifier, fail closed when persistence fails, and expose audit-sink health/freshness.

**Risk:** High  
**Category:** Backend, Data, AI/runtime  
**Safe immediately:** No; deploy with focused Lakebase verification and rollback path.  
**User-visible improvement:** Every displayed copilot answer is demonstrably represented in governance.

## Acceptance Criteria

### Screen
- Copilot shows the audit receipt/status for every answer.
- Audit failure displays an explicit unavailable state rather than an answer.

### API
- Ask/explain responses contain a persisted audit identifier.
- Audit persistence failure returns a sanitized 503.

### DB/Data
- New interactions appear only in Lakebase.
- Governance reflects the new interaction immediately.
- No schema migration is required.

### AI behavior
- The assistant refuses to present an answer as governed when its audit write fails.

### Evals/tests
- Add cursor-routing, success, failure, and governance-readback tests.
- Run focused copilot and DB-pool tests.

### Regression guard
- Existing grounded, fallback, and refusal behavior remains intact when audit persistence succeeds.

## T02 — Close the Telemetry Authentication and Tenant Boundary

**Problem:** Most telemetry reads and several control endpoints are public in production.

**Evidence:** Telemetry Next proxy, backend telemetry routers, live June 24 unauthenticated 200 responses.

**Proposed change:** Reuse platform-session forwarding helpers, require authentication for all non-health routes, validate route membership, inject fixed server-side serving scope, strip client scope overrides, and add backend authorization as defense in depth.

**Risk:** High  
**Category:** Frontend, Backend, Security  
**Safe immediately:** No; requires coordinated proxy/backend deployment.  
**User-visible improvement:** Telemetry and controls are accessible only to authorized reviewers/operators.

## Acceptance Criteria

### Screen
- Unauthorized sessions receive the login/403 state.
- Reviewer pages continue loading after authentication.

### API
- Unauthenticated data requests return 401.
- Wrong-route-environment requests return 403.
- Read, write, operator, and admin actions enforce distinct permissions.
- Only sanitized `/health` remains public.

### DB/Data
- Client-supplied business/environment identifiers cannot cross the configured serving scope.

### AI behavior
- Copilot and report operations enforce the same identity boundary.

### Evals/tests
- Add proxy and backend negative tests for every route family.
- Add authenticated production smoke checks.

### Regression guard
- Machine integrations work only with an explicitly configured valid token.

## T03 — Make Static, Seeded, Replay, and Live States Unambiguous

**Problem:** Overview, Factory ML, calibration, capture streaming, and stale artifacts can visually resemble live production data.

**Proposed change:** Add a standard source/status banner and update labels for static narrative, replay fixture, synthetic seed, recorded capture, broker-live, stale, and unavailable states.

**Risk:** Low–medium  
**Category:** Frontend, Docs  
**Safe immediately:** Yes after the release blockers are underway.  
**User-visible improvement:** Reviewers can immediately tell what is live, seeded, replayed, or unavailable.

## Acceptance Criteria

### Screen
- Every telemetry route displays source class and as-of timestamp where applicable.
- Overview, Factory ML, and calibration no longer imply live data.
- Confluent shows inactive when connector evidence is absent.

### API
- Live APIs expose source and freshness fields.

### DB/Data
- No fabricated value is introduced.
- Existing fixtures and seeds retain their provenance.

### AI behavior
- AI surfaces disclose model version, source window, metric, and limitations.

### Evals/tests
- Add source-label and stale-state component tests.

### Regression guard
- Replay and demo workflows remain usable.

## T04 — Type and Normalize Telemetry API Contracts

**Problem:** Most routes return untyped dictionaries with inconsistent absence and error behavior.

**Proposed change:** Add endpoint-specific Pydantic models, common provenance/error types, sanitized exception mapping, and matching TypeScript contracts.

**Risk:** Medium  
**Category:** Backend, Frontend  
**Safe immediately:** Yes by API family, not as one rewrite.  
**User-visible improvement:** Fewer brittle UI assumptions and clearer unavailable states.

## Acceptance Criteria

### Screen
- Empty, stale, unavailable, and error states render distinctly.

### API
- Every telemetry endpoint declares a response model.
- Errors use the common safe contract.

### DB/Data
- Null values carry meaningful `null_reason` where absence is expected.

### AI behavior
- Copilot evidence uses typed source references.

### Evals/tests
- Add schema serialization and frontend contract tests.

### Regression guard
- Existing successful response fields remain compatible during migration.

## T05 — Consolidate Telemetry Design Tokens and Primitives

**Problem:** Inline styles, competing palettes, repeated cards, and arbitrary values make visual behavior inconsistent.

**Proposed change:** Integrate the existing WIP primitives, establish one telemetry token layer, and migrate metric cards, status chips, chart shells, tabs, loading, error, and empty states incrementally.

**Risk:** Medium visual risk  
**Category:** Frontend, Design system  
**Safe immediately:** Yes in small component batches.  
**User-visible improvement:** Consistent spacing, contrast, typography, and status communication.

## Acceptance Criteria

### Screen
- Shared primitives match current accepted layout.
- Important labels meet contrast requirements.
- Loading states use skeletons and error states expose retry.

### API
- No API change.

### DB/Data
- No data change.

### AI behavior
- AI status and provenance use the same shared chips.

### Evals/tests
- Component tests and focused screenshots for each migrated batch.

### Regression guard
- Do not overwrite the existing untracked primitive/refactor work.

## T06 — Introduce a Scope-Aware Frontend Data Layer

**Problem:** Fetch, state, loading, retry, and hardcoded demo scope logic are duplicated.

**Proposed change:** Add a `TelemetryScopeProvider`, typed API client, and shared query hook supporting cancellation, retry, stale state, and request IDs.

**Risk:** Medium  
**Category:** Frontend  
**Safe immediately:** After T02/T04 contracts are fixed.  
**User-visible improvement:** More reliable page transitions, retries, and consistent error handling.

## Acceptance Criteria

### Screen
- All live pages share loading, empty, stale, and retry behavior.

### API
- Scope comes from server/session context, never constants in components.

### DB/Data
- Requests cannot select arbitrary tenant scope.

### AI behavior
- Copilot requests use the same scope and error contract.

### Evals/tests
- Test cancellation, retry, 401, 403, 404, 500, stale, and null states.

### Regression guard
- Route deep links and existing reviewer login continue working.

## T07 — Reuse Evidence, Lineage, and Drawer Components

**Problem:** Replay, factory, model, metadata, and control-tower surfaces implement parallel evidence/drawer patterns.

**Proposed change:** Define shared evidence-section and accessible drawer contracts, then migrate one family at a time.

**Risk:** Medium  
**Category:** Frontend  
**Safe immediately:** Yes after primitive consolidation.  
**User-visible improvement:** Consistent evidence navigation and keyboard behavior.

## Acceptance Criteria

### Screen
- Drawers trap focus, support Escape, restore focus, and expose dialog semantics.
- Evidence sections consistently show source, freshness, limitations, and copy actions.

### API
- No API change beyond consuming normalized provenance.

### DB/Data
- Source references remain exact and copyable.

### AI behavior
- AI evidence and tool trace use the same evidence primitives.

### Evals/tests
- Add keyboard, focus, ARIA, and evidence-rendering tests.

### Regression guard
- Existing replay, factory, metadata, and receipt drilldowns retain content.

## T08 — Split Backend Services and Optimize Proven Queries

**Problem:** Large route/service modules mix SQL, transformation, process lifecycle, and HTTP behavior.

**Proposed change:** Split copilot governance, metadata enrichment, stream health, and process-control services. Capture `EXPLAIN` plans before proposing indexes.

**Risk:** Medium–high  
**Category:** Backend, DB  
**Safe immediately:** Service extraction is safe; DB changes require separate approval.  
**User-visible improvement:** Lower latency variance and fewer coupled failures.

## Acceptance Criteria

### Screen
- No intended UI change except improved reliability.

### API
- Route handlers perform validation, authorization, service invocation, and response mapping only.

### DB/Data
- Every query includes required environment/business scoping.
- Index migrations are created only when measured plans prove need.

### AI behavior
- Copilot query and governance services remain behaviorally equivalent.

### Evals/tests
- Add service-level SQL/scoping tests and query-budget checks.

### Regression guard
- Existing endpoint payloads and stream-worker behavior remain compatible.

## T09 — Add Telemetry-Specific CI, Smoke, and Visual Coverage

**Problem:** Current production smoke is non-blocking and telemetry lacks an authenticated golden-path suite.

**Proposed change:** Add a focused backend suite, authenticated API smoke, Playwright route smoke/screenshots, stale-artifact checks, and migration/schema verification.

**Risk:** Medium  
**Category:** CI, QA  
**Safe immediately:** Yes once credentials and test environment are defined.  
**User-visible improvement:** Regressions are detected before deployment.

## Acceptance Criteria

### Screen
- Critical routes load without console errors and match approved screenshots.

### API
- Authenticated smoke verifies health, runs, stream health, model performance, metadata, governance, and control tower.
- Unauthorized smoke verifies 401/403.

### DB/Data
- Required `tel_*` tables and applied migration versions are asserted.

### AI behavior
- Copilot grounded, refusal, fallback, audit failure, and stale-eval cases run in CI.

### Evals/tests
- Telemetry failures block the relevant workflow; no `|| true`.

### Regression guard
- External-provider-dependent tests remain explicitly quarantined or mocked.

## T10 — Production Health and Observability

**Problem:** Generic health does not verify Lakebase, audit persistence, stream freshness, connector activity, or artifact age.

**Proposed change:** Add sanitized component health, structured metrics/logs, request correlation, freshness thresholds, and alerting.

**Risk:** Medium  
**Category:** Backend, Deployment, Observability  
**Safe immediately:** Yes after auth boundaries are established.  
**User-visible improvement:** Stale or degraded systems are visibly degraded instead of misleadingly green.

## Acceptance Criteria

### Screen
- System Health shows serving DB, audit sink, stream pipeline, broker, model, and artifact state independently.

### API
- Health returns sanitized component statuses and timestamps.

### DB/Data
- Checks are read-only and bounded.
- Stale thresholds are configured, not hardcoded in JSX.

### AI behavior
- Copilot is unavailable or clearly degraded when its evidence/audit dependencies fail.

### Evals/tests
- Add healthy, stale, disconnected, and partial-degradation tests.

### Regression guard
- Public health reveals no tenant data, credentials, SQL, or internal exception text.

## T11 — Reconcile Plans, Architecture, Runbooks, and Operational Memory

**Problem:** Current plans disagree about storage, Overview data, fused vectors, NCR seeding, and stream status.

**Proposed change:** Create the requested consolidated active inventory plan and update the source matrix, architecture, runbooks, QA checklist, and `docs/tips.md`.

**Risk:** Low  
**Category:** Docs  
**Safe immediately:** Yes.  
**User-visible improvement:** Future engineering work starts from the actual architecture.

## Acceptance Criteria

### Screen
- Documentation accurately classifies every route as live, seeded, fixture, static, partial, or unavailable.

### API
- Endpoint inventory and auth requirements match deployed behavior.

### DB/Data
- Lakebase is documented as the telemetry serving store; Supabase is documented only as local/test fallback.

### AI behavior
- Copilot audit and eval limitations are explicit.

### Evals/tests
- Documentation commands match commands that actually run.

### Regression guard
- Existing active plans are linked instead of duplicated or silently superseded.

## Recommended First Ticket

T01 — Restore Copilot Audit Integrity.

It takes precedence because it is a confirmed data-integrity failure: the product can currently show governed/copilot statistics from a different database than the one receiving new audit writes. T02 should follow immediately and be treated as the same release-blocking milestone.

No ticket was implemented in this session.

## Test Plan

Baseline tests actually run:

- `repo-b`: `npm run typecheck` — passed.
- `repo-b`: `npm run lint` — passed with unrelated pre-existing warnings.
- Focused Vitest telemetry suite — 37 files, 174 tests passed.
- Focused backend telemetry suite — 153 passed, 2 optional tests skipped.
- Frontend tests emitted known Recharts zero-size and jsdom canvas warnings.
- No Playwright/browser smoke was run because an authenticated test environment was not established.
- No schema mutation or migration verification was performed.

Required implementation-stage checks:

- Focused proxy and backend auth tests for T02.
- Focused copilot/logger/governance tests for T01.
- Frontend typecheck, lint, and affected Vitest tests.
- Authenticated Playwright route smoke.
- Read-only Lakebase verification after deployment.
- Schema gate only when DB work is explicitly approved.

## Risks and Unknowns

- The worktree is dirty with user-authored telemetry refactoring; changes must be integrated carefully.
- Production role mapping for `telemetry_reviewer` versus operator/admin needs explicit tests.
- Lakebase counts are a point-in-time June 24, 2026 snapshot.
- Query-performance claims require production-like `EXPLAIN` evidence.
- Confluent may be intentionally cold, but the UI and documentation must reflect that.
- Existing RLS tests are mostly static/fake-cursor checks; the optional live isolation test was not run.
- The active data-source matrix is materially stale and cannot be used as current evidence.

## Plan Update

After entering implementation mode:

1. Create `docs/plans/03-implementation-plans/active/telemetry-productionization-inventory.md`.
2. Use it as a consolidation/index plan linking existing telemetry upgrade, lineage, streaming, factory, and frontend-refactor plans.
3. Mark T01 and T02 as release blockers.
4. Update the telemetry source matrix and architecture documents only after deployed behavior is verified.
5. Do not introduce a schema migration unless T08 produces measured evidence requiring one.

## `docs/tips.md` Update Proposal

Add only these durable lessons:

- Production `tel_*` reads use Databricks Lakebase through `get_telemetry_cursor`; the main DB pool is only fallback/local behavior.
- All telemetry writes must use the same telemetry cursor as reads.
- Telemetry route authorization scope and fixed serving scope are intentionally distinct; never trust client-supplied tenant IDs.
- Telemetry proxies must forward verified platform-session headers.
- Recorded capture, replay fixture, synthetic seed, and live broker data are separate provenance classes.
- Preserve and integrate the existing telemetry primitive/refactor WIP.
- Record the focused pytest and Vitest commands used by this inventory.

## Final Report

### Summary
Full frontend, backend, API, DB, provenance, styling, testing, CI, and documentation inventory completed.

### Inventory completed
20 frontend routes, core/cross-cutting APIs, 28 telemetry tables, streaming/replay/factory/AI provenance, tests, scripts, and active plans.

### Highest-risk findings
Split Lakebase/Supabase copilot audit path and publicly accessible production telemetry APIs.

### Recommended ticket order
T01 audit integrity, T02 auth/scope, T03 source honesty, T04 contracts, then UI/backend consolidation and CI/observability.

### Files changed
None.

### Tests run
Frontend typecheck/lint passed; 174 focused frontend tests passed; 153 focused backend tests passed with 2 skipped.

### Evidence
Repository inspection, read-only Lakebase probe, and read-only production endpoint checks dated June 24, 2026.

### Plan updates
Proposed consolidated active productionization plan; not written in Plan Mode.

### tips.md updates
Proposal provided; not written.

### Next recommended ticket
T01 — Restore Copilot Audit Integrity and verify Lakebase read-after-write behavior.
