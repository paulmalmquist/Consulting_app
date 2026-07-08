# Relay Smoke Docs Tweak

- Status: Done (first live relay run, 2026-07-07; PR #509)
- Environment: Orchestration
- Risk: Low
- Owner: relay smoke test

## Outcome (live-run evidence)

First real Coding Relay run with live claude/codex CLIs, run id
`20260707-214554-relay-smoke-docs-tweak`. Result: MAX_ITER exit 1 with the
docs change complete and draft PR #509 opened via `--draft-pr`.

All five manual watch-points passed:

| # | Watch-point | Result | Evidence |
|---|---|---|---|
| 1 | Builder edited only the worktree; primary checkout stayed clean | PASS | `git status --porcelain` unchanged vs pre-run baseline |
| 2 | Reviewer stayed artifact-only | PASS | review-meta.json: `codex exec --cd <run>/iterations/01/review-bundle`, adapter `relay_reviewer`, exit 0; no bypass retry needed on Windows |
| 3 | Safety scanner ran each iteration before any PR step | PASS | `iterations/01,02/safety.json` present, `[]` violations |
| 4 | Verdict parsed from structured JSON only | PASS | `verdict.json` both iterations; per-criterion statuses with evidence |
| 5 | Run folder tells the whole story | PASS | 41-file manifest: plan, prompts, diffs, bundles, safety, verdicts, report, PR body, pr.json |

Why MAX_ITER instead of PASS: the reviewer marked every diff-verifiable
criterion met (R1-R3, T5) and honestly refused to mark "met" the criteria
that describe the run itself (run folder created, final report written,
structured verdict returned): those artifacts are not in its bundle, so it
returned `unknown` and `continue`. That is the fail-closed behavior working
as designed. Lesson: write acceptance criteria the reviewer can judge from
the diff and test outputs. Reviewer's own suggestion, now a 0016 follow-up:
include `run.json` and `safety.json` in the review bundle.

Also observed: `should_open_pr: false` in the verdict; the draft PR opened
only because `--draft-pr` on MAX_ITER is the explicit operator override.

## Requested work

Make a small documentation-only improvement to `docs/reference/CODING_RELAY.md` by adding a short "First real run checklist" section near the end of the file (before "Known limitations"). The checklist should tell an operator the five things to verify manually on their first live relay run:

1. The builder edited only the relay worktree; the primary checkout stayed clean.
2. The reviewer stayed artifact-only (no repo access mode).
3. The safety scanner ran on every iteration before any PR step.
4. The verdict was parsed from the structured JSON, not from prose.
5. The run folder tells the whole story: plan, prompts, diff, tests, safety, verdict, final report, PR body.

Keep it terse and in the file's existing style. Do not change any other section.

## Acceptance Criteria

### Screen
- Not applicable.

### API
- Not applicable.

### DB/Data
- Not applicable.

### AI behavior
- The relay must use Claude as builder and Codex as artifact reviewer.
- Codex must return a structured verdict.
- The run must not require repo-access mode for Codex.

### Evals/tests
- Relay run exits cleanly.
- Run folder is created under `.orchestration/runs/`.
- Final report is written.
- PR body is written or draft PR is opened.
- Any skipped tests are reported honestly.

### Regression guard
- No source code outside docs is changed.
- No secrets, deploys, DB migrations, workflow edits, or auth/security changes.
- Existing sections of CODING_RELAY.md are unchanged apart from the new checklist section.
