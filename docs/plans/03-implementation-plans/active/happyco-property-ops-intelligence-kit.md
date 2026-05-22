# HappyCo Property Ops Intelligence Kit

**Created:** 2026-05-20
**Status:** Active - Tickets 2, 3A, 3, 3B, 3C, 4, 5/5A, 6, 7, 8, 9, and optional 10 complete
**Environment:** Operator lab / gated HappyCo proof package
**Deliverable type:** Multi-ticket interview demonstration package

---

## Context

HappyCo is hiring a Head of Data to lead data strategy and infrastructure for a
modern property management software platform. The job description emphasizes
canonical entity modeling, property graph / knowledge layer, entity resolution,
data warehouse and pipeline architecture, analytics and benchmarking, predictive
models, feature pipelines, model deployment patterns, AI-enabled product
capabilities, retrieval systems, product-facing APIs, and hands-on SQL/Python/ML
execution.

This package is a role-specific proof-of-work for landing that job. It must show
that Paul can operate at the strategy layer and the implementation layer without
making fake production claims. All HappyCo-specific proof uses deterministic
synthetic demo data unless a later ticket explicitly wires a safe runtime source.

Source inputs for this plan:

- `happyco_prompts.md` - prompt stack and ticket sequence when present in the
  working checkout
- `happyco_property_ops_intelligence_preview.jsx` - Canvas design reference when
  present in the working checkout
- `happy_co_description.md` - HappyCo job description when present in the working
  checkout
- repo inspection of operator routes, auth invite-code fallback, Databricks stub,
  artifact ignore rules, and notebook patterns

---

## Access decision

The HappyCo package is gated.

- Public Novendor pages may show only generic positioning.
- HappyCo-specific microsite/share package, live demo, screenshots, workbook, deck,
  architecture diagram, model artifacts, and recruiter workflow proof require
  invite-code access.
- Proposed env var: `HAPPYCO_DEMO_INVITE_CODE`.
- Reuse existing auth/access patterns before inventing a new one. Current repo
  pattern: `repo-b/src/app/api/auth/login/route.ts` accepts invite codes and writes
  an HttpOnly `bos_session` cookie.
- If no route-scoped gate fits cleanly, create the smallest `/happyco` gate that
  works for tomorrow and document hardening later.
- If `HAPPYCO_DEMO_INVITE_CODE` is missing, fail closed with an explicit
  "HappyCo demo invite code is not configured" state.
- Do not put tailored HappyCo artifacts in public static paths. Stream or link
  them only behind the gate if download routes are later added.

---

## Surface decision

- **Gated share package:** `/happyco` or the closest repo-consistent equivalent.
- **Live working demo:** `repo-b/src/app/lab/env/[envId]/operator/property-ops-intelligence/page.tsx`.
- **Backend API family:** existing operator API prefix:
  `/api/operator/v1/property-ops/*`.
- **Frontend API calls:** existing BOS proxy pattern via `/bos/api/operator/v1/...`.
- **Microsite:** reuse Outreach Personalizer concepts from `origin/main`, but do
  not expose the tailored HappyCo package publicly.

---

## Canvas design guidance

The Canvas JSX is a design reference, not code to paste directly. Translate it into
a HappyCo-inspired gated proof-package experience:

- Tabs: Executive Demo, Data Flow, Automation Room, Artifact Factory, Build Log.
- Palette: deep purple, mint banner, off-white background, rounded white cards.
- Feel: product/SaaS proof package, not dark Winston admin.
- Hero should make the planned operator route and proof-package purpose obvious.
- Artifact Factory must show honest states: planned, ready, draft-only,
  not wired yet. No fake export/send success.
- Automation Room should show controlled local runner behavior, receipts, and
  explicit send/export gates.
- Build Log should expose ticket status and evidence, not hide implementation
  state.

---

## Core package

- **Live Winston demo:** canonical property ops graph, entity resolution, work
  orders, inspections, units, vendors, benchmarks, deterministic recommendations,
  and ML risk proof.
- **Gated microsite/share page:** tailored executive landing page explaining how
  Paul would approach HappyCo's data platform.
- **Excel workbook:** `HappyCo_Property_Ops_Model.xlsx`.
- **PowerPoint deck:** `HappyCo_90_Day_Data_Strategy.pptx`.
- **Architecture diagram:** source systems -> bronze/silver/gold canonical model
  -> property graph -> warehouse -> APIs -> AI/ML workflows ->
  Excel/PowerPoint/Email/microsite.
- **Outlook/WinCOM proof:** parameter-driven local runner for search/read/draft
  workflow with dry-run and receipt defaults.
- **Runbook/screenshots:** evidence package for recruiter or product/engineering
  walkthrough.

---

## Public API contract

Plan these operator endpoints:

```text
GET /api/operator/v1/property-ops/entities
GET /api/operator/v1/property-ops/graph
GET /api/operator/v1/property-ops/benchmarks
GET /api/operator/v1/property-ops/recommendations
GET /api/operator/v1/property-ops/ml-risk
```

Every response must include:

- `demo_mode: true`
- `data_source: "synthetic_demo"`
- `fixture_version` or `model_version`
- `caveat: "Synthetic demo data. Not HappyCo production data."`

The recommendations endpoint should consume ML prediction artifacts when they
exist. When ML artifacts are present, include `ml_risk_score`, `risk_band`, and
`top_model_drivers`. When artifacts are missing, include
`ml_status: "not_available"` and continue with deterministic benchmark-only
recommendations.

---

## Data and graph contract

Ticket 2 is the source of truth for all later APIs, UI, artifacts, and ML.

Required synthetic data:

- 3 operators / businesses
- 5 properties
- 10 buildings
- 80 units
- 40 inspections
- 120 inspection findings
- 150 work orders
- 8 vendors
- 100 resolution events
- 30 resident-impact proxy events
- at least 20 intentionally messy source records

Required resolution methods:

- exact external ID
- normalized address
- fuzzy name
- geospatial proximity placeholder
- temporal proximity
- manual review required

Required graph relationships:

- operator owns/manages property
- property contains building
- building contains unit
- inspection occurs at property/unit
- inspection generates finding
- finding creates/links work order
- work order assigned to vendor
- vendor resolves work order
- work order impacts resident proxy event
- property belongs to peer group

The first demo story should make Parkline Commons visibly underperforming:
repeat HVAC work orders, reopened tickets, vendor first-time-fix issues, moisture
findings, and resident-impact proxy events.

---

## ML / Databricks decision

Add a Databricks-style ML proof, but do not implement runnable training until
Ticket 2's canonical fixture exists.

If Ticket 2 data fixtures are absent, create only the Ticket 3A plan/schema
contract and optional non-runnable templates. After Ticket 2 lands, implement the
local ML training script against the real fixture.

Use case:

Predict whether a property/unit/work-order cluster is likely to produce a repeat
work order, reopened ticket, or maintenance escalation in the next 30 days.

Target:

```text
maintenance_escalation_risk_30d
```

Training features:

- trailing 30-day work-order count
- trailing 60-day work-order count
- repeat work-order rate
- reopened work-order rate
- average aging days
- inspection severity score
- HVAC finding count
- plumbing finding count
- moisture finding count
- safety finding count
- vendor first-time-fix rate
- vendor average aging
- resident-impact proxy count
- property unit count
- peer group
- prior escalation flag

Model:

- Prefer an explainable model: logistic regression first, random forest or
  gradient boosting only if the fixture demands it.
- Output risk probability.
- Output feature importance or coefficients.
- Output model metrics.

Databricks framing:

```text
Bronze operational extracts
-> Silver canonicalized property operations records
-> Gold benchmark and feature tables
-> ML feature table
-> model training
-> batch inference
-> product/API predictions
```

Do not claim a production Databricks deployment unless a Databricks CLI/job run is
actually performed and receipt evidence exists. If live Databricks execution is
not available, provide a Databricks-ready notebook/script plus a local fallback.

---

## ML honesty and integration rules

The predictive maintenance model is a synthetic demo model. Its purpose is to
prove platform capability, not real HappyCo predictive performance.

Rules:

- Do not present synthetic model accuracy as real-world expected performance.
- If metrics are unusually high because synthetic labels are deterministic, state
  that clearly in `model_metrics.json` and `model_card.md`.
- Prefer explainability over raw performance.
- Output feature importance or coefficients.
- Generate a `model_registry_record.json` to demonstrate lifecycle thinking.
- Backend recommendations should consume ML prediction artifacts when available.
- If ML artifacts are missing, backend responses must fail soft with
  `ml_status: "not_available"` and keep benchmark-only recommendations
  deterministic.
- Do not claim live Databricks execution unless a Databricks CLI/job run is
  actually performed and receipt evidence exists.

Required ML artifacts after Ticket 3A implementation:

```text
artifacts/happyco/ml/feature_table.csv
artifacts/happyco/ml/predictions.csv
artifacts/happyco/ml/model_metrics.json
artifacts/happyco/ml/feature_importance.csv
artifacts/happyco/ml/model_card.md
artifacts/happyco/ml/model_registry_record.json
notebooks/happyco_property_ops_ml.py
```

`model_registry_record.json` fields:

- `model_name`
- `model_version`
- `trained_at`
- `feature_table_version`
- `metrics_path`
- `prediction_path`
- `model_card_path`
- `deployment_status`: `local_demo_only` or `databricks_ready`
- `caveat`

Note: `artifacts/`, `*.xlsx`, and `*.pptx` are ignored by git. Generated artifacts
are local evidence outputs unless a later ticket deliberately creates tracked
templates or gated download handlers.

---

## Ticket plan

### Ticket 1 - Plan expansion, routing, and package information architecture

**Scope:** create/update this active plan and `docs/tips.md`.

**Acceptance criteria:**

- Gated access decision is documented.
- Canvas design guidance is documented.
- ML/Databricks decision is documented.
- Ticket 3A is documented.
- Model honesty and integration rules are documented.
- Tomorrow-deadline priority order is documented.
- No product code is changed.

**Evidence:** `Test-Path` on this plan, `Select-String` for HappyCo tips, changed
file list.

**Risk:** Low.

### Ticket 2 - Deterministic seed data and canonical property operations model

**Scope:** add the synthetic fixture and canonical model service.

**Expected files:**

- `backend/app/fixtures/winston_demo/happyco_property_ops_seed.json`
- `backend/app/services/operator_property_ops.py`
- `backend/tests/test_operator_property_ops.py`

**Acceptance criteria:**

- Required data counts and entity types exist.
- Messy source records resolve to canonical records.
- Human-review-required rows exist.
- One property clearly underperforms peers.
- Benchmark-ready and recommendation-ready evidence exists.
- No DB migration.

**Risk:** Medium.

**Completed 2026-05-20:**

- Added deterministic fixture seed at `backend/app/fixtures/winston_demo/happyco_property_ops_seed.json`.
- Added canonical materialization/service layer at `backend/app/services/operator_property_ops.py`.
- Added focused tests at `backend/tests/test_operator_property_ops.py`.
- Generated service output includes 3 operators, 5 properties, 10 buildings,
  80 units, 40 inspections, 120 findings, 150 work orders, 8 vendors,
  100 resolution events, 30 resident-impact events, 24 messy source records,
  benchmark rows, vendor performance, recommendation evidence, graph nodes/edges,
  and 30 ML-ready feature rows.
- Ticket 2 tests: `python -m pytest backend/tests/test_operator_property_ops.py -q`
  -> 7 passed.
- Operator regression subset:
  `python -m pytest backend/tests/test_operator_v1.py backend/tests/test_operator_permits.py backend/tests/test_operator_closeout.py -q`
  -> 17 passed.

### Ticket 3 - Backend/API surface

**Scope:** expose canonical entities, graph, entity resolution, benchmarks,
recommendations, and vendor/work-order analytics via operator API endpoints.

**Acceptance criteria:**

- Endpoints return deterministic synthetic JSON.
- Demo metadata/caveats are present.
- Recommendation endpoint handles missing ML artifacts with
  `ml_status: "not_available"`.
- Existing operator APIs do not regress.

**Risk:** Medium.

**Completed 2026-05-20:**

- Added operator API endpoints in `backend/app/routes/operator.py`:
  `/property-ops/entities`, `/property-ops/graph`, `/property-ops/benchmarks`,
  `/property-ops/recommendations`, and `/property-ops/ml-risk`.
- Added service support for reading generated local ML artifacts from
  `artifacts/happyco/ml` when present.
- `ml-risk` returns `ml_status="available"` with grouped property predictions when
  artifacts exist and `ml_status="not_available"` without failing the demo when
  artifacts are missing.
- Recommendations enrich with `ml_risk_score`, `risk_band`, and
  `top_model_drivers` when ML predictions are available; otherwise they stay
  benchmark-only and deterministic.
- Tests: `python -m pytest backend/tests/test_operator_property_ops.py -q`
  -> 8 passed.
- Operator regression subset:
  `python -m pytest backend/tests/test_operator_v1.py backend/tests/test_operator_permits.py backend/tests/test_operator_closeout.py -q`
  -> 17 passed.

### Ticket 3A - Databricks / ML Risk Model Proof

**Goal:** demonstrate hands-on ML and modern data platform capability by training
a property maintenance escalation risk model from Ticket 2's synthetic canonical
property operations dataset.

**Sequencing rule:** do not implement runnable training until Ticket 2 fixture data
exists. If this ticket starts before Ticket 2 is complete, limit work to plan/schema
contract, notebook/script skeleton, model card template, artifact README, and model
registry record template.

**Expected tracked files after implementation:**

- `notebooks/happyco_property_ops_ml.py`
- `scripts/happyco/train_property_ops_ml.py` only after Ticket 2 exists
- optional tracked templates/docs for ML artifacts, not generated outputs

**Expected generated local artifacts after training:**

- `artifacts/happyco/ml/feature_table.csv`
- `artifacts/happyco/ml/predictions.csv`
- `artifacts/happyco/ml/model_metrics.json`
- `artifacts/happyco/ml/feature_importance.csv`
- `artifacts/happyco/ml/model_card.md`
- `artifacts/happyco/ml/model_registry_record.json`

**Acceptance criteria:**

- Deterministic feature table exists.
- Local fallback training command exists and runs after Ticket 2.
- Predictions file exists.
- Model metrics JSON exists.
- Feature importance exists.
- Model card exists with synthetic-data caveat.
- Model registry record exists.
- Databricks-ready notebook/script is present.
- No private data or secrets.
- No live Databricks claim without CLI/job receipt.

**Risk:** Medium-high if started before data exists; low/medium after Ticket 2.

**Completed 2026-05-20:**

- Added local fallback trainer at `scripts/happyco/train_property_ops_ml.py`.
- Added Databricks-ready notebook at `notebooks/happyco_property_ops_ml.py`.
- Local Python did not have `sklearn`, so the trainer uses an automatic
  NumPy logistic-regression fallback when scikit-learn is unavailable. This keeps
  the proof runnable without dependency installation while still preferring
  scikit-learn when present.
- Generated ignored local artifacts under `artifacts/happyco/ml/`:
  `feature_table.csv`, `predictions.csv`, `model_metrics.json`,
  `feature_importance.csv`, `model_card.md`, `model_registry_record.json`,
  and `README.md`.
- Training command:
  `python scripts/happyco/train_property_ops_ml.py --fixture backend/app/fixtures/winston_demo/happyco_property_ops_seed.json --out artifacts/happyco/ml`.
- Metrics: 30 feature rows, 7 positive rows, accuracy 0.9, ROC AUC 0.9375,
  `training_backend="numpy_logistic_regression_fallback"`.
- Model honesty warning is written to `model_metrics.json` and `model_card.md`:
  synthetic labels may be deterministic or partially separable, so metrics are
  not expected production performance.

### Ticket 3B - Live Databricks ML Run Receipt

**Goal:** upgrade the ML proof from Databricks-ready artifacts to an actual
Databricks-executed training run on the existing deterministic synthetic HappyCo
property ops dataset.

**Honest claim if completed:**

`Databricks ML training run executed on synthetic property operations data.`

**Claims still not allowed:**

- Real HappyCo production model.
- Real HappyCo production data.
- Production Databricks deployment.
- Model registered/deployed unless a real registry/deployment receipt exists.

**Required local receipt path:**

`artifacts/happyco/databricks/databricks_run_receipt.json`

**Attempt receipt path when execution cannot complete:**

`artifacts/happyco/databricks/databricks_run_attempt_receipt.json`

**Receipt JSON fields:**

- `demo_mode: true`
- `data_source: "synthetic_demo"`
- `databricks_executed: true`
- `workspace_user` or masked user identity
- `job_id` if applicable
- `run_id`
- `run_page_url` if available
- `notebook_path` or task path
- `started_at`
- `finished_at`
- `status`
- `output_paths`
- `model_name`
- `model_version` or run label
- `caveat: "Synthetic demo data. Not HappyCo production data."`
- `claim_allowed: "Databricks ML training run executed on synthetic property operations data."`
- `claim_not_allowed: "Production HappyCo model trained/deployed."`

**Backend/API behavior:**

`/api/operator/v1/property-ops/ml-risk` reports:

- `databricks_status`: `not_configured`, `not_run`, `attempted_failed`, or `completed`
- `databricks_run_id` when completed
- `databricks_run_url` when available
- `databricks_receipt` for gated proof context

No receipt means `databricks_status: "not_run"`. Attempt receipts never produce
"completed" language.

**Frontend behavior:**

- Operator ML panel shows "Databricks run completed" only when the completed
  receipt exists and records a successful Databricks execution.
- Otherwise it shows "Databricks-ready; live run not yet completed."
- `/happyco` continues to require a receipt before making any live Databricks claim.

**Implementation status 2026-05-20:**

- Added receipt-aware API/service contract.
- Added `scripts/happyco/run_databricks_ml.py` to check CLI/auth and write an
  attempt receipt without printing secrets.
- Installed and authenticated Databricks CLI profile `PaulMain` outside the repo.
- Initial classic-cluster submission failed because the workspace supports
  serverless compute only; the script now submits a serverless notebook task by
  default.
- Executed a real Databricks serverless notebook job against the deterministic
  synthetic HappyCo feature rows.
- Completed Databricks run receipt:
  `artifacts/happyco/databricks/databricks_run_receipt.json` (ignored local
  evidence) and tracked sanitized fallback fixture
  `backend/app/fixtures/winston_demo/happyco_databricks_run_receipt.json`.
- Run ID: `1055219858155829`; job ID: `77917622473309`.
- Allowed claim is now exactly: `Databricks ML training run executed on synthetic
  property operations data.`
- Still not allowed: real HappyCo production data/model, production deployment, or
  model registry/deployment claims.


### Ticket 3C - Weather-aware maintenance risk Databricks proof integration

**Goal:** integrate the completed weather + maintenance risk Databricks proof into
the gated HappyCo package without exposing raw artifacts or making production
claims.

**Source proof:** commit `ad634bfa` from
`feature/happyco-weather-maintenance-risk-ml`.

**Completed Databricks run:**

- Job ID: `172758362681895`
- Run ID: `924781458483845`
- Data: public weather + synthetic property operations
- Output: predictions, metrics, MLflow run metadata, validated receipt
- Allowed claim: `Databricks ML training run executed on public weather and synthetic property operations data.`

**Claims still not allowed:**

- HappyCo production data.
- Production HappyCo model.
- Production deployment.
- Serving endpoint.

**Technical caveats:**

- The workspace used `hive_metastore.property_ops_risk_ml` because `main` catalog
  was unavailable.
- Serverless SparkML artifact logging was fail-soft without a UC Volume temp path,
  but MLflow params/metrics/run IDs, tables, predictions, and receipt validation
  completed.

**Integration scope:**

- `/happyco` shows a gated Databricks receipt card and Automation Control Room row.
- The final HappyCo runbook records the allowed claim, run IDs, namespace fallback,
  and UC Volume follow-up.
- No public artifact downloads are added.
- No backend route or DB behavior changes are required.

**Risk:** Low, provided copy remains receipt-backed and caveated.

### Ticket 4 - Frontend Winston demo page

**Scope:** build the HappyCo-colored tabbed operator page from the Canvas design
reference.

**Expected route:**

`repo-b/src/app/lab/env/[envId]/operator/property-ops-intelligence/page.tsx`

**Acceptance criteria:**

- Executive Demo shows property graph, benchmarks, recommendation evidence, and
  ML risk output when available.
- Data Flow shows bronze/silver/gold, canonical graph, warehouse/API/product layer.
- Automation Room shows Outlook/Excel/PowerPoint local-runner gates.
- Artifact Factory shows real/planned/draft-only/not-wired states.
- Build Log shows ticket/evidence status.
- UI never claims fake export/send/model success.

**Risk:** Medium.

**Completion evidence (2026-05-20):**

- Added the operator route at
  `repo-b/src/app/lab/env/[envId]/operator/property-ops-intelligence/page.tsx`.
- Added the HappyCo-colored tabbed client surface in
  `repo-b/src/components/operator/property-ops/PropertyOpsIntelligencePage.tsx`.
- Added typed API client helpers in `repo-b/src/lib/bos-api.ts`.
- Added `Property Ops` to the operator navigation and suppressed the default
  anchor rail so the demo owns its full-width proof-package chrome.
- `cd repo-b && npm run typecheck` passed.

### Ticket 5 - Gated microsite/share package

**Scope:** add `/happyco` or repo-consistent gated share package.

**Acceptance criteria:**

- Invite code is required for HappyCo-specific content.
- Public unauthenticated state is generic and does not expose tailored artifacts.
- Gated page includes platform story, architecture, demo links, model caveat,
  screenshots, and artifact statuses.
- Existing auth/session behavior is not weakened.

**Risk:** Medium.

**Completion evidence (2026-05-20):**

- Added route-scoped access handler at `repo-b/src/app/happyco/access/route.ts`.
- Added gated share package page at `repo-b/src/app/happyco/page.tsx`.
- Tailored HappyCo content is hidden until the `happyco_demo_access` cookie is
  issued by the invite route.
- Production requires `HAPPYCO_DEMO_INVITE_CODE`; local development has the
  documented fallback `happyco-local-demo`.
- Local ignored workbook/deck artifacts are not exposed as public downloads.
- `cd repo-b && npm run typecheck` passed.

### Ticket 6 - Excel workbook artifact

**Scope:** generate `HappyCo_Property_Ops_Model.xlsx`.

**Tabs:**

- Read Me
- Canonical Entities
- Property Benchmarks
- Inspection Risk
- Work Order Aging
- Vendor Performance
- AI Recommendations
- ML Feature Table
- ML Predictions
- Model Metrics

**Acceptance criteria:** formulas/tables are inspectable, caveats are visible, and
no formula errors remain.

**Risk:** Medium.

**Completion evidence (2026-05-20):**

- Added `scripts/happyco/build_property_ops_workbook.py`.
- Generated local ignored artifact
  `artifacts/happyco/excel/HappyCo_Property_Ops_Model.xlsx`.
- Workbook includes Read Me, Canonical Entities, Property Benchmarks, Inspection
  Risk, Work Order Aging, Vendor Performance, AI Recommendations, ML Feature
  Table, ML Predictions, and Model Metrics.
- Validation confirmed workbook opens, required sheets exist, key row counts are
  populated, and formula columns exist.
- `python scripts/happyco/build_property_ops_workbook.py` passed.

### Ticket 7 - PowerPoint deck and architecture diagram

**Scope:** generate `HappyCo_90_Day_Data_Strategy.pptx` and architecture diagram.

**Required ML slide:** Predictive Maintenance Risk Model, covering feature
pipeline, model output, top drivers, recommendation integration, and human review.

**Risk:** Medium.

**Completion evidence (2026-05-20):**

- Added `scripts/happyco/build_strategy_deck.py`.
- Generated local ignored artifact
  `artifacts/happyco/deck/HappyCo_90_Day_Data_Strategy.pptx`.
- Generated local ignored architecture artifact
  `artifacts/happyco/architecture/happyco_property_ops_architecture.svg`.
- Deck contains 10 slides: title, role thesis/problem, canonical model, property
  graph architecture, benchmarking/AI, ML risk proof, 30/60/90 plan, risks and
  controls, live Winston proof, and recruiter package.
- `python scripts/happyco/build_strategy_deck.py` passed and validated the PPTX
  package contains 10 slides.

### Ticket 8 - Outlook/WinCOM recruiter workflow

**Scope:** create HappyCo params for search/read/draft through local Outlook runner.

**Acceptance criteria:** draft-only by default, no committed private email content,
attachments require explicit paths, sending requires explicit params and local flag.

**Risk:** Medium-high.

**Completion evidence (2026-05-20):**

- Added `docs/runbooks/happyco/outlook-wincom/README.md`.
- Added JSON templates:
  - `happyco_search_recruiter_context.params.template.json`
  - `happyco_draft_followup.params.template.json`
  - `happyco_workflow_receipt.params.template.json`
- Templates contain no real recruiter email content.
- Templates default to `dry_run: true` and `email.send_policy: "draft"` or
  email disabled for read-only steps.
- `python -m json.tool` validation passed for all three templates.
- `cd repo-b && npm run typecheck` passed after UI status updates.

### Ticket 9 - QA, screenshots, runbook, recruiter package

**Scope:** assemble the final package, screenshots, API excerpts, artifact paths,
runbook, and recruiter follow-up draft.

**Acceptance criteria:** final status is either ready to send, ready with caveats,
or not ready with exact blockers.

**Risk:** Medium.

**Completion evidence (2026-05-20):**

- Added `docs/runbooks/happyco/final-package-runbook.md`.
- Re-ran focused backend and frontend validations:
  - `python -m pytest backend/tests/test_operator_property_ops.py -q` -> 8 passed.
  - `python -m pytest backend/tests/test_operator_v1.py backend/tests/test_operator_permits.py backend/tests/test_operator_closeout.py -q` -> 17 passed.
  - `cd repo-b && npm run typecheck` -> passed.
- Rebuilt ML, workbook, deck, and architecture artifacts.
- Wrote service-level API excerpts to `artifacts/happyco/qa/api_excerpts.json`.
- Captured `/happyco` locked and unlocked screenshots under
  `artifacts/happyco/screenshots/` via temporary Next dev server + Playwright.
- Known caveats remain documented: no live Databricks run, no production data, no
  public artifact downloads, Outlook templates only, and no full ASGI smoke
  because the clean worktree has no `backend/.env`.

### Ticket 10 - Reusable Winston proof-system backlog

**Scope:** convert HappyCo lessons into reusable Winston architecture improvements
for future role/client proof packages.

**Risk:** Low.

**Completion evidence (2026-05-20):**

- Added `docs/runbooks/happyco/reusable-proof-system-backlog.md`.
- Captured proposed reusable helpers for fixture-backed demos, ML artifact
  readers, route-scoped gates, artifact builder receipts, Outlook params
  templates, and a proof-package QA command.


### Ticket 11 - HappyCo proof package polish: clean demo, gated artifacts, automation visuals

**Tracking:** Azure Boards story `AB#380` with child tasks `381`, `382`, `383`, and `384`.

**Goal:** make `/happyco/demo` the primary external reviewer route, add a gated
artifact hub, and keep the Winston operator route as implementation evidence only.

**Implementation decisions:**

- `/happyco` remains the gated executive package and navigation hub.
- `/happyco/demo` is the clean light-theme presentation route with no Hall
  Boys/Winston shell dependency.
- `/happyco/artifacts` is manifest-first and gated; files download only through
  allowlisted `/api/happyco/artifacts/[artifactKey]` when present server-side.
- Missing deployed artifacts are labeled local/private with gated-storage upload
  pending. No fake downloads.
- Operator route gets an implementation-view banner and link to `/happyco/demo`.

**Required visuals:**

- Automation Pipeline Graph.
- Maintenance Risk Heatmap.
- Weather Risk Timeline.
- Secondary visuals when practical: Benchmark Variance Chart and Vendor
  Performance Matrix.

**Acceptance criteria:**

- `/happyco` shows primary clean-demo CTA, artifact CTA, and secondary Winston
  implementation CTA.
- `/happyco/demo` is invite-gated and has no Hall Boys shell.
- `/happyco/artifacts` is invite-gated and does not expose public artifact URLs.
- Artifact API verifies the invite cookie and uses an allowlist only.
- Visuals are synthetic/demo-safe and decision-focused.
- No claims of HappyCo production data, production model, production deployment,
  serving endpoint, or sent email.

---

## Tomorrow-deadline priority order

1. Plan expansion + gated access decision.
2. Deterministic seed data / canonical model.
3. ML feature table + local model training artifact.
4. Operator API endpoints.
5. Frontend tabbed demo using Canvas design reference.
6. Excel workbook.
7. PowerPoint deck.
8. Gated microsite/share package.
9. Outlook dry-run/draft workflow.
10. QA/runbook/screenshots.

Do not jump to UI before the data/model spine exists.

---

## Verification commands

Ticket 1:

```powershell
Test-Path docs/plans/03-implementation-plans/active/happyco-property-ops-intelligence-kit.md
Select-String -Path docs/tips.md -Pattern "HappyCo Property Ops"
```

Ticket 2:

```powershell
python -m pytest backend/tests/test_operator_property_ops.py -q
```

Ticket 3/3A:

```powershell
python -m pytest backend/tests/test_operator_property_ops.py -q
python scripts/happyco/train_property_ops_ml.py --fixture backend/app/fixtures/winston_demo/happyco_property_ops_seed.json --out artifacts/happyco/ml
```

Ticket 4:

```powershell
cd repo-b
npm run typecheck
```

---

## Next implementation prompt

```text
You are working in the Winston / Consulting_app repository. Ignore WINSTON_CODING_SESSION_INSTRUCTIONS.md.

Next optional ticket:

Implement Ticket 10 for the HappyCo Property Ops Intelligence Kit:
- extract reusable proof-package patterns into a Winston backlog note
- propose shared helpers for fixture-backed demos, ML artifact readers, gated proof pages, Excel/PPT artifact builders, and Outlook params templates
- do not change product behavior unless explicitly approved

Report proposed reusable improvements, expected owning surfaces, and risks.
```
