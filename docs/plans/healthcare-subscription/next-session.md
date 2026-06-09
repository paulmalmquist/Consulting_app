# Next session — Healthcare Subscription Analytics

Copy-paste prompt for the next review session.

---

Objective: Review HHA-2 (Funnel, Cohorts, Operations) on the draft PR. Do not merge,
deploy, provision, or start Phase 3/4 without explicit approval.

Current state:
- HHA-1 Exec Overview is shipped.
- HHA-2 is implemented on `codex/hha-phase-2-surfaces`.
- Draft PR: https://github.com/paulmalmquist/Consulting_app/pull/136
- HHA-2 is in review, not shipped, and not deployed.
- ADO Feature #507, Story #508, and Tasks #509-511 track the delivery. Keep Story #508
  Active while the PR awaits acceptance.
- Channel LTV:CAC remains unavailable because channel-specific LTV is not seeded.

Review focus:
1. Confirm all service reads issue `set_config('app.env_id', ..., true)` and filter by
   `env_id`.
2. Confirm masked cohort queries select only cohort month and channel, and masked JSON
   contains no size, retained count, retention rate, revenue, or LTV.
3. Confirm money converts at the service edge and rates remain fractions.
4. Confirm the four pages remain standalone, use `/bos`, share navigation/primitives,
   and retain the NO-PHI banner, drawers, loading/error states, and provenance footer.
5. Review screenshots in
   `repo-b/src/app/lab/env/[envId]/healthcare-subscription/screenshots/`.
6. Re-run:
   - `cd backend && python -m pytest --noconftest tests/test_hha.py -q`
   - `cd repo-b && npm run typecheck`
   - `cd repo-b && npm run db:verify` (requires `DATABASE_URL`; on Windows invoke the
     Node verifier with the environment variable set in PowerShell).

Acceptance outcome:
- If approved, merge only with explicit user approval.
- Backend deployment remains a separate, explicitly approved operation from a clean
  checkout. Verify `/version` before live Phase 2 API checks.
- Do not mark HHA-2 shipped or close Story #508 until review, merge, deployment, and
  production smoke are complete.
