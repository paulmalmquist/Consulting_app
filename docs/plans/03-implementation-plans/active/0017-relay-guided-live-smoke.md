# Relay Guided Live Smoke

- Status: Done (live guided run, 2026-07-08)
- Environment: Orchestration
- Risk: Low

## Live guided run - evidence

- **Command:** `python scripts/coding_relay.py` (guided mode, real prompts, no `--yes`), max 2 iterations. Driven with the exact operator answer sequence (select plan 24, confirm criteria Y, confirm warnings y, start Y, continue after iter 1 Y, PR offer N). Invoked via a thin runner that injects only `input_fn`; `print_fn` uses the relay's own `safe_print` default, matching `main() -> run_guided(args)`.
- **Selected plan:** `docs/plans/03-implementation-plans/active/0017-relay-guided-live-smoke.md` (menu entry 24).
- **Result status:** MAX_ITER (exit 1). Correct, honest outcome: not a pass, worktree preserved.
- **Worktree path:** `C:/Projects/cons_wt_relay_relay/r-relay-gu-090916` (branch `relay/relay-guided-live-smoke-20260708-090916`, base `1161fdcb`).
- **Run folder:** `.orchestration/runs/20260708-090916-relay-guided-live-smoke/`.
- **Codex artifact-only:** Yes, both iterations. `review-meta.json` shows `codex exec --cd <run>/iterations/NN/review-bundle`, adapter `relay_reviewer`, exit 0, no `--dangerously-bypass-approvals-and-sandbox` retry.
- **Safety before PR:** Yes. `iterations/01,02/safety.json` present (`[]` violations), written before any PR step.
- **Guided prompts:** All fired in order and behaved correctly. Menu selection, criteria preview, warnings confirmation (surfaced the real `backend-venv` WARN, default N, accepted with `y`), start approval (default Y), continue prompt after iteration 1 (default Y), and the MAX_ITER operator-override PR prompt (default N).
- **Tests run/skipped:** None run (docs-only change, no matching changed paths). Reported honestly as `No suites were run.` in `tests-summary.md` and the report.
- **PR URL:** None opened by the relay. Operator declined the MAX_ITER override at the prompt.
- **Manual operator override:** The relay's docs diff was correct in substance but claimed the review bundle "includes a primary-checkout `git status` snapshot", a bundle feature that does not exist yet (which is itself why the reviewer left R3 `unknown`). Rather than ship a relay-authored PR containing that slightly-wrong sentence, the operator adopted the diff by hand with a one-line correction (reframing the snapshot as a planned improvement, not a current bundle artifact) and shipped it through the normal PR flow with this evidence. This is the intended operator-judgment path for MAX_ITER.
- **Reviewer verdict (iteration 2):** 6 of 10 criteria met (T1-T4, R1-R2, each cited to a named bundle artifact: `run-meta.json`, `manifest.txt`, `tests-summary.json`, `files.txt`, `safety.json`, `diff.patch`), 4 unknown (B1-B3 AI-role provenance not verifiable from the bundle; R3 checkout-cleanliness snapshot not in the bundle). The PR 2 bundle improvements demonstrably worked: run-level criteria that were `unknown` in the first live run (2026-07-07, plan `0017-relay-smoke-docs-tweak`) are now `met` from named artifacts.
- **Bug NOT found:** the first test-harness attempt crashed on a cp1252 `UnicodeEncodeError` printing a plan title containing an emoji, but only because the harness passed the builtin `print`; the relay's real no-args path uses `safe_print` and is crash-safe (verified: `main() -> run_guided(args)` with the `safe_print` default). No relay defect.
- **Cleanup:** `git -C C:/Projects/cons_wt_relay worktree remove --force C:/Projects/cons_wt_relay_relay/r-relay-gu-090916` and `git -C C:/Projects/cons_wt_relay branch -D relay/relay-guided-live-smoke-20260708-090916` (run after adopting the diff).

## Requested work

Add a short "Guided live smoke checklist" section to `docs/reference/CODING_RELAY.md`.

The section should explain the safest first live run after installing the relay:
- start with a docs-only plan,
- inspect the normalized criteria,
- confirm preflight warnings,
- review the run folder,
- only open a draft PR if the result is PASS or the operator intentionally overrides MAX_ITER.

## Acceptance Criteria

### Screen
- Not applicable.

### API
- Not applicable.

### DB/Data
- Not applicable.

### AI behavior
- Claude is used as the builder.
- Codex is used as artifact-only reviewer.
- Codex returns structured per-criterion review JSON.

### Evals/tests
- The relay creates a run folder under `.orchestration/runs/`.
- The run folder includes plan, normalized criteria, safety output, review bundle, verdict, final report, and PR body or PR receipt.
- Any skipped tests are reported honestly.
- The docs change is visible in `docs/reference/CODING_RELAY.md`.

### Regression guard
- No non-doc source files are changed unless the relay explicitly documents why.
- No DB migrations, workflow edits, auth/security edits, deploys, force pushes, or merges occur.
- Primary checkout remains clean except for intentionally adopted evidence updates.
