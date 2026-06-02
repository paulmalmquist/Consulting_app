# Winston Coding Session Instructions

Operating protocol for any coding session in this repo. Prompts reference this
file as the "before coding" step; it intentionally defers to the canonical
router rather than duplicating it.

## 1. Router first

`CLAUDE.md` at the repo root is the canonical router and source of truth for
repo-local behavior. Read it first and follow its routing precedence, intent
taxonomy, owning-surface map, and guardrails. Downstream `agents/*.md`,
`skills/*.md`, `.skills/*.md`, and selected `docs/*.md` own the actual work;
`CLAUDE.md` decides which.

## 2. Plans

- Active implementation plans live in
  `docs/plans/03-implementation-plans/active/` as `NNNN-environment-short-title.md`.
- Follow `docs/plans/PLAN_MAINTENANCE_RULES.md`. Update the active plan for the
  work in flight before coding; record scope, files, acceptance criteria, test
  plan, and what is explicitly out of scope.
- Use concrete `path:line` references in plans and reports, never vague names.

## 3. Dirty-tree discipline

The working tree is frequently dirty with unrelated, intentionally-preserved
workstreams. Before coding, run `git status` and identify what is *not* yours.

- Never stage, commit, reformat, revert, or push files outside the current
  ticket's scope.
- When a shared file (e.g. `backend/app/main.py`, `docs/tips.md`, `CLAUDE.md`)
  contains both your change and someone else's, split it: stage only your hunks
  (`git apply --cached` on a filtered patch is reliable here; interactive
  `git add -p` is not available in this environment).
- Before every commit run `git diff --cached --name-only` and confirm no
  out-of-scope paths are staged.
- Branch off `main` for new work unless the ticket explicitly continues an
  existing feature branch / open PR.
- Commit and push only when the ticket asks. Keep commits scoped to one logical
  change. Co-author trailer:
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

## 4. Verification before claiming done

- Run the narrowest useful backend tests plus the relevant regression suite
  (e.g. the feature's test file + `tests/test_pitch_forge_constraints.py`).
- Run `cd repo-b && npm run typecheck` when frontend files changed.
- Prefer a real-DB `TestClient` smoke (`load_dotenv("backend/.env")`,
  `PYTHONPATH=.` from `backend/`) under a throwaway `env_id`, cleaning up rows
  afterward, over claiming behavior works untested. There is no `uvicorn` in the
  local env.
- Apply migrations with `supabase db query --linked` (the Supabase CLI), not
  `node apply.js` (strict SSL fails locally); use
  `node apply.js --files NNN --dry-run` only for SQL-parse validation.
- Never claim tests passed without running them. Report skips and failures
  honestly with output.

## 5. Reporting

End substantial sessions with: files changed, tests run + results,
API/live evidence, plan updates, `tips.md` updates, commit hash, final
`git status`, confirmation that unrelated diffs remain untouched, and the next
recommended ticket. Record durable, repo-specific lessons in `docs/tips.md`
(not buried in plan files).

## 6. Infrastructure

Follow the `CLAUDE.md` "Infrastructure CLI Guardrails" — use the Vercel,
Railway, Supabase, and GitHub CLIs directly; never hand the user a dashboard.
Confirm before hard-to-reverse or outward-facing actions unless the active
plan/approval already authorized them.
