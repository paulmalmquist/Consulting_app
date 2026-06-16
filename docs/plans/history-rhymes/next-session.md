# Next Session — History Rhymes

**Last updated:** 2026-06-12

## Status

All 16 PRs of the telemetry-cockpit refactor are committed and open:

| PR | GitHub | ADO | Scope |
|---|---|---|---|
| 1–9 | #156–#164 | #541–#549 | Done, merged |
| 10 | #167 | #550 | Evidence drawer — open, stacked |
| 11 | #170 | #551 | Kafka consumer scaffold — open, stacked |
| 12 | #172 | #552 | Persist + migration 10017 — open, stacked |
| 13 | #173 | #553 | Live cockpit updates — open, stacked |
| 14 | #173 | #554 | Research/planning demotion — open, stacked |
| 15 | #174 | #555 | Episodes + calibration — open, stacked |
| 16 | #175 | #556 | Polish + hardening — open, stacked |

## Remaining before ship

1. **Apply schema migration 10017** (`repo-b/db/schema/10017_history_rhymes_streaming.sql`) to Supabase.
   ```bash
   supabase link --project-ref ozboonlsplroialdwuxj
   supabase db push
   ```
2. **Merge stacked PRs in order** — retarget each PR to main before merge once the prior PR lands. Do not delete base branches until the next PR has been retargeted.
3. **Degraded-backend Playwright pass** (PR 16 gate that requires a live environment): run `npx playwright test tests/historyrhymes-cockpit.spec.ts` with the backend intentionally down; confirm all zones show explicit fail-closed state, no blank zones.
4. **Confluent live connection** (optional, post-merge): set `HR_STREAM_MODE=live_kafka` + Confluent credentials; verify health chip transitions to "connected".

## Copy-paste prompt for next Claude Code session

```
You are working on the History Rhymes telemetry-cockpit refactor in Winston / Consulting_app.

All 16 PRs are committed and open (see docs/plans/history-rhymes/next-session.md for the PR table).
The immediate action is to merge stacked PRs in order, starting from the lowest-numbered open PR
and retargeting each to main before merge.

After merges, run:
  supabase link --project-ref ozboonlsplroialdwuxj && supabase db push  # applies 10017
  cd repo-b && npx vitest run src/components/historyrhymes/ src/lib/historyrhymes/
  cd repo-b && npm run typecheck

Hard rules (from the dispatch record):
- Do not rename or reshape /api/hr/v1/* or /api/v1/rhymes/*.
- Fail closed: every zone renders an explicit degraded/empty state with a concrete reason string.
- Degraded_reason strings from the backend matrix appear verbatim in UI and tests.
- v1 placeholder scenarios render as pending, never as real probabilities.
- No silent stream fallback; mode and source always labeled.
- Cockpit copy avoids buy/sell/trade/position-size language.

Update docs/plans/history-rhymes/{backlog,next-session}.md and the dispatch record status table
before finishing. Reusable lessons go to docs/tips.md.
```

## Context notes
- Branch chain: stacked PRs off main (`feat/hr-cockpit-NN-*`). Retarget each to main before merge once the prior PR lands. Do not delete base branches until the next PR in the stack has been retargeted.
- The execution layer skill (`skills/historyrhymes-execution-layer/SKILL.md`) owns the daily decision routine; the cockpit consumes its outputs read-only.
- Schema file is `repo-b/db/schema/10017_history_rhymes_streaming.sql` (10015 = telemetry streaming, 10016 = factory NCR intelligence, 10017 = HR streaming).
- `tips.md` is at `docs/tips.md` — confirmed canonical path. HR cockpit streaming conventions were appended in PR 16.
