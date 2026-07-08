# 0016 - Coding Relay (Claude implements, Codex reviews, receipts + draft PR)

- Status: PR 1 (runnable spine) implemented; follow-up tickets below are open
- Date: 2026-07-07
- ADO: Story #765 under Feature #764 (Coding Relay) under Epic #359 (Orchestration: Codex + Agent Workflows)
- Risk: Medium (orchestration governance surface; no schema, auth, or prod changes)
- Reference doc: [docs/reference/CODING_RELAY.md](../../../reference/CODING_RELAY.md)
- Code: `orchestration/coding_relay/`, entry `scripts/coding_relay.py`, tests `backend/tests/test_orchestration_relay_*.py`

## Outcome

A local coding cockpit: give it a plan with explicit success criteria and it
validates the plan, preflights the environment, isolates work in a throwaway
worktree on a `relay/<slug>-<timestamp>` branch off fresh `origin/main`, runs
a bounded loop (Claude CLI builds, safety scanner checks the diff, repo tests
run, Codex CLI audits from an artifact bundle and returns a structured JSON
verdict), writes receipts to `.orchestration/runs/<run_id>/`, and on pass
opens a draft PR. It never merges, never force-pushes, never deploys.

Design decisions of record:

- Codex is artifact-review by default: it sees only the run's review bundle,
  never the repo. `--codex-repo-access` is an explicit, recorded escalation.
- `git fetch origin main` failure is a hard stop; `--allow-stale-base` is the
  explicit, recorded override.
- `--dry-run` is strict: no worktree, no branch, no run folder, no writes, no
  provider calls (capability probes only with `--probe-clis`).
- Safety scanner severities: stop (exit 4) for mass deletion, out-of-worktree
  writes or symlinks, unapproved migrations, secrets in the diff; escalate
  (exit 5) for workflow/hook edits, auth surfaces, relay self-edits.
- Adapter core copied (with attribution) from
  `skills/winston-plan-relay/scripts/adapters/`; the proven CLI invocations
  come from `build_review_loop.py` (Ticket 3B lineage). The skill itself is
  untouched.
- `docs/instruction-index.md` is generated from
  `config/instruction-routing.json`; no hand-edited row. Discovery is the
  reference doc, the orchestration README section, and the Makefile `relay`
  target. A routed skill wrapper can come later if wanted.

## Tickets

| # | Ticket | Status |
|---|---|---|
| 1 | Repo inventory and relay architecture | Done (approved plan, 2026-07-07) |
| 2 | Plan intake, validation, preflight, run receipts | Done (PR 1) |
| 3 | Claude/Codex provider adapters with capability probes | Done (PR 1) |
| 4 | Relay loop: bounded build/scan/test/review, verdict JSON | Done (PR 1) |
| 5 | Test/evidence integration (basic suites, honest skips) | Done (PR 1, basic mapping only) |
| 6 | PR body and draft PR creation with manual fallback | Done (PR 1) |
| 7 | Usability wrapper (`make relay`, no-args plan list) | Done (PR 1, non-interactive) |
| 8 | Documentation, fixture dry-run eval, tips.md | Done (PR 1) |

## Adversarial review round (2026-07-07)

A multi-agent review over the finished diff surfaced 48 raw findings; the
confirmed ones were fixed before the PR:

- `--draft-pr` could commit and push a diff a safety stop had flagged
  (including detected secrets). Fixed: PR creation only on PASS or, with
  `--draft-pr`, MAX_ITER; `--no-pr` and `--draft-pr` are mutually exclusive.
- The verdict parser took the first JSON object in reviewer output, so a
  quoted example `{"status": "pass"}` could fake a PASS. Fixed: strict
  whole-output parse first; embedded candidates must carry every schema key
  and the last one wins.
- The scanner diffed against HEAD, so builder-made commits bypassed every
  rule. Fixed: diff against the recorded base sha; builder commits are
  themselves a stop.
- Rename detection hid mass moves from the deletion gate. Fixed:
  `-c diff.renames=false` for the deletion count.
- Redaction missed underscore-prefixed env names, JWTs, PEM blocks, dapi
  and AIza tokens; the same gaps defeated the secrets stop. Fixed with a
  two-tier pattern set (aggressive redaction, high-confidence stop), and
  the stop no longer false-positives on `token = mint_token(user)` code.
- The self-edit escalation could be disabled by plan text mentioning the
  relay. Fixed: always escalates unless `--allow-relay-self-edit` (recorded).
- probe() wrote `--help` caches around the redaction choke point. Fixed.
- Uncaught timeouts/AdapterUnavailable crashed with exit 1 (colliding with
  MAX_ITER). Fixed: preflight/pr subprocess calls degrade, the loop is
  wrapped, exit codes stay truthful, `GIT_TERMINAL_PROMPT=0` on push.
- run_id minute-granularity collisions could corrupt a previous run's
  receipts. Fixed: seconds plus a collision guard.
- FakeProviders could fabricate a default pass on a missing fixture file
  and desynced on verdict retries. Fixed: iteration-keyed, blocked default.
- Plus: dry-run mirrors real exit codes, non-origin bases record a
  freshness warning, honest reviewer prompt under `--codex-repo-access`,
  every skip reason carries the manual command, intake keywords use word
  boundaries, MANUAL_PR.md uses the absolute PR body path.

## Acceptance evidence

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Relay refuses plans without success criteria | PASS | `test_missing_criteria_refused_exit_2` (exit 2, no receipts, no branch) |
| 2 | Fixture E2E: 2-iteration continue-then-pass loop, exit 0, full manifest | PASS | `test_fixture_loop_passes_end_to_end` |
| 3 | Max iterations enforced (exit 1, worktree kept) | PASS | `test_fixture_loop_max_iterations_exit_1` |
| 4 | Safety stop on secret in diff (exit 4, no review after stop) | PASS | `test_secret_written_by_builder_triggers_safety_stop` |
| 5 | `--draft-pr` never publishes a safety-stopped diff | PASS | `test_draft_pr_never_fires_after_safety_stop` (no commit, no MANUAL_PR) |
| 6 | Exit 5 routes: blocked, risk_escalation, escalate-scan, garbage verdict | PASS | four `..._exit_5` tests; scan route asserts no verdict.json |
| 7 | Exit 6 (builder failure) and exit 3 (missing CLIs) | PASS | `test_builder_failure_exit_6`, `test_missing_clis_exit_3` |
| 8 | Fetch failure hard stop; `--allow-stale-base` recorded | PASS | `test_fetch_failure_is_hard_stop_exit_2`, `test_allow_stale_base_proceeds_and_is_recorded` |
| 9 | Builder commits cannot bypass the scanner | PASS | `test_snapshot_diffs_against_base_even_after_builder_commit` |
| 10 | PR fallback writes MANUAL_PR.md with `--draft` and absolute body path | PASS | `test_pass_without_pr_flags_degrades_to_manual_pr` |
| 11 | Strict dry run writes nothing, mirrors exit codes | PASS | `test_dry_run_writes_nothing` + manual run on this repo |
| 12 | Secrets redacted in every receipt; decoy verdicts rejected | PASS | planted `ghp_...` swept across the run folder; 4 decoy tests |
| 13 | Ruff clean; all relay tests green | PASS | 78 passed locally (61 unit + 17 E2E); ruff clean on package + tests |

## Follow-up tickets (open)

- Guided interactive flow: numbered plan menu, paste mode, criteria
  confirm/edit screen, per-iteration continue prompts, final PR offer.
- Cockpit UI: read-only viewer over `.orchestration/runs/` (self-contained
  HTML status page per run). The `run.json` state schema from PR 1 is the
  data contract.
- Broader test inference: Playwright/e2e, AI-eval suites, migration/schema
  verification classes.
- Review-bundle completeness (reviewer-suggested, plan 0017): include
  `run.json` and the iteration's `safety.json` in the bundle so run-level
  criteria are judgeable.
- PR polish: `scripts/winston/merge_gate.ps1` integration, richer evidence
  linking, approve-and-continue flag for escalations.
- Optional: routed skill wrapper so the relay is discoverable through the
  instruction registry.

## Honest caveats

- PR 1 is non-interactive; `--yes` is a forward-compatibility no-op.
- First live run completed 2026-07-07 (plan 0017, run
  `20260707-214554-relay-smoke-docs-tweak`, draft PR #509): full loop worked
  with real CLIs; Codex default sandbox succeeded on Windows from the bundle
  dir (adapter `relay_reviewer`, no 1312 bypass retry). The run ended
  MAX_ITER because the smoke plan's criteria described the run itself,
  which the reviewer cannot verify from its bundle; that honesty is by
  design. Write criteria the reviewer can judge from the diff.
- Out-of-worktree containment is diff-based plus the Claude CLI's own
  edit scoping; `--claude-permission-mode bypassPermissions` weakens it and
  is recorded as an escalation, not blocked.
- The adversarial review's verification phase was cut short by a session
  usage limit; the 48 raw findings were verified and triaged by hand
  against the code instead of by independent verifier agents.
- `python -m orchestration.coding_relay` needs cwd at repo root; the wrapper
  script works from anywhere.
- Ruff is not CI-gated for `orchestration/`; it was run manually for PR 1.
