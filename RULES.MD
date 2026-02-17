# Business OS – Core System Rules

This file defines non-negotiable architectural, accounting, security, and determinism standards.

If a feature violates these rules, it must not be implemented.

-------------------------------------
1. FINANCIAL DETERMINISM
-------------------------------------

- All financial math must run in backend Python.
- All engines must be replayable.
- No financial calculation may depend on UI state.
- No rounding shortcuts; use high precision decimals.
- All outputs must be ledger-backed.
- No opaque JSON financial summaries.

-------------------------------------
2. LEDGER DISCIPLINE
-------------------------------------

- Every capital movement must generate journal entries.
- No direct balance mutations.
- All balances are derived from ledger replay.
- GL reconciliation is mandatory.
- Period close must freeze prior entries.

-------------------------------------
3. WATERFALL ENGINE RULES
-------------------------------------

- Tier definitions must be stored structurally.
- Preferred return must support simple or compounding.
- Catch-up must be explicit tier.
- Promote percentages must be parameterized.
- Clawback must be calculable at any time.
- Engine must support:
    - American (deal-by-deal)
    - European (whole-fund)

-------------------------------------
4. SCENARIO ISOLATION
-------------------------------------

- No scenario may mutate live production data.
- All simulations require environment partition.
- Snapshots must be versioned.
- Rollback must be possible.

-------------------------------------
5. MULTI-ENTITY MODELING
-------------------------------------

- All entities must support parent-child relationships.
- All allocations must support multiple participants.
- No industry-specific math embedded in GL layer.
- Allocation engine must be abstracted.

-------------------------------------
6. PERMISSION ENFORCEMENT
-------------------------------------

- All access control enforced at API layer.
- No frontend-only permission logic.
- Support role-based and entity-scoped access.
- Support field-level segregation (PHI, trust funds).
- All permission checks must be auditable.

-------------------------------------
7. AUDIT LOGGING
-------------------------------------

- All state mutations logged.
- Logs must be append-only.
- No silent updates.
- Execution runs must log inputs + outputs.

-------------------------------------
8. INDUSTRY EXTENSIBILITY
-------------------------------------

- Legal, Healthcare, PE, Construction must share:
    - Ledger
    - Allocation engine
    - Scenario engine
- Industry modules may extend but not fork core.

-------------------------------------
9. PERFORMANCE
-------------------------------------

- Heavy math must run in job queue.
- Execution must not block request cycle.
- All engines must be idempotent.

-------------------------------------
10. MIGRATION DISCIPLINE
-------------------------------------

- All schema changes via migration files.
- No manual production schema edits.
- Migration must be reversible.
- Backfill scripts required for structural changes.

-------------------------------------
11. DOCUMENT GOVERNANCE
-------------------------------------

- Version all documents.
- Support redline diff storage.
- Enforce document ACL at API layer.
- Log all downloads for sensitive industries.

-------------------------------------
12. TRUST & SEGREGATION
-------------------------------------

- Trust accounts must be separate ledgers.
- PHI must be field-level segregated.
- Cross-entity fund mixing is prohibited.
- No pooled accounting without structural support.

-------------------------------------
13. EXECUTION ENGINE
-------------------------------------

- No stub execution allowed in production.
- All engines must produce structured output.
- Engine results must be reproducible.
- Each execution must have run ID.

-------------------------------------
14. UI RULE
-------------------------------------

- UI displays derived data only.
- UI cannot compute financial outputs.
- UI cannot bypass API security.

-------------------------------------

If unsure, default to:
- Determinism
- Auditability
- Ledger-first design
- Isolation over convenience