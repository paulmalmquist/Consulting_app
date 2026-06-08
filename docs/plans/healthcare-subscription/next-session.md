# Next session — Healthcare Subscription Analytics

Copy-paste prompt for the next coding session.

---

Objective: Build Phase 2 of the Healthcare Subscription Analytics env — the Funnel and
Cohorts surfaces — only if approved. The Exec Overview slice (HHA-1) is shipped.

Required reading first:
- `docs/plans/healthcare-subscription/architecture.md` (serving model, tenancy, seeded-vs-derived)
- `docs/plans/healthcare-subscription/design-adaptation.md` (standalone, NO app shell — hard rule)
- `docs/plans/healthcare-subscription/ai-behavior.md` (only if touching the copilot)
- `docs/plans/03-implementation-plans/active/0005-healthcare-subscription-analytics-lab.md`
- `Hone_work/phi_boundary_rationale.md` (small-cell suppression rationale)

Files to inspect:
- `backend/app/routes/hha.py`, `backend/app/services/hha.py`, `backend/app/schemas/hha.py`
- `repo-b/db/schema/10013_hha_healthcare_subscription_core.sql` (tables already seeded)
- `repo-b/src/components/healthcare-subscription/OverviewClient.tsx` (style system to reuse)
- `repo-b/src/lib/healthcare-subscription/client.ts`

Step plan (Funnel + Cohorts):
1. Add `get_funnel(env_id)` and `get_cohorts(env_id)` to `services/hha.py` (set_config('app.env_id') + WHERE env_id; money at the edge; **mask cohorts where `is_suppressed` — return a masked marker, never the underlying counts**).
2. Add `GET /api/hha/v1/funnel` and `/cohorts` in `routes/hha.py`; add Pydantic shapes in `schemas/hha.py`.
3. Add client fns in `lib/healthcare-subscription/client.ts`.
4. Add standalone pages `…/healthcare-subscription/funnel/page.tsx` and `…/cohorts/page.tsx` + components. NO app shell. Reuse the `C` palette + card/drawer primitives from `OverviewClient.tsx` (consider extracting them into a shared `primitives.tsx` in the components folder).
5. Extend `backend/tests/test_hha.py`: funnel ordering, suppression masking (assert no suppressed counts leak), money cast.

Acceptance criteria:
- Funnel page renders 6 stages in order with conversion %; channel CAC visible.
- Cohort grid renders retention by month; cells with cohort_size <11 are masked with a stated reason; no underlying count is sent to the client.
- `npm run typecheck` clean; `pytest --noconftest backend/tests/test_hha.py` green.

Out of scope unless approved: event-level grain (Phase 3), copilot (Phase 4), any deploy.
