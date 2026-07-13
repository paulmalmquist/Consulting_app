# 0026 - Sustainability T6: Register Governed Metrics in the Unified Registry

- Status: Done (2026-07-13) - relay-built with tests ON (backend-pytest-scoped PASS 51-71s, the suite that used to time out). MAX_ITER only on 2 CI-dependent criteria the artifact bundle cannot evidence (D4 schema-gate, targeted-pytest command string); 0 unmet, no defect. Verified by hand.
- Environment: Business OS / Sustainability
- Risk: Medium (additive seed migration + one dispatch entry)
- Scope: Register the v1 sustainability metrics in the unified metric registry so the AI copilot can name, ground on, and fail closed for them. One ticket (T6 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- Depends on: T3 (schema, applied), T4 (reader), T5 (routes) - all merged.

## Background (verified against the tree)

The unified registry is **DB-driven**, not a Python constant list. `backend/app/services/unified_metric_registry.py::_load_from_db` reads `semantic_metric_def` (`WHERE business_id = %s AND is_active = true`). So "register the metrics" means seeding `semantic_metric_def` rows, not editing a list.

- Table: `repo-b/db/schema/340_semantic_catalog.sql`. `sql_template` is `NOT NULL`. Routing columns (`query_strategy`, `service_function`, `metric_family`, `aliases`, `polarity`, `time_behavior`, `format_hint_fe`, `allowed_breakouts`) are seeded in the `448_metric_routing_seed.sql` pattern.
- `query_strategy` values: `template | semantic | service | computed`. The registry's `validate()` requires a `service` metric's `service_function` to exist in `_get_service_map()`, which today only maps `portfolio_kpis` and `fund_metrics`.

Sustainability metric values come from the **T4 authoritative reader**, not from raw SQL. Reading them via a `semantic` `sql_template` would bypass the single-fetch layer and violate the authoritative-state contract (ADR 0001, decision 5). So these metrics must use `query_strategy = 'service'` routed to the reader, which means T6 is two coupled pieces: the seed rows AND a dispatch-map entry.

## Scope

In scope:

1. **Dispatch entry** in `backend/app/services/unified_metric_registry.py`: add one entry to `_get_service_map()` mapping `sustainability_authoritative` to a callable that resolves a governed sustainability metric through `re_sustainability_authoritative` (the T4 reader). Do not change any existing entry or the registry's contract/validation logic.
2. **Seed migration** `repo-b/db/schema/619_sus_metric_registry_seed.sql` (next feature number; 618 is T3's) inserting `semantic_metric_def` rows for the v1 metric keys from plan 0018:
   - `scope1_tco2e`, `scope2_location_tco2e`, `scope2_market_tco2e`, `scope3_tco2e`, `energy_intensity_kwh_per_sqft`, `water_intensity_gal_per_sqft`.
   - Each row: `query_strategy = 'service'`, `service_function = 'sustainability_authoritative'`, `metric_family = 'sustainability'`, a real `unit` (`tco2e`, `kwh_per_sqft`, `gal_per_sqft`), `aggregation`, `polarity` (emissions and intensities are `down_good`), `time_behavior`, `aliases` (natural-language phrasings the copilot will hear), `allowed_breakouts`, and a non-null `sql_template` (the column is NOT NULL; use a comment-only placeholder such as `'-- served via sustainability_authoritative reader'` since routing is by service, not SQL).
   - Idempotent: guard with `ON CONFLICT (business_id, metric_key, version) DO NOTHING` (the table's unique key) so re-running the migration is safe.
   - Seed against the same demo `business_id` the existing seeds use (`a1b2c3d4-0001-0001-0001-000000000001`).

Out of scope (explicit):
- The AI copilot wiring itself (T10 consumes this registry; it is a separate ticket).
- Any change to the T4 reader, T5 routes, or the T3 schema.
- Any change to existing `semantic_metric_def` rows, existing dispatch entries, or the registry's validation logic.
- Applying the migration to production (done separately after merge).

## Acceptance Criteria

### Screen
Not applicable.

### API
Not applicable (no route change; T5 already exposes the reader).

### DB/Data
- A new `repo-b/db/schema/619_sus_metric_registry_seed.sql` exists (feature band, next after 618) and inserts `semantic_metric_def` rows for all six metric keys: `scope1_tco2e`, `scope2_location_tco2e`, `scope2_market_tco2e`, `scope3_tco2e`, `energy_intensity_kwh_per_sqft`, `water_intensity_gal_per_sqft`.
- Every seeded row sets `query_strategy = 'service'`, `service_function = 'sustainability_authoritative'`, `metric_family = 'sustainability'`, a non-null `unit`, a non-null `sql_template`, and a non-empty `aliases` set.
- The insert is idempotent (`ON CONFLICT ... DO NOTHING` on the table's unique key), and the migration is additive only: no `DROP`, no `UPDATE`/`DELETE` of existing rows.
- The migration applies cleanly on the DB Schema Gate CI job.

### AI behavior
- Every seeded metric routes through the T4 authoritative reader rather than raw SQL, so a value the reader cannot serve surfaces its `null_reason` instead of a fabricated number. `polarity` is set so the copilot does not describe rising emissions as an improvement.
- `_get_service_map()` gains exactly one new entry, `sustainability_authoritative`, so a `service`-strategy sustainability metric passes the registry's own `validate()` (which rejects a `service` metric whose `service_function` is not in the dispatch map).

### Evals/tests
- A new test `backend/tests/test_sustainability_metric_registry.py` asserts, without a real DB: (1) `_get_service_map()` contains `sustainability_authoritative` and its value is callable; (2) a `MetricContract` built for each of the six keys with `query_strategy='service'` and `service_function='sustainability_authoritative'` passes the registry's `validate()` with no issues naming those keys; (3) the dispatch callable resolves a metric through `re_sustainability_authoritative` (monkeypatched) and returns its `null_reason` unchanged when the reader reports one (no fabricated number).
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_sustainability_metric_registry.py -q` pass.

### Regression guard
- Only `backend/app/services/unified_metric_registry.py` (additive: one dispatch entry + its import), the new `repo-b/db/schema/619_sus_metric_registry_seed.sql`, the new test, and this plan are changed.
- No existing dispatch entry, existing `semantic_metric_def` row, `MetricContract` field, or registry validation rule is modified. `re_sustainability_authoritative.py`, the T5 routes, and `618_sus_authoritative.sql` are untouched.
