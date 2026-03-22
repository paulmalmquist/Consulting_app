# Consumer Credit Environment Plan

Date: 2026-03-16
Status: Draft
Owner: Paul / Rich
Related scan: Rich Consumer Credit / Private-Credit Scan (2026-03-15)

---

## Situation

The REPE environment is a three-layer system: an institutional object model (`265_repe_object_model.sql`), a workflow-hardening layer with scenarios, waterfall definitions, and entity-document bindings (`267_repe_fund_workflow.sql`), and a deterministic finance model that plugs into partitioning for snapshot/scenario isolation (`245_fin_repe.sql` + `240_fin_partitioning.sql`). It has 18 frontend pages, a full FastAPI route surface, and end-to-end test coverage.

The credit environment today (`274_credit_core.sql`) is a single-layer commercial lending workflow: cases, underwriting versions, committee decisions, facilities, covenants, watchlist, workout. Eight tables. Four frontend pages, two of which are scaffolded. The backend CRUD is sound but there is no portfolio-level modeling, no automated decisioning, no loss forecasting, no scenario management, and no partition integration.

Rich's feature requests from 2026-03-10 are explicitly consumer credit:

- Automated decisioning systems in house with credit data
- Create loss forecast
- Which attributes are most predictive for your portfolios

These are portfolio-scale operations, not case-by-case commercial lending. The current schema can stay as the origination/servicing layer, but it needs two additional layers above it to match REPE sophistication.

---

## Architecture: Three Layers (Mirroring REPE)

### Layer 1 -- Consumer Credit Object Model

New schema file: `275_credit_object_model.sql`

This is the equivalent of `265_repe_object_model.sql`. It introduces the portfolio as the top-level entity (parallel to `repe_fund`), the loan as the core asset (parallel to `repe_asset`), and the borrower as the counterparty (parallel to `repe_entity`).

**cc_portfolio** -- the fund-equivalent for consumer credit.
A named book of loans with a product type, origination channel, servicer, and status lifecycle.

| Column | Type | Notes |
|---|---|---|
| portfolio_id | uuid PK | |
| business_id | uuid FK business | |
| name | text | "Auto Prime 2025-A" |
| product_type | text | auto / personal / credit_card / mortgage / student / other |
| origination_channel | text | direct / broker / correspondent / fintech_partner |
| servicer | text | Internal or third-party servicer name |
| currency_code | text | Default USD |
| status | text | acquiring / performing / runoff / closed |
| created_at | timestamptz | |

Indexes: `(business_id, created_at DESC)`

**cc_borrower** -- counterparty profiles with risk attributes.
The entity-equivalent. Consumer credit is borrower-centric; every loan ties back here.

| Column | Type | Notes |
|---|---|---|
| borrower_id | uuid PK | |
| business_id | uuid FK business | |
| borrower_ref | text | Internal reference / anonymized ID |
| fico_at_origination | int | FICO or equivalent at time of origination |
| dti_at_origination | numeric(18,12) | Debt-to-income ratio |
| income_verified | boolean | Whether income was doc-verified |
| state_code | text | US state or jurisdiction |
| attributes_json | jsonb | Extensible: employment_length, housing_status, etc. |
| created_at | timestamptz | |

Indexes: `(business_id, fico_at_origination)`

**cc_loan** -- the asset-equivalent. Individual loans within a portfolio.

| Column | Type | Notes |
|---|---|---|
| loan_id | uuid PK | |
| portfolio_id | uuid FK cc_portfolio | |
| borrower_id | uuid FK cc_borrower | |
| loan_ref | text | Loan number |
| origination_date | date | |
| maturity_date | date | |
| original_balance | numeric(28,12) | Principal at origination |
| current_balance | numeric(28,12) | Outstanding principal |
| interest_rate | numeric(18,12) | Contractual rate |
| term_months | int | Original term |
| loan_status | text | current / delinquent_30 / delinquent_60 / delinquent_90 / default / charged_off / paid_off / prepaid |
| delinquency_bucket | text | Derived: current / 30 / 60 / 90 / 120plus |
| risk_grade | text | Internal grade at origination |
| collateral_type | text | For secured: vehicle / property / none |
| collateral_value | numeric(28,12) | Appraised value if applicable |
| attributes_json | jsonb | Extensible: LTV, payment frequency, etc. |
| created_at | timestamptz | |

Indexes: `(portfolio_id, origination_date DESC)`, `(borrower_id)`

**cc_loan_event** -- the capital-event-equivalent. Payment, delinquency, cure, prepayment, charge-off, recovery events.

| Column | Type | Notes |
|---|---|---|
| loan_event_id | uuid PK | |
| loan_id | uuid FK cc_loan | |
| event_date | date | |
| event_type | text | payment / delinquency / cure / prepayment / default / charge_off / recovery / modification |
| principal_amount | numeric(28,12) | Principal portion |
| interest_amount | numeric(28,12) | Interest portion |
| fee_amount | numeric(28,12) | Late fees, etc. |
| balance_after | numeric(28,12) | Balance post-event |
| delinquency_days | int | Days past due post-event |
| memo | text | |
| created_at | timestamptz | |

Indexes: `(loan_id, event_date DESC)`

**cc_servicer_entity** -- the entity-equivalent for the institutional graph.
Servicers, sub-servicers, trustees, originators.

| Column | Type | Notes |
|---|---|---|
| servicer_entity_id | uuid PK | |
| business_id | uuid FK business | |
| name | text | |
| entity_type | text | originator / servicer / sub_servicer / trustee / insurer |
| jurisdiction | text | |
| created_at | timestamptz | |

**cc_portfolio_servicer_link** -- the ownership-edge-equivalent.
Which entity plays which role on which portfolio, effective-dated.

| Column | Type | Notes |
|---|---|---|
| link_id | uuid PK | |
| portfolio_id | uuid FK cc_portfolio | |
| servicer_entity_id | uuid FK cc_servicer_entity | |
| role | text | master_servicer / sub_servicer / backup_servicer / trustee |
| effective_from | date | |
| effective_to | date | |
| created_at | timestamptz | |

UNIQUE: `(portfolio_id, servicer_entity_id, role, effective_from)`

---

### Layer 2 -- Workflow Hardening (Decisioning + Scenarios)

New schema file: `277_credit_workflow.sql`

This is the equivalent of `267_repe_fund_workflow.sql`. It adds scenario management, decisioning rule definitions, and document-entity bindings for credit.

**cc_portfolio expansion** -- metadata columns added via ALTER TABLE (mirroring the REPE fund expansion pattern):

- `vintage_quarter` text -- "2025Q1" cohort label
- `target_segments_json` jsonb -- target borrower segments
- `target_geographies_json` jsonb -- target states/regions
- `target_fico_min` int, `target_fico_max` int
- `target_dti_max` numeric(18,12)
- `target_ltv_max` numeric(18,12)
- `metadata_json` jsonb

**cc_portfolio_scenario** -- the scenario-equivalent. Each portfolio can have base, stress, upside, and custom loss scenarios.

| Column | Type | Notes |
|---|---|---|
| scenario_id | uuid PK | |
| portfolio_id | uuid FK cc_portfolio | |
| name | text | |
| scenario_type | text | base / stress / upside / downside / custom |
| is_base | boolean | Enforced single-base via partial unique index |
| assumptions_json | jsonb | PD curve, LGD assumptions, prepayment speed, recovery lag |
| created_at | timestamptz | |

UNIQUE: `(portfolio_id, name)`
Partial unique index: one `is_base = true` per portfolio.

**cc_decision_policy** -- the waterfall-definition-equivalent. Codified decisioning rules. This is the "automated decisioning systems in house with credit data" that Rich asked for.

| Column | Type | Notes |
|---|---|---|
| policy_id | uuid PK | |
| portfolio_id | uuid FK cc_portfolio | |
| name | text | "Standard Auto Underwriting v2" |
| policy_type | text | auto_approve / auto_decline / exception_route / manual_review |
| version_no | int | Effective-dated versioning |
| rules_json | jsonb | Ordered rule array: condition -> action -> explanation |
| is_active | boolean | Enforced single-active via partial unique index |
| effective_from | date | |
| effective_to | date | |
| created_at | timestamptz | |

UNIQUE: `(portfolio_id, name, version_no)`

The `rules_json` structure:

```json
[
  {
    "rule_id": "R001",
    "description": "Auto-approve prime borrowers",
    "condition": {
      "fico_min": 720,
      "dti_max": 0.36,
      "income_verified": true,
      "ltv_max": 0.80
    },
    "action": "auto_approve",
    "explanation_template": "Approved: FICO {fico} >= 720, DTI {dti} <= 36%, verified income, LTV {ltv} <= 80%"
  },
  {
    "rule_id": "R002",
    "description": "Exception route near-prime with high DTI",
    "condition": {
      "fico_min": 660,
      "fico_max": 719,
      "dti_min": 0.36
    },
    "action": "exception_route",
    "route_to": "senior_underwriter",
    "explanation_template": "Routed: Near-prime FICO {fico}, elevated DTI {dti} requires manual review"
  }
]
```

This directly addresses the positioning language from the scan: "decision integrity", "audit defensibility", "credit logic". Every decision produces a traceable explanation.

**cc_decision_log** -- audit trail for every automated or manual decision.

| Column | Type | Notes |
|---|---|---|
| decision_log_id | uuid PK | |
| loan_id | uuid FK cc_loan | |
| policy_id | uuid FK cc_decision_policy | |
| rule_id_matched | text | Which rule fired |
| decision | text | auto_approve / auto_decline / exception_route / manual_approve / manual_decline |
| explanation | text | Rendered from explanation_template with actual values |
| input_snapshot_json | jsonb | Frozen borrower attributes at decision time |
| decided_by | text | "system" or analyst ID |
| decided_at | timestamptz | |
| override_reason | text | If manual override of system recommendation |
| created_at | timestamptz | |

Indexes: `(loan_id, decided_at DESC)`, `(policy_id, decided_at DESC)`

**cc_exception_queue** -- the exception routing layer. This is the "underwriting exceptions" and "exception routing accuracy" from the strategy docs.

| Column | Type | Notes |
|---|---|---|
| exception_id | uuid PK | |
| loan_id | uuid FK cc_loan | |
| decision_log_id | uuid FK cc_decision_log | |
| route_to | text | Role or queue name |
| priority | text | low / medium / high / critical |
| status | text | open / assigned / resolved / escalated |
| assigned_to | text | Analyst ID |
| resolution | text | approved / declined / modified / escalated |
| resolution_note | text | |
| opened_at | timestamptz | |
| resolved_at | timestamptz | |
| sla_deadline | timestamptz | |
| created_at | timestamptz | |

Indexes: `(status, priority, opened_at)`

**Document entity links expansion** -- extend `app.document_entity_links` entity_type CHECK to include `portfolio`, `loan`, `borrower`, `servicer` (parallel to fund/investment/asset).

---

### Layer 3 -- Deterministic Finance Model (Loss Forecasting + Portfolio Analytics)

New schema file: `278_fin_credit.sql`

This is the equivalent of `245_fin_repe.sql`. It plugs into the existing `fin_partition` infrastructure for snapshot/scenario isolation and provides the tables for Rich's "create loss forecast" and "which attributes are most predictive" requests.

**cc_fin_portfolio** -- partition-aware portfolio snapshot (parallel to `fin_fund`).

| Column | Type | Notes |
|---|---|---|
| cc_fin_portfolio_id | uuid PK | |
| tenant_id | uuid FK tenant | |
| business_id | uuid FK business | |
| partition_id | uuid FK fin_partition | |
| portfolio_id | uuid FK cc_portfolio | |
| snapshot_date | date | As-of date |
| total_upb | numeric(28,12) | Unpaid principal balance |
| weighted_avg_fico | numeric(18,12) | |
| weighted_avg_rate | numeric(18,12) | |
| weighted_avg_dti | numeric(18,12) | |
| loan_count | int | |
| delinquency_rate_30 | numeric(18,12) | |
| delinquency_rate_60 | numeric(18,12) | |
| delinquency_rate_90 | numeric(18,12) | |
| default_rate | numeric(18,12) | |
| cumulative_loss_rate | numeric(18,12) | |
| status | text | draft / active / closed / archived |
| created_at | timestamptz | |

UNIQUE: `(tenant_id, business_id, partition_id, portfolio_id, snapshot_date)`

**cc_fin_vintage_cohort** -- vintage analysis (parallel to `fin_asset_investment` but aggregated by cohort).

| Column | Type | Notes |
|---|---|---|
| cohort_id | uuid PK | |
| tenant_id | uuid FK tenant | |
| business_id | uuid FK business | |
| partition_id | uuid FK fin_partition | |
| cc_fin_portfolio_id | uuid FK | |
| vintage_label | text | "2025Q1", "2025-01", etc. |
| loan_count | int | |
| original_balance | numeric(28,12) | |
| current_balance | numeric(28,12) | |
| cumulative_default_rate | numeric(18,12) | |
| cumulative_loss_rate | numeric(18,12) | |
| cumulative_prepay_rate | numeric(18,12) | |
| avg_months_on_book | numeric(18,12) | |
| created_at | timestamptz | |

**cc_fin_loss_forecast** -- loss curve projections (this is the "create loss forecast" feature).

| Column | Type | Notes |
|---|---|---|
| forecast_id | uuid PK | |
| tenant_id | uuid FK tenant | |
| business_id | uuid FK business | |
| partition_id | uuid FK fin_partition | |
| cc_fin_portfolio_id | uuid FK | |
| scenario_id | uuid FK cc_portfolio_scenario | |
| forecast_date | date | |
| horizon_months | int | |
| methodology | text | roll_rate / vintage_curve / pd_lgd / transition_matrix |
| expected_loss | numeric(28,12) | |
| expected_loss_rate | numeric(18,12) | |
| expected_recovery | numeric(28,12) | |
| net_loss | numeric(28,12) | |
| assumptions_json | jsonb | Full assumptions frozen at run time |
| created_at | timestamptz | |

**cc_fin_roll_rate_snapshot** -- transition matrix (roll-rate model), the standard consumer credit loss methodology.

| Column | Type | Notes |
|---|---|---|
| snapshot_id | uuid PK | |
| cc_fin_portfolio_id | uuid FK | |
| partition_id | uuid FK fin_partition | |
| period_start | date | |
| period_end | date | |
| from_bucket | text | current / 30 / 60 / 90 / 120plus / default |
| to_bucket | text | current / 30 / 60 / 90 / 120plus / default |
| loan_count | int | |
| balance | numeric(28,12) | |
| roll_rate | numeric(18,12) | Transition probability |
| created_at | timestamptz | |

UNIQUE: `(cc_fin_portfolio_id, partition_id, period_start, from_bucket, to_bucket)`

**cc_fin_attribute_importance** -- predictive attribute analysis (this is the "which attributes are most predictive" feature).

| Column | Type | Notes |
|---|---|---|
| importance_id | uuid PK | |
| cc_fin_portfolio_id | uuid FK | |
| partition_id | uuid FK fin_partition | |
| model_run_date | date | |
| attribute_name | text | fico_at_origination / dti / ltv / income_verified / state / term / etc. |
| importance_score | numeric(18,12) | Normalized 0-1 |
| rank | int | |
| methodology | text | gini / iv / shap / chi_squared |
| segment | text | Optional: "all", "subprime", "prime", specific vintage |
| detail_json | jsonb | Bucketed performance, IV calculation detail |
| created_at | timestamptz | |

---

## Frontend Pages (Matching REPE Depth)

Current REPE has 15+ page files across funds, deals, assets, capital, waterfalls, models, documents, controls, sustainability, portfolio. The credit workspace needs equivalent coverage.

### New routes under `/lab/env/[envId]/credit/`:

| Route | REPE Equivalent | Purpose |
|---|---|---|
| `/credit/` (existing) | `/re/` | Portfolio list with KPI strip: total UPB, delinquency rate, portfolio count, active loans |
| `/credit/portfolios/new` | `/re/funds/new` | Portfolio creation wizard: product type, channel, servicer, targets |
| `/credit/portfolios/[portfolioId]` | `/re/funds/[fundId]` | Portfolio detail: vintage chart, delinquency trend, roll rates, loss forecast |
| `/credit/loans` | `/re/assets` | Loan-level browser: filterable by status, grade, vintage, delinquency bucket |
| `/credit/loans/[loanId]` | `/re/assets/[assetId]` | Loan detail: borrower profile, event timeline, decision audit trail |
| `/credit/decisioning` | `/re/waterfalls` | Decision policy manager: active rules, exception queue metrics, policy version history |
| `/credit/decisioning/[policyId]` | `/re/waterfalls` (detail) | Policy rule editor: visual rule chain, test against sample data, activation controls |
| `/credit/exceptions` | `/re/controls` | Exception queue: open items, SLA tracking, resolution workflow |
| `/credit/performance` | `/re/portfolio` | Portfolio KPI dashboard: delinquency curves, roll rates, loss rates by vintage |
| `/credit/forecasts` | `/re/models` | Loss forecast runs: scenario selector, horizon, methodology, output comparison |
| `/credit/forecasts/[forecastId]` | `/re/models/[modelId]` | Forecast detail: assumptions, projected vs actual, vintage-level breakdown |
| `/credit/attributes` | (new, no REPE equiv) | Predictive attribute dashboard: importance rankings, segment comparison, FICO distribution |
| `/credit/documents` | `/re/documents` | Document management with portfolio/loan entity filtering |

### Hub page redesign

The current credit hub page is a flat case list. Redesign to match REPE's `ReFundListPage`:

- KPI strip at top: Portfolio Count, Total UPB, 30+ DQ Rate, Net Loss Rate, Exception Queue Depth
- Portfolio table with columns: Name, Product Type, Vintage, UPB, Loan Count, DQ Rate, Loss Rate, Status
- Create Portfolio action button
- Each row links to portfolio detail

---

## Backend API Surface

New router: `/api/credit/v2` (keep `/api/credit/v1` for the existing case-level CRUD).

| Endpoint | REPE Equivalent | Purpose |
|---|---|---|
| `GET /portfolios` | `GET /funds` | List portfolios |
| `POST /portfolios` | `POST /funds` | Create portfolio |
| `GET /portfolios/{id}` | `GET /funds/{id}` | Portfolio detail |
| `PATCH /portfolios/{id}` | `PATCH /funds/{id}` | Update portfolio |
| `GET /portfolios/{id}/loans` | `GET /funds/{id}/deals` | List loans in portfolio |
| `POST /portfolios/{id}/loans` | `POST /funds/{id}/deals` | Create loan (or bulk import) |
| `POST /portfolios/{id}/loans/import` | (new) | Bulk CSV/tape import |
| `GET /loans/{id}` | `GET /assets/{id}` | Loan detail |
| `GET /loans/{id}/events` | (new) | Loan event timeline |
| `POST /loans/{id}/events` | (new) | Record loan event |
| `GET /portfolios/{id}/scenarios` | (implicit in REPE) | List scenarios |
| `POST /portfolios/{id}/scenarios` | (implicit in REPE) | Create scenario |
| `GET /portfolios/{id}/policies` | (new) | List decision policies |
| `POST /portfolios/{id}/policies` | (new) | Create decision policy |
| `POST /loans/{id}/decide` | (new) | Run decisioning against active policy |
| `GET /exceptions` | (new) | Exception queue |
| `PATCH /exceptions/{id}` | (new) | Resolve exception |
| `POST /portfolios/{id}/forecast` | (new) | Run loss forecast |
| `GET /portfolios/{id}/roll-rates` | (new) | Roll-rate matrix for period |
| `GET /portfolios/{id}/attributes` | (new) | Attribute importance rankings |
| `GET /portfolios/{id}/vintage-cohorts` | (new) | Vintage performance curves |
| `GET /context` | `GET /context` | Resolve credit context |
| `POST /context/init` | `POST /context/init` | Initialize credit context |
| `POST /seed` | `POST /seed` | Demo workspace with sample portfolios |

---

## Partition Integration

The REPE environment uses `fin_partition` for live/scenario/snapshot isolation. The credit environment should follow the same pattern:

- Each portfolio gets a `live` partition on creation (same as REPE fund).
- Scenarios create `scenario` partitions branched from live.
- Monthly snapshots create `snapshot` partitions with frozen state.
- Loss forecasts reference specific partitions so results are reproducible.
- Roll-rate snapshots and attribute importance runs are partition-scoped.

This means `cc_fin_portfolio`, `cc_fin_vintage_cohort`, `cc_fin_loss_forecast`, `cc_fin_roll_rate_snapshot`, and `cc_fin_attribute_importance` all carry `partition_id` FK (they already do in the schema above).

---

## Seeder / Demo Data

Parallel to the REPE seeder that creates sample funds with deals, assets, and waterfall definitions, the credit seeder should create:

**Portfolio 1: "Auto Prime 2025-A"**
- Product type: auto
- 500 sample loans across 4 vintages (2024Q3, 2024Q4, 2025Q1, 2025Q2)
- FICO distribution: 680-820, weighted toward 720-760
- Mix of current, 30-day, 60-day, paid-off statuses
- One active decision policy with 4 rules
- 12 items in exception queue (3 resolved, 9 open)
- Roll-rate snapshot for last 3 months
- Base + stress scenario
- Loss forecast under each scenario

**Portfolio 2: "Personal Unsecured 2024-B"**
- Product type: personal
- 200 sample loans, higher-risk profile
- FICO distribution: 600-720
- Higher delinquency rates, some charge-offs
- Attribute importance run showing FICO and DTI as top predictors

---

## Relationship to Existing credit_cases

The existing `274_credit_core.sql` tables stay. They serve the origination and servicing workflow: intake, underwriting, committee, covenants, watchlist, workout. The new portfolio/loan model is the post-origination analytics layer.

The bridge: when a `credit_case` reaches stage `approved` and a `credit_facility` is created, a corresponding `cc_loan` can be generated in the relevant `cc_portfolio`. The case becomes the origination record; the loan becomes the performance record.

This means the existing credit hub page becomes the "Origination" tab and the new portfolio pages become the "Portfolio Analytics" tab within the same `/credit/` workspace.

---

## Implementation Sequence

### Phase 1: Object Model (Layer 1)
1. Write `275_credit_object_model.sql`
2. Write backend service + Pydantic schemas for portfolio, loan, borrower, servicer CRUD
3. Write `/api/credit/v2` router with portfolio and loan endpoints
4. Write frontend portfolio list page with KPI strip
5. Write frontend portfolio detail page (shell with tabs)
6. Write seeder with sample portfolios and loans
7. Write credit context initialization (parallel to `repe_context.py`)
8. Add `credit_initialized` flag to `app.environments` (parallel to `repe_initialized`)

### Phase 2: Decisioning + Exceptions (Layer 2)
1. Write `277_credit_workflow.sql`
2. Write decision policy service: rule evaluation engine, explanation rendering
3. Write decision log service: record every decision with frozen inputs
4. Write exception queue service: routing, assignment, SLA, resolution
5. Write `/api/credit/v2` decisioning and exception endpoints
6. Write frontend decisioning page: policy list, rule chain viewer
7. Write frontend exception queue page: filterable, sortable, resolution workflow
8. Write frontend loan detail page: decision audit trail tab
9. Expand seeder with policies, decisions, and exceptions

### Phase 3: Loss Forecasting + Analytics (Layer 3)
1. Write `278_fin_credit.sql`
2. Write partition integration: auto-create live partition on portfolio creation
3. Write scenario service: create/branch scenarios with assumptions
4. Write vintage cohort aggregation service
5. Write roll-rate calculation service: period-over-period transition matrices
6. Write loss forecast service: roll-rate methodology first, then PD/LGD
7. Write attribute importance service: IV (information value) calculation
8. Write frontend performance dashboard: delinquency curves, roll-rate heatmap
9. Write frontend forecast page: scenario comparison, projected vs actual
10. Write frontend attributes page: importance bar chart, segment drill-down
11. Expand seeder with snapshots, forecasts, and attribute runs

### Phase 4: Integration + Polish
1. Bridge origination cases to portfolio loans (case -> facility -> loan)
2. Document entity links for credit (portfolio, loan, borrower, servicer)
3. E2E test coverage matching REPE's `repe-journey.spec.ts`
4. ECC integration: exception alerts to ECC task queue, portfolio KPIs to daily brief
5. Credit workspace navigation unification: origination tab + analytics tab

---

## Positioning Language Alignment

The scan identified four candidate positioning phrases. Here is how each maps to concrete product features in this plan:

| Phrase | Feature |
|---|---|
| **Credit Logic** | `cc_decision_policy` + `rules_json` -- codified, versioned decision rules |
| **Decision Integrity** | `cc_decision_log` -- every decision traced to rule, policy version, and frozen inputs |
| **Audit Defensibility** | `cc_exception_queue` + `cc_decision_log` -- complete chain from application to resolution with timestamps |
| **Risk Awareness** | `cc_fin_attribute_importance` + `cc_fin_roll_rate_snapshot` -- quantified risk drivers and transition dynamics |

---

## Open Questions for Rich

1. **Loan tape format**: What does the inbound data look like? CSV export from a servicer platform, or API feed? This determines the bulk import endpoint shape.
2. **Decisioning complexity**: Are the rules purely threshold-based (FICO > X AND DTI < Y), or do they need scoring model integration (ML model output as an input attribute)?
3. **Loss forecast methodology preference**: Roll-rate is the standard starting point. Does Rich also want PD/LGD model-based forecasting, or is roll-rate sufficient for v1?
4. **Regulatory scope**: Is this ECOA/FCRA territory where adverse action notices are required? That would add a notice-generation feature to the decisioning layer.
5. **Portfolio granularity**: One portfolio per product type per vintage? Or one portfolio as a book that spans vintages, with vintage tracked at the loan level? (The schema supports both; the seeder needs to pick one convention.)
