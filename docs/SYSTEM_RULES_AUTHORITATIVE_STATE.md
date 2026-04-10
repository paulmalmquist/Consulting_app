# Authoritative State Lockdown — System Rules

These rules are non-negotiable for any code that touches REPE financial
data (funds, investments, assets, accounting periods). They were
introduced after the Meridian verification run on
`audit/verification_run_20260410T121521Z` showed that different layers
were computing or displaying different truths depending on path.

A coding agent that violates any of these rules has degraded the audit
guarantee of the platform. Treat these as system invariants, not
guidelines.

## The eight invariants

### 1. STATE LOCK
For any released `(entity_type, entity_id, quarter)` — i.e. an
authoritative snapshot row exists with `promotion_state = 'released'` —
**every read goes through the authoritative-state contract**. No
legacy / base-scenario / SQL aggregation may be displayed for that
period under any circumstance. An untrusted or missing release renders
an explicit empty state with the null reason — never an approximation.

Enforcement:
- Backend: `app/services/re_authoritative_snapshots.assert_released_state_lock(...)` raises `StateLockViolation` if a legacy path tries to compete with a released snapshot.
- Frontend: every REPE KPI surface goes through `useAuthoritativeState`. The hook refuses to render financial values when `lockState !== "released"`.
- CI lint: `verification/lint/no_legacy_repe_reads.py` greps for forbidden symbols and fails the build.

### 2. SINGLE FETCH LAYER
All REPE financial reads (frontend and assistant) flow through one
client and one Python service:

- Frontend: `getReV2AuthoritativeState`, `getReV2AuthoritativeFundBridge` from `repo-b/src/lib/bos-api.ts`
- Backend: `re_authoritative_snapshots.get_authoritative_state`, `get_fund_gross_to_net_bridge` from `backend/app/services/re_authoritative_snapshots.py`

No other module may fetch IRR, TVPI, NOI, asset counts, fund metrics,
gross-to-net, or carry. The CI lint allowlist contains only these
symbols.

### 3. STATE ORIGIN TAG
Every value rendered by the UI or returned by the assistant carries:

- `state_origin ∈ {"authoritative", "derived", "fallback"}`
- `snapshot_version: string | null`
- `trust_status: "trusted" | "untrusted" | "missing_source"`

`derived` and `fallback` values are **never** allowed to render in a
released period. The contract guarantees `state_origin == "authoritative"`
for any successful read of a released snapshot.

### 4. PERIOD EXACT
The contract returns `period_exact: bool`. The UI must refuse to render
any value where `period_exact === false` and instead show the empty
state with `requested_quarter` vs the row's `quarter`. This prevents
silent quarter drift if a future SELECT ever returns a near-match row.

### 5. FAIL CLOSED
Any waterfall-dependent metric (carry, promote, gp_share, anything
downstream of the waterfall calculation) returns `null` plus
`null_reason: "out_of_scope_requires_waterfall"`. Both UI and assistant
must render the reason verbatim. **Approximation is forbidden** —
returning the policy carry rate (e.g. "20%") in place of an actual
period accrual is a violation.

### 6. IMMUTABILITY
Once a snapshot is promoted to `released`, its rows in
`re_authoritative_*` are immutable. Subsequent runs create new
versions. The seed and accrual writers UPSERT only into draft
snapshots; they never mutate a released row.

### 7. NO HIDDEN AGGREGATION
The assistant runtime is not allowed to run SQL aggregates
(`SUM`, `COUNT`, `AVG`) over `re_authoritative_*`, `repe_*`, or
`re_fund_*` tables for a financial answer. It composes from
authoritative-state + scope. Counts, sums, IRR, TVPI, NOI all come
from the snapshot's `canonical_metrics`.

The only exception is unscoped exploration queries (e.g. "list all
deals", "what's in the pipeline") that return rows, not aggregates.

### 8. AUDIT SURFACE MODE
Every audited page accepts `?audit_mode=1`. When set, the page renders
an inline `<AuditDrawer />` panel with:

- `snapshot_version`, `audit_run_id`, `promotion_state`, `trust_status`
- `period_exact`, `requested_quarter` vs `state.quarter`
- `null_reasons`, `formulas`, `provenance`
- direct link to `audit/meridian_hierarchy_trace/<version>/authoritative_period_state.<entity>.<id>.<quarter>.json`

The drawer reads from the same `state` object — no extra fetch — so it
cannot drift from the rendered KPI cards.

## Enforcement files

| File | Purpose |
|---|---|
| `backend/app/services/re_authoritative_snapshots.py` | Single backend fetch layer + `StateLockViolation` guard |
| `backend/app/schemas/re_authoritative.py` | Required fields: `period_exact`, `state_origin`, `requested_quarter` |
| `backend/tests/test_re_authoritative_snapshots.py` | Contract tests for the new fields and the lock helper |
| `backend/tests/test_state_lock_invariants.py` | Lint test that runs `no_legacy_repe_reads.py` against the repo |
| `verification/lint/no_legacy_repe_reads.py` | CI grep for forbidden symbols |
| `repo-b/src/lib/bos-api.ts` | Single frontend fetch layer (`getReV2AuthoritativeState`) |
| `repo-b/src/hooks/useAuthoritativeState.ts` | Only entry point for REPE KPI surfaces |
| `repo-b/src/components/re/AuditDrawer.tsx` | Audit surface mode |
| `repo-b/src/components/re/TrustChip.tsx` | Per-KPI snapshot/trust badge |

## What this replaces

These rules supersede prior patterns that allowed the same metric to be
served from multiple sources:

- `getFundBaseScenario()` — legacy fallback fetcher; banned for KPI rendering of released periods
- `computeFundBaseScenario()` — base-scenario synthesizer; permitted only for forecast/scenario tooling, never for released-period display
- `getReV2FundQuarterState()` — legacy quarter-state fetcher; permitted only for non-financial display (entity name, tags, status)
- Direct SQL aggregates over `re_authoritative_*` from assistant runtime — banned

## Adding new financial capabilities

When adding a new REPE financial metric or capability:

1. Add the metric to `canonical_metrics` in the snapshot builder (`verification/runners/meridian_authoritative_snapshot.py`).
2. Bump the snapshot version and rebuild the audit pack.
3. Read the metric in UI/assistant via the existing fetch layer — do not add a new client.
4. Add a contract test asserting `state_origin == "authoritative"` and `period_exact == True` on the round trip.

## Adding new entity types

If a future REPE entity type needs an authoritative snapshot (e.g. `loan`, `jv`):

1. Extend `_TABLE_BY_ENTITY` in `re_authoritative_snapshots.py`.
2. Extend `EntityType` in `re_authoritative.py` schemas.
3. Add the new table to `released_state_lock`'s switch.
4. Update the lint allowlist if a new fetcher name is needed.

Never relax these rules. If a new requirement appears to need an
exception, the correct response is to extend the snapshot contract,
not to bypass it.
