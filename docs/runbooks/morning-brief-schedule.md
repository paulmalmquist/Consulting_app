# Executive Morning Brief — schedule runbook

The deterministic executive morning brief (Phase 6, PRs 16a/16b) is generated **on demand**.
The on-demand route is the source of truth:

- `POST /api/ade/intel/morning-brief/generate` (env-scoped, idempotent per env/date)
- `GET /api/ade/intel/morning-brief?env_id=...` (today's brief or honest null)
- Manual runner: `python scripts/generate_morning_brief.py --env <env_id> --business <business_id>`

The runner calls the **same service** (`app.services.morning_brief.generate`) as the route, so
scheduled and manual runs are identical. Generation is idempotent — one `story` card per
`(env, brief_date)`; re-running the same day updates the card in place (it never duplicates).

## Intended schedule

Daily **07:00 (after the overnight analyzer / reel / agent runs)**, one brief per active
environment.

## Why the live cron is deferred (not wired in PR 16c)

A live GitHub Actions cron is intentionally **not** added yet. Wiring it safely requires two
things the repo does not provide in a scoped, secret-safe way today:

1. **Production write credentials in CI.** Writing a real brief card means the scheduled job
   needs the production `DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (the existing
   `winston-eval-nightly` cron uses these). Adding a job that writes to production on a timer
   is a larger security decision than this PR should make unilaterally.
2. **Safe environment discovery / fanout.** "One brief per active environment" needs an
   env-discovery step. Fanning out across all environments from a timer — without a vetted,
   scoped discovery query — risks cross-env work and unbounded fanout. The established
   daily-brief scripts in this repo (`hr_daily_decision.py`, `generate_reels.py`,
   `pod_daily_brief.py`) follow the same posture: a runnable script with a documented schedule,
   **no** live cron registration.

So PR 16c ships the **manual runner above** and this runbook. The cron is a follow-up that
should decide explicitly: which secrets the job may use, how active environments are
discovered (a single scoped query, not a broad scan), and per-env isolation.

## When wiring the cron later

- Mirror `.github/workflows/winston-eval-nightly.yml`: a `schedule:` cron (e.g. `0 7 * * *`)
  plus `workflow_dispatch` for manual runs.
- Pass each env explicitly (a secret-backed allowlist or a single scoped discovery query) —
  do **not** scan all environments unscoped.
- Call `scripts/generate_morning_brief.py --env … --business …` per env so the scheduled path
  is the same service the route uses.
- Keep it idempotent (it already is): a re-run on the same day updates, never duplicates.
- The optional LLM narration (16b) stays off unless `MORNING_BRIEF_SUMMARY_ENABLED=true` and a
  provider key is present; the deterministic brief works without it.
