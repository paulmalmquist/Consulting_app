# Minimal Canonical Schema (v1)

This schema is vendor-neutral and logical. It is designed so every certified output can be traced to **(dataset_version_id, rule_version_id, run_id)** and replayed deterministically.

## Design principles
- **Append-only facts, versioned definitions.** Corrections create new versions or reversals rather than in-place edits.
- **Run-scoped outputs.** Derived outputs are always keyed by `run_id` and reference the exact dataset and rule versions used.
- **Ledger first.** Cash movement is represented as immutable ledger entries; reporting tables are derived from them.
- **No hidden state.** Every calculation input is a versioned object.

---

## Table list, keys, grain, and immutability rules

### 1) Core tenancy and run control

#### `tenant`
- **Primary key:** `tenant_id`
- **Foreign keys:** none
- **Grain:** one row per client tenant
- **Immutability rules:** mutable for administrative fields; do not reuse `tenant_id`

Suggested columns:
- `tenant_id`
- `tenant_code` (stable external identifier)
- `tenant_name`
- `created_at`
- `status` (e.g., `active`, `suspended`)

#### `environment`
- **Primary key:** `environment_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`
- **Grain:** one row per tenant environment (e.g., `prod`, `uat`, `replay`)
- **Immutability rules:** mutable for status; identity fields append-only

Suggested columns:
- `environment_id`
- `tenant_id`
- `environment_name`
- `industry_code` (e.g., `pe_real_estate`)
- `created_at`
- `status`

#### `dataset_version`
- **Primary key:** `dataset_version_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`, `environment_id -> environment.environment_id`
- **Grain:** one row per logically consistent dataset snapshot/version
- **Immutability rules:** append-only; never update semantics, only certification state metadata

Suggested columns:
- `dataset_version_id`
- `tenant_id`
- `environment_id`
- `dataset_name` (e.g., `core_transactions`, `positions_2026q1`)
- `dataset_hash` (content hash or manifest hash)
- `as_of_date`
- `created_at`
- `created_by`
- `certification_status` (`draft`, `candidate`, `certified`, `superseded`)
- `supersedes_dataset_version_id` (nullable self-reference)

#### `rule_version`
- **Primary key:** `rule_version_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`, `environment_id -> environment.environment_id`
- **Grain:** one row per rule bundle version (waterfall rules, mapping rules, validation rules)
- **Immutability rules:** append-only; rule bodies are immutable once created

Suggested columns:
- `rule_version_id`
- `tenant_id`
- `environment_id`
- `rule_bundle_name` (e.g., `waterfall_core`, `cashflow_classification`)
- `rule_hash`
- `effective_start_date`
- `effective_end_date` (nullable)
- `created_at`
- `created_by`
- `certification_status`
- `supersedes_rule_version_id` (nullable self-reference)

#### `run`
- **Primary key:** `run_id`
- **Foreign keys:** 
  - `tenant_id -> tenant.tenant_id`
  - `environment_id -> environment.environment_id`
  - `dataset_version_id -> dataset_version.dataset_version_id`
  - `rule_version_id -> rule_version.rule_version_id`
- **Grain:** one row per execution run
- **Immutability rules:** append-only for identity and lineage fields; status fields may transition forward only

Suggested columns:
- `run_id`
- `tenant_id`
- `environment_id`
- `run_type` (`simulation`, `certification`, `production`, `replay`, `rollback`)
- `dataset_version_id`
- `rule_version_id`
- `code_version` (git SHA or build id)
- `parameters_json` (deterministic inputs such as as-of date, scenario id)
- `started_at`
- `completed_at`
- `run_status` (`running`, `succeeded`, `failed`, `superseded`)
- `certification_status` (`uncertified`, `candidate`, `certified`, `rejected`)
- `supersedes_run_id` (nullable self-reference)
- `replay_of_run_id` (nullable self-reference)

---

### 2) Fund / deal / asset hierarchy

#### `fund`
- **Primary key:** `fund_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`
- **Grain:** one row per fund
- **Immutability rules:** SCD2-style via versioning columns; do not hard-update economic terms

Suggested columns:
- `fund_id`
- `tenant_id`
- `fund_code`
- `fund_name`
- `base_currency`
- `inception_date`
- `termination_date`
- `status`
- `version_start_at`
- `version_end_at` (nullable)
- `is_current_version`

#### `deal`
- **Primary key:** `deal_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`, `fund_id -> fund.fund_id`
- **Grain:** one row per deal within a fund
- **Immutability rules:** SCD2-style for descriptive attributes; economic events go to ledgers

Suggested columns:
- `deal_id`
- `tenant_id`
- `fund_id`
- `deal_code`
- `deal_name`
- `strategy`
- `region`
- `close_date`
- `status`
- `version_start_at`
- `version_end_at` (nullable)
- `is_current_version`

#### `asset`
- **Primary key:** `asset_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`, `deal_id -> deal.deal_id`
- **Grain:** one row per asset/property
- **Immutability rules:** SCD2-style for descriptors; valuations and cash flows are append-only facts

Suggested columns:
- `asset_id`
- `tenant_id`
- `deal_id`
- `asset_code`
- `asset_name`
- `asset_type` (e.g., `multifamily`, `industrial`)
- `location`
- `acquisition_date`
- `disposition_date` (nullable)
- `status`
- `version_start_at`
- `version_end_at` (nullable)
- `is_current_version`

---

### 3) Investor structure and commitments

#### `investor`
- **Primary key:** `investor_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`
- **Grain:** one row per investor/LP/GP entity
- **Immutability rules:** SCD2-style for descriptors

Suggested columns:
- `investor_id`
- `tenant_id`
- `investor_code`
- `investor_name`
- `investor_type` (`lp`, `gp`, `co_invest`, `manager`)
- `tax_profile`
- `version_start_at`
- `version_end_at` (nullable)
- `is_current_version`

#### `commitment`
- **Primary key:** `commitment_id`
- **Foreign keys:** 
  - `tenant_id -> tenant.tenant_id`
  - `fund_id -> fund.fund_id`
  - `investor_id -> investor.investor_id`
- **Grain:** one row per investor commitment to a fund share class
- **Immutability rules:** append-only for economic terms; amendments create new rows with `supersedes_commitment_id`

Suggested columns:
- `commitment_id`
- `tenant_id`
- `fund_id`
- `investor_id`
- `share_class`
- `commitment_amount`
- `commitment_currency`
- `commitment_date`
- `effective_start_date`
- `effective_end_date` (nullable)
- `supersedes_commitment_id` (nullable self-reference)
- `is_current_version`

---

### 4) Canonical cash ledger (time-series cash flows)

#### `cash_ledger_entry`
- **Primary key:** `cash_ledger_entry_id`
- **Foreign keys:** 
  - `tenant_id -> tenant.tenant_id`
  - `fund_id -> fund.fund_id`
  - `deal_id -> deal.deal_id` (nullable)
  - `asset_id -> asset.asset_id` (nullable)
  - `investor_id -> investor.investor_id` (nullable)
  - `dataset_version_id -> dataset_version.dataset_version_id`
- **Grain:** one immutable cash event line at the finest atomic level
- **Immutability rules:** append-only; corrections require reversal entries linked by `reverses_cash_ledger_entry_id`

Suggested columns:
- `cash_ledger_entry_id`
- `tenant_id`
- `fund_id`
- `deal_id` (nullable)
- `asset_id` (nullable)
- `investor_id` (nullable)
- `event_date`
- `posting_ts`
- `cash_flow_type` (`contribution`, `distribution`, `fee`, `expense`, `income`, `transfer`)
- `amount`
- `currency`
- `direction` (`inflow`, `outflow`)
- `external_reference`
- `dataset_version_id`
- `lineage_json` (raw source ids)
- `reverses_cash_ledger_entry_id` (nullable self-reference)

> This single table supports time-series cash flows, contributions, and distributions, while keeping atomic traceability.

---

### 5) Waterfall definition and results

#### `waterfall_definition`
- **Primary key:** `waterfall_definition_id`
- **Foreign keys:** `tenant_id -> tenant.tenant_id`, `fund_id -> fund.fund_id`, `rule_version_id -> rule_version.rule_version_id`
- **Grain:** one row per waterfall definition version for a fund/share class
- **Immutability rules:** append-only; link supersessions rather than update logic

Suggested columns:
- `waterfall_definition_id`
- `tenant_id`
- `fund_id`
- `share_class`
- `rule_version_id`
- `definition_hash`
- `effective_start_date`
- `effective_end_date` (nullable)
- `supersedes_waterfall_definition_id` (nullable self-reference)
- `is_current_version`

#### `waterfall_tier`
- **Primary key:** `waterfall_tier_id`
- **Foreign keys:** `waterfall_definition_id -> waterfall_definition.waterfall_definition_id`
- **Grain:** one row per tier within a waterfall definition
- **Immutability rules:** append-only within a definition version

Suggested columns:
- `waterfall_tier_id`
- `waterfall_definition_id`
- `tier_sequence`
- `tier_type` (`pref_return`, `catch_up`, `carried_interest`, `return_of_capital`)
- `hurdle_rate`
- `allocation_rule_json`

#### `waterfall_run_result`
- **Primary key:** `waterfall_run_result_id`
- **Foreign keys:**
  - `tenant_id -> tenant.tenant_id`
  - `run_id -> run.run_id`
  - `waterfall_definition_id -> waterfall_definition.waterfall_definition_id`
  - `dataset_version_id -> dataset_version.dataset_version_id`
  - `rule_version_id -> rule_version.rule_version_id`
- **Grain:** one row per run per definition per calculation scope (fund/share class/as-of)
- **Immutability rules:** append-only; superseded by later certified runs

Suggested columns:
- `waterfall_run_result_id`
- `tenant_id`
- `run_id`
- `waterfall_definition_id`
- `dataset_version_id`
- `rule_version_id`
- `as_of_date`
- `calculation_scope` (e.g., `fund_level`, `deal_level`)
- `result_hash`
- `certification_status`

#### `waterfall_allocation_line`
- **Primary key:** `waterfall_allocation_line_id`
- **Foreign keys:**
  - `waterfall_run_result_id -> waterfall_run_result.waterfall_run_result_id`
  - `investor_id -> investor.investor_id`
  - `waterfall_tier_id -> waterfall_tier.waterfall_tier_id`
- **Grain:** one allocation line per investor per tier per run result
- **Immutability rules:** append-only; never update amounts, supersede via run lineage

Suggested columns:
- `waterfall_allocation_line_id`
- `waterfall_run_result_id`
- `investor_id`
- `waterfall_tier_id`
- `allocated_amount`
- `allocated_currency`
- `allocation_basis_json`

---

### 6) Certification and output gating

#### `certification`
- **Primary key:** `certification_id`
- **Foreign keys:**
  - `tenant_id -> tenant.tenant_id`
  - `environment_id -> environment.environment_id`
  - `run_id -> run.run_id`
  - `dataset_version_id -> dataset_version.dataset_version_id`
  - `rule_version_id -> rule_version.rule_version_id`
- **Grain:** one row per certification decision for a run
- **Immutability rules:** append-only decisions; subsequent decisions reference prior ones

Suggested columns:
- `certification_id`
- `tenant_id`
- `environment_id`
- `run_id`
- `dataset_version_id`
- `rule_version_id`
- `certification_status` (`candidate`, `certified`, `rejected`, `revoked`)
- `decided_at`
- `decided_by`
- `decision_notes`
- `supersedes_certification_id` (nullable self-reference)

#### `certified_output_pointer`
- **Primary key:** `certified_output_pointer_id`
- **Foreign keys:**
  - `tenant_id -> tenant.tenant_id`
  - `certification_id -> certification.certification_id`
  - `run_id -> run.run_id`
- **Grain:** one row per certified output table/materialization pointer
- **Immutability rules:** append-only; new certifications create new pointers

Suggested columns:
- `certified_output_pointer_id`
- `tenant_id`
- `certification_id`
- `run_id`
- `output_table_name`
- `output_version` (often the `run_id`)
- `access_policy` (`nlq_allowed`, `restricted`, `internal_only`)

This table is the **hard boundary** for natural language access: NL interfaces should only read outputs that are referenced by a `certified_output_pointer` with `access_policy = nlq_allowed`.

---

## Minimal foreign key map (summary)
- `environment.tenant_id -> tenant.tenant_id`
- `dataset_version.(tenant_id, environment_id) -> tenant, environment`
- `rule_version.(tenant_id, environment_id) -> tenant, environment`
- `run.(tenant_id, environment_id, dataset_version_id, rule_version_id) -> tenant, environment, dataset_version, rule_version`
- `deal.fund_id -> fund.fund_id`
- `asset.deal_id -> deal.deal_id`
- `commitment.(fund_id, investor_id) -> fund, investor`
- `cash_ledger_entry.(fund_id, deal_id, asset_id, investor_id, dataset_version_id) -> fund, deal, asset, investor, dataset_version`
- `waterfall_definition.(fund_id, rule_version_id) -> fund, rule_version`
- `waterfall_tier.waterfall_definition_id -> waterfall_definition.waterfall_definition_id`
- `waterfall_run_result.(run_id, waterfall_definition_id, dataset_version_id, rule_version_id) -> run, waterfall_definition, dataset_version, rule_version`
- `waterfall_allocation_line.(waterfall_run_result_id, investor_id, waterfall_tier_id) -> waterfall_run_result, investor, waterfall_tier`
- `certification.(run_id, dataset_version_id, rule_version_id) -> run, dataset_version, rule_version`
- `certified_output_pointer.(certification_id, run_id) -> certification, run`

---

## Immutability and rollback rules (global)

1) **Never hard-delete economic facts.**
   - Tables: `cash_ledger_entry`, `waterfall_run_result`, `waterfall_allocation_line`, `certification`, `certified_output_pointer`.
   - Corrections must be represented using:
     - reversal links (e.g., `reverses_cash_ledger_entry_id`), and/or
     - supersession references (e.g., `supersedes_run_id`, `supersedes_certification_id`).

2) **Rollbacks are new runs, not rewrites.**
   - A rollback is represented as a new `run` with `run_type = rollback` and `supersedes_run_id` pointing at the run being rolled back.
   - Certified pointers are moved by adding a new `certification` and `certified_output_pointer` that supersede prior certifications.

3) **All derived outputs must be run-scoped and lineage-complete.**
   - Any derived table must include `run_id`, `dataset_version_id`, and `rule_version_id`.

4) **Certification gates access.**
   - Consumer surfaces (especially natural language query) must only read outputs referenced by `certified_output_pointer`.
