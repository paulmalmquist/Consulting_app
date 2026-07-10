# 0020 - Sustainability T2: Fail-Closed Vocabulary (Docs Only)

- Status: Done (2026-07-10) - relay run 20260710-152523, PASS iter 1.
- Environment: Business OS / Sustainability
- Risk: Low (docs-only)
- Scope: Add three sustainability null-reason tokens to the shared fail-closed vocabulary, and a sustainability mandatory-case entry. One ticket (T2 from plan 0018).
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- ADR: `docs/adr/sustainability/0001-brownfield-extension.md` (T1, merged) - decisions 6 and 7 require these tokens.

Docs-only. No code, schema, route, or frontend change.

## Background

Plan 0018 ticket T2: "append `emission_factor_missing`, `metric_definition_missing`, `out_of_certified_scope` to `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`." The T1 ADR (decision 6) states the reader, UI, and AI copilot use these tokens with no local strings; decision 7 and Open Question 4 tie `out_of_certified_scope` to the internal-decision-support-only boundary. This ticket adds the tokens to the shared vocabulary so downstream code tickets (T4 reader, T6 registry, T10 AI) reference a single source.

The target file `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md` already has a "Null reason vocabulary" table and a "Mandatory fail-closed cases" section. This ticket extends both; it does not restructure the file.

## Scope

In scope:
- Add three rows to the "Null reason vocabulary" table in `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md`:
  - `emission_factor_missing` - no approved emission factor exists for this activity, factor-set version, and reporting period (Sustainability).
  - `metric_definition_missing` - the requested metric key is not registered in the unified metric registry (Sustainability).
  - `out_of_certified_scope` - the value or report would require an external assurance the platform does not hold; v1 is internal decision-support only (Sustainability).
- Add one "Mandatory fail-closed cases" entry for sustainability that names when each token is returned, consistent with the ADR (missing factor, unregistered metric key, out-of-certified-scope request), and states that a missing source record for an (asset, period) already maps to the existing `data_not_ingested`, and a missing released snapshot to the existing `snapshot_unavailable` (no new tokens for those two).

Out of scope (explicitly):
- Any change under `backend/`, `repo-b/`, or DB schema.
- Editing existing null_reason rows or the file's other sections beyond the additive table rows and the one new mandatory-case entry.
- Wiring these tokens into any reader, UI, or eval (those are T4/T7/T12).

## Acceptance Criteria

### Screen
Not applicable.

### API
Not applicable.

### DB/Data
Not applicable.

### AI behavior
- The three new tokens are documented as fail-closed null_reasons (not error states) so downstream services return them with `value: null`, never a fabricated number. This is a documentation outcome, verifiable by reading the added rows and mandatory-case text.

### Evals/tests
- No test suite is required for a docs-only change with zero touched paths under `backend/**`, `repo-b/**`, `rs_factory_seed/**`, or `verification/**`. The diff must contain only the single file `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md` (plus this plan file), verifiable from the review bundle `files.txt`.

### Regression guard
- The diff must not modify any file under `repo-b/`, `backend/`, or `repo-b/db/schema/`.
- The diff must not remove or rename any existing row in the "Null reason vocabulary" table (the three additions are additive only).
- After the change, `docs/plans/01-shared-standards/ai-runtime/fail-closed-rules.md` must contain the literal strings `emission_factor_missing`, `metric_definition_missing`, and `out_of_certified_scope`, each with a Sustainability-context meaning.
