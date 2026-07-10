# 0019 - Sustainability T1: Brownfield Extension ADR (Docs Only)

- Status: Done (2026-07-10) - delivered via Coding Relay run 20260710-151046-0019-sustainability-t1-b, PASS on iteration 1. Deliverable ADR: `docs/adr/sustainability/0001-brownfield-extension.md`.
- Environment: Business OS / Sustainability
- Risk: Low (docs-only)
- Scope: Write the T1 deliverable from the approved master plan - the sustainability capability inventory ADR - and mark T1 done in that master plan.
- Master plan: `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`
- Owning surface: `agents/architect.md` (ADR authorship); downstream implementation tickets (T2-T12) stay out of scope for this run.

This ticket does not touch code, schema, routes, or the frontend. It produces one new ADR file and a status update to the master plan.

## Background

Plan 0018 (`docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md`, adopted via PR #513) already inventoried the existing REPE-scoped sustainability capability and sequenced tickets T1-T12. T1 is:

> add `docs/adr/sustainability/0001-brownfield-extension.md` recording that v1 extends the existing REPE `sus_*` capability into BOS via a governed authoritative layer; freeze scope boundaries.

That ADR file does not exist yet on `origin/main`. A separate, unreconciled draft (`docs/adr/sustainability/001-brownfield-extension.md`, note the different number format) exists only as an untracked file in an unrelated stale checkout and is not part of this repo's tracked history. It predates and does not reference the real `re_sustainability*`/`sus_*` code, and must not be used as a source for this ADR - plan 0018's own repo-verified inventory is the source of truth.

Operator direction for this ADR (must be recorded as a frozen decision): sustainability v1 ships as its own environment behind the login - a dedicated Business OS environment, not embedded in the shared REPE workspace shell (`RepeWorkspaceShell`) or any other shared app chrome. This resolves Open Question 5 in plan 0018 ("first demo environment").

## Scope

In scope:
- Write `docs/adr/sustainability/0001-brownfield-extension.md` as a standard ADR (context, decision, consequences) that:
  - Records the existing `sus_*`/`re_sustainability*` capability inventory from plan 0018 section 1, with file paths.
  - States the frozen decision that v1 is a new standalone Business OS environment (not the existing REPE-embedded `SustainabilityWorkspace.tsx` page, not wrapped in `RepeWorkspaceShell`/`DomainWorkspaceShell`).
  - States the frozen scope boundary between the existing REPE-embedded sustainability page (kept as-is, not modified by this ADR) and the new standalone environment (net-new UI, reusing existing backend services/schema).
  - Resolves or explicitly defers each of the 5 open questions in plan 0018 section 10, noting which are frozen now vs. deferred to a later ticket.
  - Lists T2-T12 from plan 0018 as the approved follow-on sequence, unchanged.
- Update `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md` to mark T1 done, with a dated note and a pointer to the new ADR path.

Out of scope (explicitly, for this run):
- T2 (fail-closed vocabulary edit)
- T3 (authoritative schema migration)
- T4-T12 (reader service, routes, UI scaffold, evidence drawer, report center integration, AI grounding, intake, eval suite)
- Any change to `repo-b/db/schema/`, `backend/app/`, or `repo-b/src/`
- Any change to the existing REPE-embedded sustainability page or `SustainabilityWorkspace.tsx`
- Production deployment or merge

## Acceptance Criteria

### Screen
Not applicable.

### API
Not applicable.

### DB/Data
Not applicable.

### AI behavior
Not applicable.

### Evals/tests
- No test suite is required to run for a docs-only change with zero touched paths under `backend/**`, `repo-b/**`, `rs_factory_seed/**`, or `verification/**`. The diff must contain only `docs/**` paths, which the review bundle's `files.txt` can verify directly.

### Regression guard
- The diff must not modify any file under `repo-b/src/`, `backend/app/`, or `repo-b/db/schema/`.
- The diff must not modify the existing `docs/adr/sustainability/001-brownfield-extension.md` draft path (different filename, different number format) if it happens to be present in the worktree - leave it untouched.
- `docs/adr/sustainability/0001-brownfield-extension.md` must exist after the change and must reference `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md` by path at least once.
- `docs/plans/03-implementation-plans/active/0018-sustainability-tool-planning.md` must contain a marker showing T1 is done (e.g. a "Ticket status" or "T1: done" line) after the change.
