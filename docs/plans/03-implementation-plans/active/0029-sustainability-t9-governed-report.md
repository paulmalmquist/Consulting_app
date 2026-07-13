# 0029 - Sustainability T9: Governed Report Bundle (reconciles with the dashboard)

- Status: Done (2026-07-13) - relay BLOCKED (exit 5) because the builder strayed into an unrelated auth file (oidcPkce.ts). Codex was right; the auth change was dropped entirely, not overridden. T9 work itself verified clean: 0 SQL in the report service, legacy reporter untouched, additive route, 4 backend + 11 frontend tests pass.
- Environment: Business OS / Sustainability
- Risk: Medium (new backend endpoint + service; additive)
- Scope: An evidence-backed sustainability report that is read from the same governed source as the dashboard, so the two cannot disagree. One ticket (T9 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md` (decision 5, single fetch layer).
- Depends on: T4 reader, T5 routes, T6 registry, T7 workspace (all merged).

## The problem this ticket exists to avoid (verified against the tree)

Plan 0018 assumed the report center could be reused as-is. It cannot, and the reason matters:

`backend/app/services/re_sustainability_reporting.py::build_report_payload` is **fund-scoped and legacy-sourced**. It reads `sus_portfolio_footprint_v` and the `re_sustainability` service directly (`from app.services import re_sustainability`, `FROM sus_portfolio_footprint_v`). It **never calls the T4 authoritative reader**. It even asserts transparency by citing the raw tables ("All values are reproducible from `sus_utility_monthly`, `sus_asset_emissions_annual` ...").

If the new environment's report is wired through that service, the **report and the dashboard can show different numbers for the same metric**: the dashboard reads released authoritative snapshots (fail-closed, versioned), while the report reads raw aggregates (never null, no snapshot, no trust status). That is precisely the failure plan 0018's own acceptance test 4 names ("Dashboard and report values reconcile exactly") and it violates the single-fetch-layer rule in ADR 0001 decision 5.

**So T9 does not reuse `build_report_payload`.** It adds a governed report bundle that reads the same T4 reader the dashboard reads. The legacy fund reports stay exactly as they are, for the legacy REPE surface.

## Scope

In scope:

1. **Service** `backend/app/services/re_sustainability_report.py` (new file; do not modify `re_sustainability_reporting.py`):
   - `build_governed_report(*, business_id, env_id, entity_scope, period_key, metric_family, snapshot_version=None) -> dict`.
   - It obtains every number by calling `re_sustainability_authoritative.get_authoritative_state(...)`. It performs **no SQL of its own** and no arithmetic on metric values.
   - Returns: the governance header (`snapshot_version`, `promotion_state`, `trust_status`, `period_exact`, top-level `null_reason`), the `metrics` list exactly as the reader returned it (value or `null` + `null_reason`, unit), the `evidence` rows, and a `generated_at` timestamp.
   - **Fail-closed**: when the reader reports `snapshot_unavailable`, the bundle is returned with that `null_reason`, an empty `metrics` list, and **no fabricated totals**. It never falls back to the legacy tables to "fill in" a number.
2. **Route**: add `GET /api/re/v2/sustainability/authoritative/report` to `backend/app/routes/re_sustainability.py` (additive, same `/authoritative/*` group as T5), delegating to the new service. Reuse the existing `_to_http` mapping. A response model goes in the existing `backend/app/schemas/re_sustainability_authoritative.py` (created by T5).
3. **Frontend**: a "Report" affordance on the T7 workspace (`BosSustainabilityWorkspace.tsx`) that fetches the governed report via an additive `bos-api` export and renders it, showing the same `snapshot_version` / `trust_status` the dashboard shows. A metric that is null in the dashboard is null in the report, with the same `null_reason`.

Out of scope (explicit):
- Any change to `re_sustainability_reporting.py`, the legacy `/funds/{fund_id}/reports/{report_key}` route, the `ReportKey` bundles, or the legacy REPE report center. Those keep serving the legacy surface unchanged.
- Server-side file export (XLSX/PDF), scheduled reports, the AI copilot (T10), any write path.
- Any change to the T4 reader, T5 routes, T6 registry, or the schema.

## Acceptance Criteria

### Screen
- The T7 workspace exposes a report view that renders the governed bundle, showing `snapshot_version`, `promotion_state`, and `trust_status`.
- A metric that renders a `null_reason` on the dashboard renders **the same `null_reason`** in the report. Neither shows a number the other does not.
- When the snapshot is unavailable, the report renders an explicit unavailable state naming the `null_reason` and shows no totals.

### API
- `GET /api/re/v2/sustainability/authoritative/report` exists on the sustainability router and returns the governed bundle (governance header + `metrics` + `evidence` + `generated_at`).
- The existing `/funds/{fund_id}/reports/{report_key}` route and `re_sustainability_reporting.py` are **unchanged**.

### DB/Data
- `re_sustainability_report.py` contains **no SQL**: it issues no `get_cursor()` call and references no `sus_` table name directly. Every value it returns came from `re_sustainability_authoritative`.

### AI behavior
- The report cannot disagree with the dashboard, because both read the same governed reader. The service performs no arithmetic on metric values and has no fallback path to the legacy tables; an unavailable snapshot yields `null_reason` and an empty `metrics` list rather than a number sourced from anywhere else.

### Evals/tests
- New `backend/tests/test_re_sustainability_report.py`, with `re_sustainability_authoritative.get_authoritative_state` monkeypatched (no DB), asserts: (1) the bundle carries the reader's `snapshot_version` / `trust_status` / `promotion_state`; (2) **the reconciliation test** - for the same mocked reader payload, every `(metric_key, value, null_reason)` in the report bundle equals what the reader returned, so report and dashboard cannot diverge; (3) a `snapshot_unavailable` reader payload yields a bundle with that `null_reason`, an empty `metrics` list, and no fabricated total; (4) the service issues no database call (assert `get_cursor` is never invoked).
- `cd backend && python -m ruff check app tests` and `python -m pytest tests/test_re_sustainability_report.py -q` pass; `cd repo-b && npm run lint && npm run typecheck && npm run test:unit` pass.

### Regression guard
- Only these are added/changed: `backend/app/services/re_sustainability_report.py` (new), the additive route in `backend/app/routes/re_sustainability.py`, a response model appended to `backend/app/schemas/re_sustainability_authoritative.py`, the new backend test, the report affordance in `BosSustainabilityWorkspace.tsx` plus an additive `bos-api` export and its test, and this plan.
- `re_sustainability_reporting.py`, `re_sustainability.py`, the T4 reader, the T5 route handlers, all schema files, and the legacy REPE sustainability surface are untouched.
