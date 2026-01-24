# Environment Bootstrap Flow (Dry Run)

This flow spins up a tenant environment **without connecting to any database**. It produces:
- canonical schema specs,
- capability manifests, and
- a certification checklist.

It is explicitly designed to be deterministic and replayable.

---

## High-level boot sequence

### Step 0 — Inputs
A client provides:
- `tenant_code`
- `environment_name` (e.g., `prod`, `uat`)
- `industry_code` (e.g., `pe_real_estate`)
- `selected_capabilities` (e.g., `accounting`, `cashflow`, `waterfall`)
- `as_of_date`

### Step 1 — Resolve industry pack
The bootstrapper loads an **industry pack** that defines:
- required canonical tables,
- default capability set,
- mandatory invariants,
- default certification gates.

### Step 2 — Resolve capability manifests
For each selected capability:
1) load the capability contract template,
2) bind inputs and outputs to canonical tables,
3) generate a capability manifest with lineage requirements.

### Step 3 — Generate artifacts (files only)
The bootstrapper writes:
1) `artifacts/bootstrap_v1/<tenant_code>/<environment_name>/schema/`:
   - canonical table specs
2) `artifacts/bootstrap_v1/<tenant_code>/<environment_name>/manifests/`:
   - capability manifests
3) `artifacts/bootstrap_v1/<tenant_code>/<environment_name>/certification/`:
   - certification checklist
4) `artifacts/bootstrap_v1/<tenant_code>/<environment_name>/logs/`:
   - dry run execution log

### Step 4 — Emit run envelope
The bootstrapper emits a run envelope stub that future execution engines can use:
- `run_id` (generated)
- `dataset_version_id` (generated placeholder)
- `rule_version_id` (generated placeholder)
- `code_version` (`dry-run`)

---

## Dry-run bootstrap script (reference implementation)

The script below is intentionally simple and filesystem-only. It is safe to run without credentials.

> Location: `repo-c/scripts/bootstrap_v1_dry_run.py`

Key properties:
- no DB connections,
- deterministic outputs given the same inputs,
- explicit lineage binding fields.

---

## Expected artifacts

### 1) Schema specs
Each table is emitted as a small JSON spec with:
- grain
- keys
- immutability mode
- required lineage fields (where applicable)

### 2) Capability manifests
Each capability manifest includes:
- contract identity
- lineage requirements
- declared inputs and outputs
- invariants
- certification gates

### 3) Certification checklist
A flat checklist that operations or certification workflows can follow, including:
- dataset certification prerequisites
- rule certification prerequisites
- invariant and parity checks
- NLQ gating steps (certified output pointer requirements)

---

## Replay and rollback behavior (in the bootstrap phase)

Even though this is a dry run, we model the behavior needed later:

1) **Replay:**
   - Running the script twice with the same inputs should produce identical manifests and schema specs.
2) **Rollback:**
   - Rollback is modeled as generating a new run envelope that references prior run envelopes (by id) without deleting earlier artifacts.
