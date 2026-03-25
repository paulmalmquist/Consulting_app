# Capability Contract Template (v1)

Every capability module (e.g., Accounting, Cash Flow, Waterfall) must implement this contract. The contract is designed to make certification, replay, rollback, and parity enforcement machine-checkable.

Use this as both:
- a **human-readable spec**, and
- a **machine-validated manifest** (e.g., YAML/JSON derived from the same fields).

---

## 1) Contract identity

- `capability_id`: stable identifier (e.g., `cashflow.ledger`, `waterfall.allocate`)
- `capability_name`: human-readable name
- `capability_version`: semantic version of the module logic
- `owner`: team or system of record
- `industry_scope`: list (e.g., `pe_real_estate`)

---

## 2) Execution binding (required lineage fields)

Every execution must bind the capability to:
- `tenant_id`
- `environment_id`
- `run_id`
- `dataset_version_id`
- `rule_version_id`
- `code_version` (git SHA / build id)
- `parameters_json` (must be deterministic and serializable)

**Rule:** A capability execution is invalid unless all lineage fields are present.

---

## 3) Inputs

Inputs are declared as **versioned table dependencies**.

### 3.1 Input declaration schema

Each input must declare:
- `table_name`
- `required_columns`
- `grain`
- `version_binding`:
  - one of: `dataset_version_id`, `rule_version_id`, `run_id`
- `filters` (optional, but must be deterministic)
- `role`: one of `source_of_truth`, `reference`, `derived_certified`

### 3.2 Input requirements

1) Inputs must be **fully replayable** given the same `dataset_version_id`, `rule_version_id`, `parameters_json`, and `code_version`.
2) Inputs marked `derived_certified` must be traceable to `certified_output_pointer`.
3) Capabilities may not read uncertified derived outputs from other capabilities in production or certification runs.

---

## 4) Outputs

Outputs are declared as run-scoped materializations.

### 4.1 Output declaration schema

Each output must declare:
- `table_name`
- `grain`
- `primary_key`
- required lineage columns:
  - `run_id`
  - `dataset_version_id`
  - `rule_version_id`
- `write_mode`: `append_only`
- `certification_target`: boolean
- `access_policy`: `nlq_allowed` | `restricted` | `internal_only`

### 4.2 Output requirements

1) Outputs must be **append-only**.
2) Outputs must be **functionally determined** by (inputs, rules, parameters, code version).
3) Outputs that are exposed to NLQ must set `certification_target = true` and require certification.

---

## 5) Invariants

Each capability must publish machine-checkable invariants.

### 5.1 Invariant schema

Each invariant must declare:
- `invariant_id`
- `description`
- `type`: `balance`, `conservation`, `uniqueness`, `referential`, `domain`
- `query_logic` (pseudo-SQL or executable expression)
- `severity`: `error` | `warn`

### 5.2 Required invariant categories

At minimum, capabilities that touch cash must include:

1) **Conservation of cash**
   - Example: sum of allocations equals distributable cash by scope.
2) **No double counting**
   - Example: uniqueness at the stated grain.
3) **Lineage completeness**
   - Example: no NULL `run_id`, `dataset_version_id`, `rule_version_id`.
4) **Ledger compatibility**
   - Example: signed amounts align with direction semantics.

---

## 6) Parity requirements

Parity requirements ensure confidence during system replacement.

Each contract must include:

- `parity_mode`: `required` | `optional`
- `parity_sources`: list of legacy systems or benchmarks
- `parity_tolerance`:
  - `absolute_tolerance`
  - `relative_tolerance`
- `parity_dimensions`: required reconciliation cuts (e.g., fund, deal, investor, period)

**Rule:** A run cannot be certified if parity is `required` and parity checks fail beyond tolerance.

---

## 7) Replay guarantees

Each capability must explicitly assert replay guarantees.

### 7.1 Replay guarantee statement (required)

A capability must guarantee:

1) **Determinism:** Re-running with the same lineage bindings produces identical outputs (up to ordering).
2) **Idempotence at the run boundary:**
   - Re-executing the same `run_id` must not create divergent records.
   - Acceptable patterns:
     - write-once guardrails, or
     - run_id-scoped replacement behind the scenes, still surfacing append-only facts.
3) **Stable hashing:** The capability must publish a `result_hash` derived from sorted, canonicalized output rows.

---

## 8) Certification gates

Certification is a first-class part of the contract.

### 8.1 Gate stages

Each capability must define gate criteria for:
- `candidate`
- `certified`
- `rejected`
- `revoked`

### 8.2 Minimum certification gate checklist

A run may transition to `certified` only if:
1) All `error` invariants pass.
2) Parity checks pass (if required).
3) Lineage fields are complete and valid.
4) Declared inputs are themselves certified where required.
5) Output tables have registered `certified_output_pointer` entries for allowed access policies.

---

## 9) Backward compatibility rules

Each contract must describe compatibility expectations.

### 9.1 Compatibility policy fields
- `compatibility_mode`: `backward_compatible` | `breaking_change`
- `change_notes`
- `supersedes_capability_version`
- `effective_start_date`

### 9.2 Rules

1) Backward-compatible changes must not:
   - change the grain,
   - change semantic meaning of existing columns, or
   - remove required lineage fields.
2) Breaking changes must:
   - increment major version,
   - define a migration plan, and
   - run parallel parity during certification.

---

## 10) Suggested machine-readable manifest shape (YAML)

```yaml
capability_id: waterfall.allocate
capability_name: Waterfall Allocation
capability_version: 1.0.0
owner: finance-platform
industry_scope:
  - pe_real_estate

execution_binding:
  requires:
    - tenant_id
    - environment_id
    - run_id
    - dataset_version_id
    - rule_version_id
    - code_version
    - parameters_json

inputs:
  - table_name: cash_ledger_entry
    required_columns: [fund_id, investor_id, event_date, amount, cash_flow_type, dataset_version_id]
    grain: cash event line
    version_binding: dataset_version_id
    role: source_of_truth

outputs:
  - table_name: waterfall_run_result
    grain: run x definition x scope x as_of_date
    primary_key: waterfall_run_result_id
    lineage_columns: [run_id, dataset_version_id, rule_version_id]
    write_mode: append_only
    certification_target: true
    access_policy: restricted

  - table_name: waterfall_allocation_line
    grain: run result x investor x tier
    primary_key: waterfall_allocation_line_id
    lineage_columns: [run_id, dataset_version_id, rule_version_id]
    write_mode: append_only
    certification_target: true
    access_policy: nlq_allowed

invariants:
  - invariant_id: wf_alloc_conservation
    description: Allocations must sum to distributable cash
    type: conservation
    severity: error
    query_logic: |
      distributable_cash == sum(allocated_amount)

parity:
  parity_mode: required
  parity_sources: [legacy_waterfall_engine]
  parity_tolerance:
    absolute_tolerance: 0.01
    relative_tolerance: 0.0001
  parity_dimensions: [fund_id, investor_id, as_of_date]

replay_guarantees:
  deterministic: true
  idempotent_by_run_id: true
  publishes_result_hash: true

certification_gates:
  candidate:
    requires: [lineage_complete]
  certified:
    requires:
      - invariants_error_pass
      - parity_pass
      - upstream_certified
      - certified_output_pointer_registered

backward_compatibility:
  compatibility_mode: backward_compatible
  supersedes_capability_version: 0.9.0
  effective_start_date: 2026-01-01
```
