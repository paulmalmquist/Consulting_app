# Coding Relay - reference

A local coding cockpit for the Winston repo. You give it an implementation
plan with explicit success criteria. It isolates the work in a throwaway git
worktree, has the Claude CLI implement in bounded passes, has the Codex CLI
audit each pass against the criteria, runs the repo's real tests, and ends
with receipts and (on pass) a draft PR. It is controlled automation with
checkpoints, not an autonomous agent: every stop condition halts the run and
tells you what to do next. It never merges, never force-pushes, never
deploys.

## Launch

```
python -m orchestration.coding_relay --plan <path|NNNN>   # from repo root
python scripts/coding_relay.py --plan <path|NNNN>         # from anywhere
make relay ARGS="--plan 0016"                             # POSIX shells
```

Run with no arguments to get usage plus a numbered list of the active plans
in `docs/plans/03-implementation-plans/active/`.

## Required CLIs

| CLI | Role | If missing |
|---|---|---|
| `claude` | Builder (edits files in the worktree) | hard stop, exit 3 |
| `codex` | Reviewer (reads the artifact bundle) | hard stop, exit 3 |
| `gh` | Draft PR creation | degrade: PR body + MANUAL_PR.md |
| `git` | Everything | hard stop |

Model flags are gated on each CLI's `--help` output (cached in the run
folder). If the installed CLI does not advertise model selection, the relay
uses the CLI default and records that fact in `run.json`.

## Plan format

The relay refuses vague work (exit 2). A plan must contain a heading named
`Success Criteria`, `Acceptance Criteria`, or `Definition of Done` followed
by concrete bullets. Criteria are normalized into six sections with stable
ids the reviewer judges one by one:

```
## Acceptance Criteria

### Screen          (S1, S2, ...)
### API             (A1, ...)
### DB/Data         (D1, ...)
### AI behavior     (B1, ...)
### Evals/tests     (T1, ...)
### Regression guard (R1, ...)
```

Sections that do not apply render "Not applicable." Bullets that fit no
section land in a General (G) group. The normalized form is written to
`plan/normalized-criteria.md` in the run folder.

Provide the plan by path (`--plan docs/plans/.../0016-foo.md`), by active-dir
prefix (`--plan 0016`), or as pasted text saved to a file
(`--paste-file my-task.md`).

## How Claude and Codex divide the work

Claude is the only writer. Each iteration it runs as
`claude -p --permission-mode acceptEdits --add-dir <worktree>` with cwd
pinned to the worktree, receives the plan, the normalized criteria, prior
reviewer feedback, and failing-test excerpts, and edits files.

Codex never edits and, by default, never sees the repo. After each build
pass the relay assembles a review bundle (diff, changed-file list, test
summary, builder summary) under
`iterations/NN/review-bundle/` and runs
`codex exec --cd <bundle-dir> --skip-git-repo-check -m <model>
-c model_reasoning_effort=<effort> -`. Codex must answer with one JSON
verdict: `pass`, `continue`, `blocked`, or `risk_escalation`, plus
per-criterion status, required next steps, plan refinements, and risk flags.
On `continue`, that feedback goes into the next Claude pass. The review on
the final allowed iteration runs at `--codex-max-effort`.

`--codex-repo-access` gives Codex the prototype's full-worktree invocation
instead. That is a recorded risk escalation: it lands in `run.json`, the
final report, and the PR body.

If Codex output cannot be parsed as the JSON verdict, the relay retries once
with a JSON-only nudge, then treats the review as blocked. A parse failure
is never treated as approval.

## Loop and exit codes

`INTAKE -> PREFLIGHT -> WORKTREE -> [BUILD -> SCAN -> TEST -> REVIEW] x N -> FINALIZE`

| Exit | Meaning |
|---|---|
| 0 | PASS: every criterion met or not applicable, no risk flags |
| 1 | Max iterations reached (default 3, `--max-iterations`); worktree kept |
| 2 | Intake or preflight refusal (missing criteria, bad plan, failed fetch) |
| 3 | `claude` or `codex` CLI missing |
| 4 | Safety stop (see hard stops below) |
| 5 | Blocked or risk escalation; a human decides how to proceed |
| 6 | Provider or internal error (nonzero exit, timeout) |

A final report and PR body are written on every run that gets past
preflight, whatever the outcome.

## Hard stops and safety rules

Stop (exit 4), checked after every build pass against the diff from the
recorded base commit (so changes smuggled into builder-made commits are
still seen; builder commits are themselves a stop, the relay owns commits):

- more than 100 deleted files, counted with git rename detection off so a
  mass move counts too (stricter than `.githooks/pre-commit`)
- tracked writes resolving outside the relay worktree, `..` traversal, or
  any new symlink in the diff
- DB schema/migration paths (`supabase/`, `repo-b/db/schema/`, any
  `migrations/`) without `--allow-migrations`
- high-confidence secret shapes in added lines (known token prefixes, JWTs,
  PEM headers, DB URLs with credentials, quoted literal assignments to
  secret-named keys; ordinary code like `token = mint_token(user)` does not
  trip it)

Escalate (exit 5): `.github/` or `.githooks/` edits, root `Makefile` or
`dev.sh` edits, auth/security surface edits, or any edit to
`orchestration/coding_relay/` itself (override only with the recorded
`--allow-relay-self-edit` flag; plan wording never disables this).

Structural rules with no override: the relay never calls `gh pr merge`,
never force-pushes (`GIT_TERMINAL_PROMPT=0`, no credential prompts), never
deploys, never deletes worktrees, and PR creation always passes `--draft`.
Preflight `git fetch origin main` failure is a hard stop unless you pass
`--allow-stale-base` (recorded in the receipts); a non-origin `--base` skips
the fetch and is recorded as a freshness warning. Every artifact write goes
through the secret-redaction choke point (including the CLI `--help`
caches), and the relay never prints environment variables.

Containment honesty: the outside-worktree stop is diff-based. It sees what
git sees inside the worktree; a builder writing to an absolute path
elsewhere on disk is contained by the Claude CLI's own `acceptEdits`
scoping, not by the scanner. `--claude-permission-mode bypassPermissions`
weakens that boundary and is therefore recorded as an escalation in
`run.json` and the report.

## Tests

Suites are inferred from changed paths and run inside the worktree with the
CI-matching commands:

| Changed | Suites |
|---|---|
| `backend/**` | `python -m ruff check app tests`, `python -m pytest tests -q` |
| `repo-b/**` | `npm run lint`, `npm run typecheck`, `npm run test:unit` |
| `rs_factory_seed/**` | `python -m pytest tests -q` |
| backend, repo-b, or verification | `python -m verification.lint.no_legacy_repe_reads --json` |

The backend interpreter prefers `backend/.venv` (worktree, then primary
checkout) and falls back to the PATH interpreter, recording which. Missing
prerequisites (no node_modules junction, no interpreter) produce a SKIPPED
result with the exact manual command. Results are recorded as-is; the relay
never claims a test passed unless it ran and exited 0. Playwright/e2e and
AI-eval inference are follow-up scope (plan 0016).

## Run folder

Receipts live under `.orchestration/runs/<run_id>/` (git-ignored):

```
run.json                        config, state, base sha, models, exit code
plan/original-plan.md           plan/normalized-criteria.md
env/preflight.json              env/claude-help.txt  env/codex-help.txt
iterations/NN/build-prompt.md   build-output.md  build-meta.json
iterations/NN/diff.patch        diff-stat.txt    safety.json
iterations/NN/review-bundle/    diff.patch, files.txt, tests-summary.md, ...
iterations/NN/tests/<suite>.log tests/summary.json
iterations/NN/review-prompt.md  review-output.txt  verdict.json
report/final-report.md          report/PR_BODY.md  report/pr.json | MANUAL_PR.md
```

The relay worktree lives outside the repo in a short sibling directory
(default `<repo-parent>/<repo>_relay/r-<slug8>-<hhmmss>`, override with
`--worktree-root`) on branch `relay/<slug>-<timestamp>`.

## PR creation

On PASS the relay commits everything in the worktree, pushes the relay
branch, and opens a DRAFT PR against `main` with the PR body from
`report/PR_BODY.md` (plan, criteria checklist, files changed, tests,
evidence paths, reviewer verdicts, risks, rollback). `--draft-pr` extends
that to MAX_ITER runs only; nothing is ever committed or pushed after a
safety stop, a block, or an error, because publishing a diff the scanner
flagged would defeat the safety layer. `--no-pr` and `--draft-pr` are
mutually exclusive. A reviewer that passes the work but sets
`should_open_pr` to false suppresses the automatic PR (force with
`--draft-pr`). If `gh` is missing or unauthenticated, or the push fails,
the relay writes `report/MANUAL_PR.md` with the exact commands instead.

## Dry run

`--dry-run` is strict: it validates the plan, runs read-only preflight (no
fetch, no write probes), prints the normalized criteria and every command a
real run would execute, and exits without creating a worktree, branch, run
folder, or any file. It mirrors the real exit codes (3 for a missing
provider CLI, 2 for any other failed check), so it works as an automation
gate. Add `--probe-clis` to also run the `--help` capability probes (the
only provider invocations allowed in a dry run).

`--fixture <dir>` drives the whole loop from scripted fake providers (see
`orchestration/coding_relay/fixtures/demo/`): no CLIs, no tokens. This is
how the E2E tests exercise the loop.

## Failure recovery

- The relay never cleans up after itself; every run prints and records the
  exact `git worktree remove` and `git branch -D` commands.
- Exit 1 (max iterations): inspect the worktree, then either finish by hand
  or re-run with a sharper plan. The diff survives in the worktree and in
  `iterations/NN/diff.patch`.
- Exit 4/5: read `iterations/NN/safety.json` or the last `verdict.json`,
  decide, act by hand. The relay does not continue past a stop on its own.
- Exit 6: read `iterations/NN/build-stderr.txt` or `review-stderr.txt`.
- Stale worktree path collision: remove the old worktree (command above) or
  pass a different `--worktree-root`.

## Known limitations (PR 1)

- Non-interactive: no guided menu flow yet; `--yes` is accepted as a no-op
  for forward compatibility. Run with no args to see the plan list.
- Test inference covers the four basic suite groups only.
- Escalations (exit 5) have no generic approve-and-continue flag; a human
  finishes by hand or re-runs (`--allow-relay-self-edit` and
  `--allow-migrations` are the only scoped overrides).
- The secrets stop has no override: a fixture with a quoted dummy
  credential will stop the run; rename the dummy or drop the quotes.
- The cockpit UI is a planned follow-up
  (`docs/plans/03-implementation-plans/active/0016-coding-relay-agent.md`).

## Relay tests

```
cd backend && python -m pytest tests/test_orchestration_relay_*.py -q
python -m ruff check orchestration/coding_relay scripts/coding_relay.py
```
