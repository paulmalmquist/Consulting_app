# Infra Boundary (Dry Run vs. Credentialed Infra)

This boundary keeps the execution engine design moving **before** any Supabase/Postgres credentials exist, while cleanly identifying when infra must be introduced.

---

## What can be built without Supabase credentials

You can build and validate all of the following locally and in CI:

1) **Canonical schema specifications (logical).**
   - Table specs, keys, grains, immutability rules.
2) **Capability contracts and manifests.**
   - Input/output declarations, invariants, certification gates.
3) **Bootstrap generation logic.**
   - Dry-run artifact generation to the filesystem.
4) **Lineage enforcement rules.**
   - Requiring `(run_id, dataset_version_id, rule_version_id)` across outputs.
5) **Deterministic hashing and replay testing.**
   - Canonical ordering + hashing of output data structures.
6) **Certification gating logic (mocked).**
   - You can model certification workflows and state transitions without a database.

---

## What requires Supabase/Postgres credentials

Credentials are required when you need to:

1) **Materialize schemas and constraints in a real database.**
   - DDL execution
   - physical constraints and indices
2) **Persist versioned datasets and rules.**
   - dataset manifests, rule bundles, and run envelopes as durable records
3) **Execute capability modules against real data at scale.**
   - execution engine writes run-scoped outputs
4) **Enforce access control in the serving layer.**
   - RLS policies, view-level gating, and audit controls
5) **Expose certified outputs to NLQ in production.**
   - NLQ should only query certified outputs, which becomes enforceable via DB policies.

---

## When infra should be introduced

Introduce infra only after the following are stable in dry run:

1) Canonical schema v1 is agreed and versioned.
2) At least one industry pack (here: `pe_real_estate`) is defined.
3) Capability manifests for core flows (cash ledger + waterfall) exist.
4) Certification gates and invariants are machine-checkable.
5) Replay tests confirm determinism of artifacts and result hashes.

A practical sequencing approach:

- **Phase A (no credentials):**
  - finalize schema specs, manifests, and bootstrap dry run.
- **Phase B (credentials introduced):**
  - implement DDL translation + persistence of versions and runs.
- **Phase C (serving + NLQ):**
  - enforce certified output pointers via policies/views.

---

## NLQ safety boundary (explicit rule)

Natural language access must be constrained to certified outputs:

1) NLQ surfaces may only query tables that have a current entry in `certified_output_pointer`.
2) The pointer must reference a `certification` with `certification_status = certified`.
3) Any uncertified run outputs must be treated as non-existent to NLQ.

This rule can be enforced at the contract layer now, and later enforced physically via database views and policies.
